<?php
declare(strict_types=1);

class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $regex = preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', trim($pattern, '/'));
        $this->routes[] = [$method, '#^' . $regex . '$#', $handler];
    }

    public function get(string $p, callable $h): void { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void { $this->add('POST', $p, $h); }
    public function put(string $p, callable $h): void { $this->add('PUT', $p, $h); }
    public function delete(string $p, callable $h): void { $this->add('DELETE', $p, $h); }

    public function dispatch(string $method, string $path): void
    {
        $path = trim($path, '/');
        $methodMatched = false;
        foreach ($this->routes as [$m, $regex, $handler]) {
            if (preg_match($regex, $path, $matches)) {
                if ($m !== $method) {
                    $methodMatched = true;
                    continue;
                }
                $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                $handler(...array_values($params));
                respond(['ok' => true]);
            }
        }
        if ($methodMatched) {
            abort('Método não permitido.', 405);
        }
        abort('Rota não encontrada.', 404);
    }
}
