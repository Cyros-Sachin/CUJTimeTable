<?php

declare(strict_types=1);

namespace App\Core;

class View
{
    private static string $viewsPath = __DIR__ . '/../../views';

    /** @param array<string,mixed> $data */
    public static function render(string $template, array $data = [], bool $withLayout = true): string
    {
        $content = self::renderTemplate($template, $data);

        if (!$withLayout) {
            return $content;
        }

        $data['content'] = $content;
        return self::renderTemplate('layout', $data);
    }

    /** @param array<string,mixed> $data */
    public static function renderPartial(string $template, array $data = []): string
    {
        return self::renderTemplate($template, $data);
    }

    /** @param array<string,mixed> $data */
    private static function renderTemplate(string $template, array $data): string
    {
        $path = self::$viewsPath . '/' . $template . '.php';
        if (!is_file($path)) {
            throw new \RuntimeException("View not found: {$template}");
        }

        extract($data, EXTR_SKIP);
        ob_start();
        include $path;
        return (string) ob_get_clean();
    }
}
