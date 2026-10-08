<?php

declare(strict_types=1);

namespace App\Core;

class Router
{
    /** @var array<int,array{method:string,pattern:string,regex:string,handler:callable|array}> */
    private array $routes = [];

    public function get(string $pattern, callable|array $handler): void
    {
        $this->add('GET', $pattern, $handler);
    }

    public function post(string $pattern, callable|array $handler): void
    {
        $this->add('POST', $pattern, $handler);
    }

    public function put(string $pattern, callable|array $handler): void
    {
        $this->add('PUT', $pattern, $handler);
    }

    public function patch(string $pattern, callable|array $handler): void
    {
        $this->add('PATCH', $pattern, $handler);
    }

    public function delete(string $pattern, callable|array $handler): void
    {
        $this->add('DELETE', $pattern, $handler);
    }

    private function add(string $method, string $pattern, callable|array $handler): void
    {
        $regex = preg_replace('#\{([a-zA-Z_][a-zA-Z0-9_]*)\}#', '(?P<$1>[^/]+)', $pattern);
        $this->routes[] = [
            'method' => $method,
            'pattern' => $pattern,
            'regex' => '#^' . $regex . '$#',
            'handler' => $handler,
        ];
    }

    public function dispatch(Request $request): void
    {
        $matchedPath = false;

        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }
            $matchedPath = true;

            if ($route['method'] !== $request->method) {
                continue;
            }

            $params = array_filter($matches, fn ($k) => !is_int($k), ARRAY_FILTER_USE_KEY);

            $this->invoke($route['handler'], $request, $params);
            return;
        }

        if ($request->isApi()) {
            throw new HttpException($matchedPath ? 405 : 404, $matchedPath ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND', 'Not found');
        }

        Response::notFoundPage();
    }

    /** @param array<string,string> $params */
    private function invoke(callable|array $handler, Request $request, array $params): void
    {
        if (is_array($handler)) {
            [$class, $method] = $handler;
            $controller = new $class();
            $controller->$method($request, $params);
            return;
        }

        $handler($request, $params);
    }
}
