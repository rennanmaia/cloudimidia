<?php
declare(strict_types=1);

class ReportController
{
    public static function plays($org): void
    {
        $ctx = org_ctx($org);
        $tz = new DateTimeZone($ctx->org['timezone']);
        $utc = new DateTimeZone('UTC');

        $from = DateTime::createFromFormat('!Y-m-d', (string)query('from', '')) ?: new DateTime('-6 days');
        $to = DateTime::createFromFormat('!Y-m-d', (string)query('to', '')) ?: new DateTime('today');
        $start = new DateTime($from->format('Y-m-d') . ' 00:00:00', $tz);
        $end = new DateTime($to->format('Y-m-d') . ' 23:59:59', $tz);
        if ($end < $start) abort('Período inválido.', 422);
        if ($start->diff($end)->days > 366) abort('O período máximo é de 1 ano.', 422);
        $offset = (int)($start->getOffset() / 60);
        $startUtc = (clone $start)->setTimezone($utc)->format('Y-m-d H:i:s');
        $endUtc = (clone $end)->setTimezone($utc)->format('Y-m-d H:i:s');

        $where = 'pl.organization_id = ? AND pl.started_at BETWEEN ? AND ?';
        $params = [$ctx->id(), $startUtc, $endUtc];

        $screenIds = null;
        if ($ctx->isGuest()) $screenIds = array_keys($ctx->screens);
        $screenId = int_or_null(query('screen_id'));
        if ($screenId) $screenIds = $screenIds === null ? [$screenId] : array_values(array_intersect($screenIds, [$screenId]));
        $groupId = int_or_null(query('group_id'));
        if ($groupId) {
            $gs = array_map('intval', DB::col('SELECT screen_id FROM screen_group_members WHERE group_id = ?', [$groupId]));
            $screenIds = $screenIds === null ? $gs : array_values(array_intersect($screenIds, $gs));
        }
        if ($screenIds !== null) {
            $where .= ' AND pl.screen_id IN (' . DB::in($screenIds) . ')';
            $params = array_merge($params, $screenIds);
        }
        $mediaId = int_or_null(query('media_id'));
        if ($mediaId) {
            $where .= ' AND pl.media_id = ?';
            $params[] = $mediaId;
        }

        $summary = DB::one("SELECT COUNT(*) AS plays, COALESCE(SUM(pl.duration),0) AS seconds, COUNT(DISTINCT pl.screen_id) AS screens FROM play_logs pl WHERE $where", $params);

        $byContent = DB::all(
            "SELECT pl.media_id, pl.integration_id, COALESCE(m.name, i.name, 'Item removido') AS name, COALESCE(m.type, i.type) AS type,
                    COUNT(*) AS plays, SUM(pl.duration) AS seconds, COUNT(DISTINCT pl.screen_id) AS screens, MAX(pl.started_at) AS last_played
             FROM play_logs pl LEFT JOIN media m ON m.id = pl.media_id LEFT JOIN integrations i ON i.id = pl.integration_id
             WHERE $where GROUP BY pl.media_id, pl.integration_id, m.name, i.name, m.type, i.type ORDER BY plays DESC LIMIT 500",
            $params
        );

        $byDay = DB::all(
            "SELECT DATE(DATE_ADD(pl.started_at, INTERVAL $offset MINUTE)) AS day, COUNT(*) AS plays, SUM(pl.duration) AS seconds
             FROM play_logs pl WHERE $where GROUP BY day ORDER BY day",
            $params
        );

        $byScreen = DB::all(
            "SELECT s.id, s.name, COUNT(*) AS plays, SUM(pl.duration) AS seconds
             FROM play_logs pl JOIN screens s ON s.id = pl.screen_id WHERE $where GROUP BY s.id, s.name ORDER BY plays DESC",
            $params
        );

        // Preenche dias sem exibições para o gráfico
        $days = [];
        $indexed = array_column($byDay, null, 'day');
        for ($d = clone $start; $d <= $end; $d->modify('+1 day')) {
            $k = $d->format('Y-m-d');
            $days[] = ['day' => $k, 'plays' => (int)($indexed[$k]['plays'] ?? 0), 'seconds' => (int)($indexed[$k]['seconds'] ?? 0)];
        }

        $intify = fn(array $rows, array $keys) => array_map(function ($r) use ($keys) {
            foreach ($keys as $k) if (isset($r[$k])) $r[$k] = (int)$r[$k];
            return $r;
        }, $rows);

        respond([
            'from' => $start->format('Y-m-d'),
            'to' => $end->format('Y-m-d'),
            'summary' => ['plays' => (int)$summary['plays'], 'seconds' => (int)$summary['seconds'], 'screens' => (int)$summary['screens']],
            'by_content' => $intify($byContent, ['media_id', 'integration_id', 'plays', 'seconds', 'screens']),
            'by_day' => $days,
            'by_screen' => $intify($byScreen, ['id', 'plays', 'seconds']),
        ]);
    }
}
