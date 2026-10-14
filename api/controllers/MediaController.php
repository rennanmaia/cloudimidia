<?php
declare(strict_types=1);

class MediaController
{
    private const TYPES = [
        'jpg' => ['image', 'image/jpeg'], 'jpeg' => ['image', 'image/jpeg'], 'png' => ['image', 'image/png'],
        'gif' => ['image', 'image/gif'], 'webp' => ['image', 'image/webp'],
        'mp4' => ['video', 'video/mp4'], 'm4v' => ['video', 'video/mp4'], 'webm' => ['video', 'video/webm'], 'ogv' => ['video', 'video/ogg'],
        'mp3' => ['audio', 'audio/mpeg'], 'ogg' => ['audio', 'audio/ogg'], 'wav' => ['audio', 'audio/wav'],
        'm4a' => ['audio', 'audio/mp4'], 'aac' => ['audio', 'audio/aac'],
    ];

    private const CHUNK_MAX = 12 * 1024 * 1024;

    public static function index($org): void
    {
        $ctx = org_ctx($org);
        $where = 'm.organization_id = ?';
        $params = [$ctx->id()];
        if ($ctx->isGuest()) {
            $where .= ' AND m.uploaded_by = ?';
            $params[] = $ctx->userId();
        }
        $type = query('type');
        if (in_array($type, ['image', 'video', 'audio'], true)) {
            $where .= ' AND m.type = ?';
            $params[] = $type;
        }
        $q = trim((string)query('q', ''));
        if ($q !== '') {
            $where .= ' AND m.name LIKE ?';
            $params[] = '%' . $q . '%';
        }
        $rows = DB::all(
            "SELECT m.*, u.name AS uploader_name,
                (SELECT COUNT(DISTINCT pi.playlist_id) FROM playlist_items pi WHERE pi.media_id = m.id) AS usage_count
             FROM media m LEFT JOIN users u ON u.id = m.uploaded_by WHERE $where ORDER BY m.id DESC",
            $params
        );
        respond([
            'media' => array_map(fn($m) => Manifest::formatMedia($m) + [
                'uploader_name' => $m['uploader_name'],
                'usage_count' => (int)$m['usage_count'],
                'can_edit' => $ctx->canEditOwned($m['uploaded_by'] !== null ? (int)$m['uploaded_by'] : null),
            ], $rows),
            'usage' => org_usage($ctx->id()),
            'max_storage_mb' => $ctx->org['max_storage_mb'] !== null ? (int)$ctx->org['max_storage_mb'] : null,
            'max_upload_mb' => (int)config('max_upload_mb', 1024),
            'max_chunk_bytes' => max_chunk_bytes(),
        ]);
    }

    /**
     * Upload em partes (chunks) para suportar vídeos grandes e conexões móveis.
     * Campos: upload_id, chunk_index, total_chunks, total_size, name, file (blob)
     * Na última parte (opcional): thumbnail (blob jpg), duration, width, height
     */
    public static function upload($org): void
    {
        $ctx = org_ctx($org);
        $ctx->requireCreateContent();

        $uploadId = preg_replace('/[^a-zA-Z0-9]/', '', (string)input('upload_id', ''));
        if (strlen($uploadId) < 8 || strlen($uploadId) > 64) abort('Identificador de envio inválido.', 422);
        $index = (int)input('chunk_index', 0);
        $total = max(1, (int)input('total_chunks', 1));
        $totalSize = (int)input('total_size', 0);
        $name = str_input('name', 190);
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset(self::TYPES[$ext])) abort('Formato não suportado. Envie imagens (JPG, PNG, WEBP, GIF), vídeos (MP4, WEBM) ou áudios (MP3, M4A, OGG, WAV).', 422);

        $file = $_FILES['file'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            $tooBig = $file && in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true);
            abort($tooBig ? 'Parte do arquivo maior que o limite do servidor.' : 'Falha ao receber o arquivo. Tente novamente.', 422, ['max_chunk_bytes' => max_chunk_bytes()]);
        }
        if ($file['size'] > self::CHUNK_MAX) abort('Parte do arquivo maior que o permitido.', 422);

        $maxUpload = (int)config('max_upload_mb', 1024) * 1024 * 1024;
        if ($totalSize > $maxUpload) abort('Arquivo muito grande. Limite de ' . config('max_upload_mb') . ' MB.', 422);

        $tmpDir = STORAGE_DIR . '/tmp';
        ensure_dir($tmpDir);
        $part = $tmpDir . '/' . $ctx->userId() . '_' . $uploadId . '.part';

        if ($index === 0) {
            $limit = $ctx->org['max_storage_mb'];
            if ($limit !== null && org_usage($ctx->id())['storage_bytes'] + $totalSize > (int)$limit * 1024 * 1024) {
                abort('Espaço de armazenamento esgotado. Exclua mídias antigas ou amplie seu plano.', 422);
            }
            if (is_file($part)) @unlink($part);
            // Limpa envios abandonados há mais de 1 dia
            foreach (glob($tmpDir . '/*.part') ?: [] as $old) {
                if (filemtime($old) < time() - 86400) @unlink($old);
            }
        } elseif (!is_file($part)) {
            abort('Envio não encontrado. Reinicie o upload.', 422);
        }

        $out = fopen($part, $index === 0 ? 'wb' : 'ab');
        $in = fopen($file['tmp_name'], 'rb');
        stream_copy_to_stream($in, $out);
        fclose($in);
        fclose($out);
        clearstatcache(true, $part);

        if ($index < $total - 1) {
            if (filesize($part) > $maxUpload) {
                @unlink($part);
                abort('Arquivo muito grande.', 422);
            }
            respond(['received' => $index + 1]);
        }

        // Última parte: valida e move para o armazenamento definitivo
        [$type, $mime] = self::TYPES[$ext];
        $size = filesize($part);
        if ($totalSize && $size !== $totalSize) {
            @unlink($part);
            abort('O arquivo chegou incompleto. Tente novamente.', 422);
        }
        $width = int_or_null(input('width'));
        $height = int_or_null(input('height'));
        if ($type === 'image') {
            $info = @getimagesize($part);
            if (!$info) {
                @unlink($part);
                abort('A imagem enviada é inválida.', 422);
            }
            [$width, $height] = $info;
            $mime = $info['mime'];
        } else {
            // checagem básica de conteúdo: não aceitar texto/scripts disfarçados
            $head = file_get_contents($part, false, null, 0, 64);
            if (preg_match('/<\?php|<script|<html/i', (string)$head)) {
                @unlink($part);
                abort('Arquivo inválido.', 422);
            }
        }

        $dir = 'org_' . $ctx->id() . '/media';
        ensure_dir(UPLOAD_DIR . '/' . $dir);
        $base = date('Ym') . '_' . random_token(8);
        $rel = $dir . '/' . $base . '.' . ($ext === 'jpeg' ? 'jpg' : $ext);
        if (!rename($part, UPLOAD_DIR . '/' . $rel)) {
            @unlink($part);
            abort('Não foi possível salvar o arquivo.', 500);
        }

        $thumbRel = null;
        $thumb = $_FILES['thumbnail'] ?? null;
        if ($thumb && $thumb['error'] === UPLOAD_ERR_OK && $thumb['size'] < 2 * 1024 * 1024 && @getimagesize($thumb['tmp_name'])) {
            $thumbRel = 'org_' . $ctx->id() . '/thumbs/' . $base . '.jpg';
            ensure_dir(UPLOAD_DIR . '/org_' . $ctx->id() . '/thumbs');
            move_uploaded_file($thumb['tmp_name'], UPLOAD_DIR . '/' . $thumbRel);
        }

        $duration = input('duration');
        $displayName = str_input('display_name', 190) ?: preg_replace('/\.[^.]+$/', '', $name);
        $id = DB::insert('media', [
            'organization_id' => $ctx->id(),
            'type' => $type,
            'name' => $displayName ?: 'Sem nome',
            'file_path' => $rel,
            'thumb_path' => $thumbRel,
            'mime' => $mime,
            'size_bytes' => $size,
            'duration' => is_numeric($duration) && $duration > 0 ? round((float)$duration, 2) : null,
            'width' => $width,
            'height' => $height,
            'uploaded_by' => $ctx->userId(),
            'created_at' => now(),
        ]);
        log_activity($ctx->id(), 'media.uploaded', "Mídia \"$displayName\" enviada");
        $row = DB::one('SELECT * FROM media WHERE id = ?', [$id]);
        respond(['media' => Manifest::formatMedia($row) + ['usage_count' => 0, 'can_edit' => true, 'uploader_name' => $ctx->user['name']]], 201);
    }

    private static function find(OrgCtx $ctx, $id): array
    {
        $m = DB::one('SELECT * FROM media WHERE id = ? AND organization_id = ?', [(int)$id, $ctx->id()]);
        if (!$m) abort('Mídia não encontrada.', 404);
        if (!$ctx->canEditOwned($m['uploaded_by'] !== null ? (int)$m['uploaded_by'] : null)) abort('Você não tem permissão para alterar esta mídia.', 403);
        return $m;
    }

    public static function update($org, $id): void
    {
        $ctx = org_ctx($org);
        $m = self::find($ctx, $id);
        required(['name' => 'o nome']);
        $data = ['name' => str_input('name', 190)];
        if (has_input('duration') && $m['type'] !== 'image' && is_numeric(input('duration'))) {
            $data['duration'] = round((float)input('duration'), 2);
        }
        DB::update('media', $data, 'id = ?', [$m['id']]);
        respond(['ok' => true]);
    }

    public static function destroy($org, $id): void
    {
        $ctx = org_ctx($org);
        $m = self::find($ctx, $id);
        DB::exec('DELETE FROM media WHERE id = ?', [$m['id']]);
        delete_upload($m['file_path']);
        delete_upload($m['thumb_path']);
        log_activity($ctx->id(), 'media.deleted', "Mídia \"{$m['name']}\" excluída");
        respond(['ok' => true]);
    }
}
