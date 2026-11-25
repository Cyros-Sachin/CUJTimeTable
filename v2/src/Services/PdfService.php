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

    /**
     * @param array[] $paramsList each as accepted by renderDatesheetPdf(); one datesheet per page group.
     * @param array{serial?: ?string, note?: ?string} $extras serial goes on every datesheet's ref row;
     *        the note is printed only once, at the end of the final datesheet.
     */
    public static function renderCombinedDatesheetPdf(array $paramsList, array $extras = []): string
    {
        $settings = self::settings();
        $mpdf = self::newMpdf('A4');
        $paramsList = array_values($paramsList);
        $last = count($paramsList) - 1;
        $note = $extras['note'] ?? null;
        foreach ($paramsList as $params) {
            if ($note === null && !empty($params['note'])) {
                $note = $params['note'];
            }
        }
        foreach ($paramsList as $i => $params) {
            if ($i > 0) {
                $mpdf->AddPage();
            }
            $params['serial'] = $params['serial'] ?? ($extras['serial'] ?? null);
            $params['note'] = $i === $last ? $note : null;
            $mpdf->WriteHTML(self::datesheetHtml($params, $settings));
        }
        return $mpdf->Output('', 'S');
    }

    public static function renderDatesheetPdf(array $params): string
    {
        $mpdf = self::newMpdf('A4');
        $mpdf->WriteHTML(self::datesheetHtml($params, self::settings()));
        return $mpdf->Output('', 'S');
    }

    private static function datesheetHtml(array $params, array $settings): string
    {
        return View::renderPartial('pdf/datesheet', [
            'logoDataUri' => self::fileToDataUri($settings['logoPath']),
            'signatureDataUri' => self::fileToDataUri($settings['signaturePath']),
            'controllerName' => $settings['controllerName'],
            'controllerTitle' => $settings['controllerTitle'],
            'issuedOn' => $params['issuedOn'],
            'cycleTitle' => $params['cycleTitle'],
            'cycleMonthYear' => $params['cycleMonthYear'],
            'departmentName' => $params['departmentName'],
            'programName' => $params['programName'],
            'semester' => $params['semester'],
            'examType' => $params['examType'],
            'rows' => $params['rows'],
            'title' => $params['title'] ?? null,
            'groups' => $params['groups'] ?? null,
            'serial' => $params['serial'] ?? null,
            'note' => $params['note'] ?? null,
        ]);
    }

    public static function renderOverallPdf(array $params): string
    {
        $html = View::renderPartial('pdf/overall', [
            'cycleTitle' => $params['cycleTitle'],
            'cycleMonthYear' => $params['cycleMonthYear'],
            'rows' => $params['rows'],
            'issuedOn' => $params['issuedOn'] ?? date('Y-m-d'),
            'serial' => $params['serial'] ?? null,
            'note' => $params['note'] ?? null,
        ]);

        $mpdf = self::newMpdf('A4-L');
        $mpdf->SetHTMLFooter('<div style="text-align:center;font-size:9px;">Page {PAGENO} of {nbpg}</div>');
        $mpdf->WriteHTML($html);
        return $mpdf->Output('', 'S');
    }
}
