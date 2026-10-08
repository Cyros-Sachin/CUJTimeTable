<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\View;
use Mpdf\Mpdf;
use Mpdf\Config\ConfigVariables;
use Mpdf\Config\FontVariables;

class PdfService
{
    private static string $root = __DIR__ . '/../..';

    private static function settings(): array
    {
        $rows = Db::conn()->query('SELECT k, v FROM settings')->fetchAll();
        $map = [];
        foreach ($rows as $row) {
            $map[$row['k']] = $row['v'];
        }
        return [
            'controllerTitle' => $map['controller_title'] ?? 'Controller of Examinations',
            'controllerName' => $map['controller_name'] ?? '',
            'logoPath' => $map['logo_path'] ?? '',
            'signaturePath' => $map['signature_path'] ?? '',
        ];
    }

    private static function fileToDataUri(?string $relativePath): ?string
    {
        if (!$relativePath) {
            return null;
        }
        $fullPath = self::$root . '/storage/branding/' . basename($relativePath);
        if (!is_file($fullPath)) {
            return null;
        }
        $ext = strtolower((string) pathinfo($fullPath, PATHINFO_EXTENSION));
        $mime = $ext === 'png' ? 'image/png' : 'image/jpeg';
        return 'data:' . $mime . ';base64,' . base64_encode((string) file_get_contents($fullPath));
    }

    private static function newMpdf(string $format): Mpdf
    {
        $defaults = (new ConfigVariables())->getDefaults();
        $fontDirs = $defaults['fontDir'];
        $fontDefaults = (new FontVariables())->getDefaults();
        $fontData = $fontDefaults['fontdata'];

        return new Mpdf([
            'mode' => 'utf-8',
            'format' => $format,
            'margin_left' => 18,
            'margin_right' => 18,
            'margin_top' => 16,
            'margin_bottom' => 16,
            'tempDir' => self::$root . '/storage/tmp',
            'fontDir' => array_merge($fontDirs, [self::$root . '/resources/fonts']),
            // Lohit Devanagari, not Noto — see the Dockerfile comment above the
            // font install step for why: this exact mPDF version cannot parse
            // Noto Sans Devanagari's OpenType tables without erroring out.
            'fontdata' => $fontData + [
                'lohitdevanagari' => [
                    'R' => 'LohitDevanagari-Regular.ttf',
                    'useOTL' => 0xFF,
                ],
            ],
            'default_font' => 'dejavuserif',
        ]);
    }

    public static function renderDatesheetPdf(array $params): string
    {
        $settings = self::settings();

        $html = View::renderPartial('pdf/datesheet', [
            'logoDataUri' => self::fileToDataUri($settings['logoPath']),
            'signatureDataUri' => self::fileToDataUri($settings['signaturePath']),
            'controllerName' => $settings['controllerName'],
            'controllerTitle' => $settings['controllerTitle'],
            'refNo' => $params['refNo'],
            'issuedOn' => $params['issuedOn'],
            'cycleTitle' => $params['cycleTitle'],
            'cycleMonthYear' => $params['cycleMonthYear'],
            'departmentName' => $params['departmentName'],
            'programName' => $params['programName'],
            'semester' => $params['semester'],
            'examType' => $params['examType'],
            'rows' => $params['rows'],
        ]);

        $mpdf = self::newMpdf('A4');
        $mpdf->WriteHTML($html);
        return $mpdf->Output('', 'S');
    }

    public static function renderOverallPdf(array $params): string
    {
        $html = View::renderPartial('pdf/overall', [
            'cycleTitle' => $params['cycleTitle'],
            'cycleMonthYear' => $params['cycleMonthYear'],
            'rows' => $params['rows'],
        ]);

        $mpdf = self::newMpdf('A4-L');
        $mpdf->SetHTMLFooter('<div style="text-align:center;font-size:9px;">Page {PAGENO} of {nbpg}</div>');
        $mpdf->WriteHTML($html);
        return $mpdf->Output('', 'S');
    }
}
