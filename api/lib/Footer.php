<?php
declare(strict_types=1);

/**
 * Barra inferior configurável das playlists.
 *
 * Formato salvo em playlists.footer (JSON):
 * {
 *   "enabled": true, "size": "sm|md|lg", "speed": "slow|normal|fast",
 *   "background": "#111827", "color": "#ffffff", "accent": "#6366f1",
 *   "slots": [ { "type": "logo|image|news|text|weather|clock|currency|sports", ...opções } ]
 * }
 */
class Footer
{
    /** Tipo de slot => tipo de integração exigido */
    private const INTEGRATION_SLOTS = ['news' => 'rss', 'weather' => 'weather', 'currency' => 'currency', 'sports' => 'sports', 'futdigital' => 'futdigital'];
    private const TYPES = ['logo', 'image', 'news', 'text', 'weather', 'clock', 'currency', 'sports', 'futdigital'];
    private const MAX_SLOTS = 8;

    public static function sanitize(int $orgId, $input): ?array
    {
        if (!is_array($input)) return null;
        $pick = fn($k, array $opts, $def) => in_array($input[$k] ?? null, $opts, true) ? $input[$k] : $def;
        $footer = [
            'enabled' => filter_var($input['enabled'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'size' => $pick('size', ['sm', 'md', 'lg'], 'md'),
            'speed' => $pick('speed', ['slow', 'normal', 'fast'], 'normal'),
            'background' => valid_color($input['background'] ?? null, '#111827'),
            'color' => valid_color($input['color'] ?? null, '#ffffff'),
            'accent' => valid_color($input['accent'] ?? null, '#6366f1'),
            'slots' => [],
        ];

        foreach (array_slice((array)($input['slots'] ?? []), 0, self::MAX_SLOTS) as $s) {
            if (!is_array($s) || !in_array($s['type'] ?? null, self::TYPES, true)) continue;
            try {
                $footer['slots'][] = self::sanitizeSlot($orgId, $s);
            } catch (ApiError $e) {
                // Barra desligada: elementos incompletos são apenas descartados
                if ($footer['enabled']) throw $e;
            }
        }
        return $footer;
    }

    private static function sanitizeSlot(int $orgId, array $s): array
    {
        $type = $s['type'];
        $slot = ['type' => $type];
        if (isset(self::INTEGRATION_SLOTS[$type])) {
            $iid = int_or_null($s['integration_id'] ?? null);
            if (!$iid || !DB::val('SELECT id FROM integrations WHERE id = ? AND organization_id = ? AND type = ?', [$iid, $orgId, self::INTEGRATION_SLOTS[$type]])) {
                abort(self::missingMessage($type), 422);
            }
            $slot['integration_id'] = $iid;
            if ($type === 'news') {
                $slot['label'] = mb_substr(trim((string)($s['label'] ?? '')), 0, 30);
            }
        } elseif ($type === 'image') {
            $mid = int_or_null($s['media_id'] ?? null);
            if (!$mid || !DB::val("SELECT id FROM media WHERE id = ? AND organization_id = ? AND type = 'image'", [$mid, $orgId])) {
                abort('Escolha a imagem da barra inferior.', 422);
            }
            $slot['media_id'] = $mid;
        } elseif ($type === 'text') {
            $lines = array_values(array_filter(array_map(fn($l) => mb_substr(trim((string)$l), 0, 300), preg_split('/\R/', (string)($s['text'] ?? ''))), 'strlen'));
            if (!$lines) abort('Escreva a mensagem da barra inferior.', 422);
            $slot['text'] = implode("\n", array_slice($lines, 0, 20));
            $slot['label'] = mb_substr(trim((string)($s['label'] ?? '')), 0, 30);
            $slot['scroll'] = filter_var($s['scroll'] ?? true, FILTER_VALIDATE_BOOLEAN);
        } elseif ($type === 'clock') {
            $slot['show_date'] = filter_var($s['show_date'] ?? true, FILTER_VALIDATE_BOOLEAN);
        }
        return $slot;
    }

    private static function missingMessage(string $type): string
    {
        return [
            'news' => 'Escolha a fonte de notícias da barra inferior.',
            'weather' => 'Escolha a previsão do tempo da barra inferior.',
            'currency' => 'Escolha as cotações da barra inferior.',
            'sports' => 'Escolha o campeonato da barra inferior.',
            'futdigital' => 'Escolha a integração do FutDigital da barra inferior.',
        ][$type];
    }

    /**
     * Configuração pronta para exibir: converte o rodapé antigo (ticker), descarta itens
     * cujas integrações/imagens foram excluídas e inclui a URL das imagens.
     */
    public static function resolve(int $orgId, array $playlist, array &$integrationIds): ?array
    {
        $footer = decode_json($playlist['footer'] ?? null, null);
        if (!is_array($footer)) {
            $footer = self::fromLegacy($orgId, $playlist);
            if (!$footer) return null;
        }
        $slots = [];
        foreach ($footer['slots'] ?? [] as $s) {
            if (isset($s['integration_id'])) {
                if (!DB::val('SELECT id FROM integrations WHERE id = ? AND organization_id = ?', [$s['integration_id'], $orgId])) continue;
                $integrationIds[] = (int)$s['integration_id'];
            }
            if (($s['type'] ?? '') === 'image') {
                $m = DB::one("SELECT * FROM media WHERE id = ? AND organization_id = ? AND type = 'image'", [(int)($s['media_id'] ?? 0), $orgId]);
                if (!$m) continue;
                $s['media'] = ['id' => (int)$m['id'], 'name' => $m['name'], 'url' => upload_url($m['file_path']), 'width' => (int)$m['width'], 'height' => (int)$m['height']];
            }
            $slots[] = $s;
        }
        $footer['slots'] = $slots;
        return $footer;
    }

    /** Rodapé de versões anteriores (fonte de notícias/aviso + mensagens próprias) */
    private static function fromLegacy(int $orgId, array $p): ?array
    {
        if (empty($p['ticker_integration_id']) && empty($p['ticker_text'])) return null;
        $slots = [['type' => 'logo']];
        if (!empty($p['ticker_integration_id'])) {
            $i = DB::one('SELECT * FROM integrations WHERE id = ? AND organization_id = ?', [$p['ticker_integration_id'], $orgId]);
            if ($i && $i['type'] === 'rss') {
                $slots[] = ['type' => 'news', 'integration_id' => (int)$i['id'], 'label' => ''];
            } elseif ($i && $i['type'] === 'text') {
                $c = decode_json($i['config']);
                $msg = trim(implode(' — ', array_filter([$c['title'] ?? '', $c['message'] ?? ''])));
                if ($msg !== '') $slots[] = ['type' => 'text', 'text' => $msg, 'label' => 'Avisos', 'scroll' => true];
            }
        }
        if (!empty($p['ticker_text'])) {
            $slots[] = ['type' => 'text', 'text' => $p['ticker_text'], 'label' => 'Avisos', 'scroll' => true];
        }
        $slots[] = ['type' => 'clock', 'show_date' => false];
        return ['enabled' => true, 'size' => 'md', 'speed' => 'normal', 'background' => '#111827', 'color' => '#ffffff', 'accent' => '#6366f1', 'slots' => $slots];
    }
}
