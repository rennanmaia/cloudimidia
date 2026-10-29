<?php
declare(strict_types=1);

/**
 * Testes do cliente da API de parceiros do FutDigital com respostas simuladas.
 * Uso: php tests/FutDigitalClientTest.php
 */
require __DIR__ . '/../api/lib/bootstrap.php';

$failures = 0;
$check = function (string $name, bool $ok) use (&$failures) {
    echo ($ok ? '  ok   ' : '  FALHA ') . $name . PHP_EOL;
    if (!$ok) $failures++;
};
$key = 'fdk_test0000000000000000000000000000000000000abcde';
$client = new FutDigitalClient($key);
$calls = [];
$respond = function (array $queue) use (&$calls) {
    FutDigitalClient::$transport = function ($method, $url, $headers, $body) use (&$queue, &$calls) {
        $calls[] = compact('method', 'url', 'headers', 'body');
        return array_shift($queue);
    };
};
$error = function (callable $fn): ?FutDigitalError {
    try { $fn(); } catch (FutDigitalError $e) { return $e; }
    return null;
};

echo "200: me() e createSlot()\n";
$calls = [];
$respond([[200, '{"data":{"name":"Cloudi Mídia","competitions":3}}', 0]]);
$me = $client->me();
$check('devolve o conteúdo de "data"', $me['name'] === 'Cloudi Mídia' && $me['competitions'] === 3);
$check('envia a chave no cabeçalho Authorization', in_array("Authorization: Bearer $key", $calls[0]['headers'], true));
$check('usa a base da API de parceiros', $calls[0]['url'] === 'https://fut.digital/api/v1/partner/me');
$calls = [];
$respond([[201, '{"data":{"id":9,"url":"https://fut.digital/tv/slot.html?k=abc12345"}}', 0]]);
$slot = $client->createSlot(['name' => 'X', 'source_type' => 'arena', 'source_id' => 46]);
$check('POST /slots com JSON', $calls[0]['method'] === 'POST' && json_decode($calls[0]['body'], true)['source_id'] === 46);
$check('devolve id e url do slot', $slot['id'] === 9 && FutDigitalClient::tokenFromUrl($slot['url']) === 'abc12345');

echo "401: chave inválida\n";
$respond([[401, '{"error":{"code":"unauthorized","message":"Chave inválida: ' . $key . '"}}', 0]]);
$e = $error(fn() => $client->me());
$check('lança FutDigitalError com status 401', $e !== null && $e->status === 401);
$check('mensagem não expõe a chave', $e !== null && !str_contains($e->getMessage(), $key) && str_contains($e->getMessage(), 'fdk_…abcde'));

echo "404: slot não encontrado\n";
$respond([[404, '{"error":{"code":"not_found","message":"Slot não encontrado"}}', 0]]);
$e = $error(fn() => $client->updateSlot(5, ['is_active' => true]));
$check('lança FutDigitalError com status 404', $e !== null && $e->status === 404 && $e->getMessage() === 'Slot não encontrado');
$calls = [];
$respond([[204, '', 0]]);
$client->deleteSlot(5);
$check('DELETE /slots/{id} aceita resposta vazia', $calls[0]['method'] === 'DELETE' && str_ends_with($calls[0]['url'], '/slots/5'));

echo "429: limite por minuto\n";
$calls = [];
$respond([[429, '{"error":{"code":"rate_limited","message":"Too many"}}', 1], [200, '{"data":[{"id":1}]}', 0]]);
$t = microtime(true);
$list = $client->listSlots();
$check('respeita Retry-After e tenta de novo uma vez', count($calls) === 2 && microtime(true) - $t >= 0.9 && $list[0]['id'] === 1);
$respond([[429, '{}', 1], [429, '{}', 1]]);
$e = $error(fn() => $client->listSlots());
$check('desiste na segunda recusa, com mensagem clara', $e !== null && $e->status === 429 && str_contains($e->getMessage(), 'limite'));
$respond([[429, '{}', 60]]);
$t = microtime(true);
$e = $error(fn() => $client->listSlots());
$check('Retry-After longo não trava a requisição', $e !== null && microtime(true) - $t < 1);

FutDigitalClient::$transport = null;
echo $failures ? "\n$failures teste(s) falharam\n" : "\nTodos os testes passaram\n";
exit($failures ? 1 : 0);
