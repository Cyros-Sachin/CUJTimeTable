<?php

declare(strict_types=1);

// Global helpers for use inside view templates (views/*.php are included with
// no namespace of their own, so these must live outside any namespace too).

use App\Core\Csrf;

if (!function_exists('e')) {
    function e(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
    }
}

if (!function_exists('pdf_text')) {
    /**
     * Escape for the mPDF views and wrap every Devanagari run in <span class="hindi">, so Hindi
     * course/program/department names render in Lohit Devanagari instead of as empty boxes
     * (the PDFs' default DejaVu font has no Devanagari glyphs). Spaces and simple punctuation
     * between Hindi words stay inside the run so conjuncts/matras are shaped as one string.
     */
    function pdf_text(mixed $value): string
    {
        $deva = '[\x{0900}-\x{097F}\x{A8E0}-\x{A8FF}\x{200C}\x{200D}]';
        return (string) preg_replace(
            '/' . $deva . '+(?:[\s,.:\-\/()]+' . $deva . '+)*/u',
            '<span class="hindi">$0</span>',
            e($value)
        );
    }
}

if (!function_exists('csrf_token')) {
    function csrf_token(): string
    {
        return Csrf::token();
    }
}

if (!function_exists('ddmmyyyy')) {
    function ddmmyyyy(?string $iso): string
    {
        if (!$iso) {
            return '';
        }
        [$y, $m, $d] = explode('-', $iso);
        return "{$d}-{$m}-{$y}";
    }
}

if (!function_exists('weekday_of')) {
    function weekday_of(string $iso): string
    {
        $names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        [$y, $m, $d] = array_map('intval', explode('-', $iso));
        $dow = (int) (new DateTimeImmutable())->setDate($y, $m, $d)->setTime(0, 0)->format('w');
        return $names[$dow];
    }
}

if (!function_exists('long_date')) {
    function long_date(string $iso): string
    {
        $months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        [$y, $m, $d] = array_map('intval', explode('-', $iso));
        return "{$d} {$months[$m - 1]}, {$y}";
    }
}

if (!function_exists('to_roman')) {
    function to_roman(int $num): string
    {
        $map = [10 => 'X', 9 => 'IX', 5 => 'V', 4 => 'IV', 1 => 'I'];
        $out = '';
        foreach ($map as $value => $symbol) {
            while ($num >= $value) {
                $out .= $symbol;
                $num -= $value;
            }
        }
        return $out;
    }
}

if (!function_exists('exam_type_label')) {
    function exam_type_label(string $type): string
    {
        return $type === 'REGULAR' ? 'Regular' : 'Re-appear';
    }
}
