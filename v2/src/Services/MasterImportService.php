<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpException;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/** Excel/CSV bulk insert for departments, programs and department coordinators (Exam Cell admin). */
class MasterImportService
{
    private const MAX_ROWS = 1000;
    private const MAX_SIZE = 5 * 1024 * 1024;
    private const DEPT_HEADERS = ['Code', 'Name'];
    private const PROGRAM_HEADERS = ['Department', 'Code', 'Name', 'Total Semesters'];
    private const COORDINATOR_HEADERS = ['Name', 'Email', 'Department'];

    private static function styleHeader(Worksheet $sheet, array $headers): void
    {
        foreach ($headers as $i => $h) {
            $sheet->setCellValue([$i + 1, 1], $h);
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth(in_array($h, ['Name', 'Department'], true) ? 44 : 20);
        }
        $last = chr(ord('A') + count($headers) - 1);
        $sheet->getStyle("A1:{$last}1")->applyFromArray([
            'font' => ['bold' => true, 'color' => ['argb' => 'FFFFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FF1E3A8A']],
        ]);
    }

    private static function addNotes(Spreadsheet $wb, array $lines): void
    {
        $notes = $wb->createSheet();
        $notes->setTitle('Instructions');
        $notes->getColumnDimension('A')->setWidth(90);
        foreach ($lines as $i => $line) {
            $notes->setCellValue('A' . ($i + 1), $line);
        }
    }

    public static function departmentsTemplate(): Spreadsheet
    {
        $wb = new Spreadsheet();
        $sheet = $wb->getActiveSheet();
        $sheet->setTitle('Departments');
        self::styleHeader($sheet, self::DEPT_HEADERS);
        $sheet->setCellValue('A2', 'CSIT');
        $sheet->setCellValue('B2', 'Department of Computer Science and Information Technology');
        self::addNotes($wb, [
            'One department per row, starting on row 2 (row 2 is an example - replace or delete it).',
            'Code: unique short code, up to 20 characters.',
            'Name: full department name, up to 200 characters (printed on the date sheet).',
            'Departments whose code already exists are skipped.',
        ]);
        $wb->setActiveSheetIndex(0);
        return $wb;
    }

    public static function programsTemplate(): Spreadsheet
    {
        $wb = new Spreadsheet();
        $sheet = $wb->getActiveSheet();
        $sheet->setTitle('Programs');
        $lists = $wb->createSheet();
        $lists->setTitle('Lists');
        $lists->setSheetState(Worksheet::SHEETSTATE_HIDDEN);

        $depts = Db::conn()->query('SELECT code FROM departments WHERE is_active = 1 ORDER BY name')->fetchAll();
        foreach ($depts as $i => $d) {
            $lists->setCellValue('A' . ($i + 1), $d['code']);
        }
        $deptCount = max(count($depts), 1);

        self::styleHeader($sheet, self::PROGRAM_HEADERS);
        $sheet->setCellValue('A2', $depts[0]['code'] ?? 'CSIT');
        $sheet->setCellValue('B2', 'BTECH-CS');
        $sheet->setCellValue('C2', 'B.Tech Computer Science');
        $sheet->setCellValue('D2', 8);

        for ($r = 2; $r <= 1001; $r++) {
            $dv = $sheet->getCell("A{$r}")->getDataValidation();
            $dv->setType(DataValidation::TYPE_LIST);
            $dv->setAllowBlank(true);
            $dv->setFormula1("Lists!\$A\$1:\$A\${$deptCount}");

            $dv = $sheet->getCell("D{$r}")->getDataValidation();
            $dv->setType(DataValidation::TYPE_WHOLE);
            $dv->setOperator(DataValidation::OPERATOR_BETWEEN);
            $dv->setAllowBlank(true);
            $dv->setFormula1('1');
            $dv->setFormula2('20');
        }
        self::addNotes($wb, [
            'One program per row, starting on row 2 (row 2 is an example - replace or delete it).',
            'Department: pick from the dropdown (department code). The full department name is also accepted.',
            'Code: unique program code, up to 30 characters.',
            'Name: program name, up to 200 characters, unique within the department.',
            'Total Semesters: whole number 1-20.',
            'Programs whose code already exists are skipped.',
        ]);
        $wb->setActiveSheetIndex(0);
        return $wb;
    }

    public static function coordinatorsTemplate(): Spreadsheet
    {
        $wb = new Spreadsheet();
        $sheet = $wb->getActiveSheet();
        $sheet->setTitle('Coordinators');
        $lists = $wb->createSheet();
        $lists->setTitle('Lists');
        $lists->setSheetState(Worksheet::SHEETSTATE_HIDDEN);

        $depts = Db::conn()->query('SELECT name FROM departments WHERE is_active = 1 ORDER BY name')->fetchAll();
        foreach ($depts as $i => $d) {
            $lists->setCellValue('A' . ($i + 1), $d['name']);
        }
        $deptCount = max(count($depts), 1);

        self::styleHeader($sheet, self::COORDINATOR_HEADERS);
        $sheet->getColumnDimension('A')->setWidth(32);
        $sheet->getColumnDimension('B')->setWidth(36);
        $sheet->getColumnDimension('C')->setWidth(60);
        for ($r = 2; $r <= 1001; $r++) {
            $dv = $sheet->getCell("C{$r}")->getDataValidation();
            $dv->setType(DataValidation::TYPE_LIST);
            $dv->setAllowBlank(true);
            $dv->setShowDropDown(true); // PhpSpreadsheet inverts this: true = arrow visible
            $dv->setShowErrorMessage(true);
            $dv->setError('Pick a department from the dropdown list.');
            $dv->setFormula1("Lists!\$A\$1:\$A\${$deptCount}");
        }
        self::addNotes($wb, [
            'One coordinator per row, starting on row 2.',
            'Name: up to 120 characters.',
            'Email: unique login email, up to 160 characters.',
            'Department: pick from the dropdown (the department code is also accepted).',
            'A temporary password is generated for each coordinator; they must change it on first login.',
            'Coordinators whose email already exists are skipped.',
        ]);
        $wb->setActiveSheetIndex(0);
        return $wb;
    }

    /** @return array<int,array{row:int,cells:string[]}> */
    private static function readRows(array $file, array $headers): array
    {
        if (empty($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'No file uploaded', ['rows' => []]);
        }
        if ($file['size'] > self::MAX_SIZE) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'File exceeds the 5 MB limit', ['rows' => []]);
        }
        $ext = strtolower((string) pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['xlsx', 'csv'], true)) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'Only .xlsx or .csv files are accepted', ['rows' => []]);
        }
        if ($ext === 'xlsx' && file_get_contents($file['tmp_name'], false, null, 0, 2) !== 'PK') {
            throw new HttpException(422, 'UPLOAD_INVALID', 'File is not a valid .xlsx workbook', ['rows' => []]);
        }

        try {
            if ($ext === 'csv') {
                $reader = IOFactory::createReader('Csv');
                $raw = preg_replace('/^\xEF\xBB\xBF/', '', (string) file_get_contents($file['tmp_name']));
                $reader->setDelimiter(substr_count($raw, ';') > substr_count($raw, ',') ? ';' : ',');
                $reader->setInputEncoding('UTF-8');
                $tmp = tempnam(sys_get_temp_dir(), 'cuj_csv_');
                file_put_contents($tmp, $raw);
                $spreadsheet = $reader->load($tmp);
                @unlink($tmp);
            } else {
                $reader = IOFactory::createReaderForFile($file['tmp_name']);
                $reader->setReadDataOnly(true);
                $spreadsheet = $reader->load($file['tmp_name']);
            }
        } catch (\Throwable $e) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'Could not read the uploaded file', ['rows' => []]);
        }

        $sheet = $spreadsheet->getSheet(0);
        $text = fn (int $c, int $r): string => trim((string) $sheet->getCell([$c, $r])->getCalculatedValue());
        foreach ($headers as $i => $h) {
            if (strcasecmp($text($i + 1, 1), $h) !== 0) {
                throw new HttpException(422, 'UPLOAD_INVALID', 'Header row does not match the template', [
                    'rows' => [['row' => 1, 'field' => 'header', 'message' => 'Expected columns: ' . implode(', ', $headers)]],
                ]);
            }
        }

        $out = [];
        $highest = $sheet->getHighestDataRow();
        for ($r = 2; $r <= $highest; $r++) {
            $cells = [];
            foreach ($headers as $i => $_) {
                $cells[] = $text($i + 1, $r);
            }
            if (implode('', $cells) === '') {
                continue;
            }
            $out[] = ['row' => $r, 'cells' => $cells];
            if (count($out) > self::MAX_ROWS) {
                throw new HttpException(422, 'UPLOAD_INVALID', 'Too many rows (max ' . self::MAX_ROWS . ')', ['rows' => []]);
            }
        }
        if (!$out) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'No data rows found', ['rows' => [['row' => 2, 'field' => 'file', 'message' => 'File has no data rows']]]);
        }
        return $out;
    }

    /** @return array{valid:int,skipped:int,inserted:int} */
    public static function importDepartments(array $file, bool $dryRun): array
    {
        $raw = self::readRows($file, self::DEPT_HEADERS);
        $pdo = Db::conn();
        $existing = $pdo->query('SELECT code, name FROM departments')->fetchAll();
        $codes = [];
        $names = [];
        foreach ($existing as $d) {
            $codes[mb_strtolower($d['code'])] = true;
            $names[mb_strtolower($d['name'])] = true;
        }

        $errors = [];
        $toInsert = [];
        $skipped = 0;
        $seen = [];
        foreach ($raw as $item) {
            $row = $item['row'];
            [$code, $name] = $item['cells'];
            $bad = false;
            if ($code === '' || mb_strlen($code) > 20) {
                $errors[] = ['row' => $row, 'field' => 'code', 'message' => 'Code is required (max 20 characters)'];
                $bad = true;
            }
            if ($name === '' || mb_strlen($name) > 200) {
                $errors[] = ['row' => $row, 'field' => 'name', 'message' => 'Name is required (max 200 characters)'];
                $bad = true;
            }
            if ($bad) {
                continue;
            }
            $key = mb_strtolower($code);
            if (isset($seen[$key])) {
                $errors[] = ['row' => $row, 'field' => 'code', 'message' => 'Duplicate code within this file'];
                continue;
            }
            $seen[$key] = true;
            if (isset($codes[$key])) {
                $skipped++;
                continue;
            }
            $nameKey = mb_strtolower($name);
            if (isset($names[$nameKey])) {
                $errors[] = ['row' => $row, 'field' => 'name', 'message' => "A department named \"{$name}\" already exists"];
                continue;
            }
            $names[$nameKey] = true;
            $toInsert[] = ['code' => $code, 'name' => $name];
        }
        if ($errors) {
            throw new HttpException(422, 'UPLOAD_INVALID', count($errors) . ' row(s) failed validation', ['rows' => $errors]);
        }
        if ($dryRun) {
            return ['valid' => count($toInsert), 'skipped' => $skipped, 'inserted' => 0];
        }
        Db::transaction(function ($pdo) use ($toInsert) {
            $stmt = $pdo->prepare('INSERT INTO departments (code, name) VALUES (:code, :name)');
            foreach ($toInsert as $d) {
                $stmt->execute($d);
            }
        });
        return ['valid' => count($toInsert), 'skipped' => $skipped, 'inserted' => count($toInsert)];
    }

    /** @return array{valid:int,skipped:int,inserted:int} */
    public static function importPrograms(array $file, bool $dryRun): array
    {
        $raw = self::readRows($file, self::PROGRAM_HEADERS);
        $pdo = Db::conn();
        $deptLookup = [];
        foreach ($pdo->query('SELECT id, code, name FROM departments WHERE is_active = 1')->fetchAll() as $d) {
            $deptLookup[mb_strtolower($d['code'])] = $d;
            $deptLookup[mb_strtolower($d['name'])] = $d;
        }
        $codes = [];
        $deptNames = [];
        foreach ($pdo->query('SELECT code, department_id, name FROM programs')->fetchAll() as $p) {
            $codes[mb_strtolower($p['code'])] = true;
            $deptNames[$p['department_id'] . '|' . mb_strtolower($p['name'])] = true;
        }

        $errors = [];
        $toInsert = [];
        $skipped = 0;
        $seen = [];
        foreach ($raw as $item) {
            $row = $item['row'];
            [$deptText, $code, $name, $semText] = $item['cells'];
            $dept = $deptLookup[mb_strtolower($deptText)] ?? null;
            $semesters = ctype_digit($semText) ? (int) $semText : 0;
            $semOk = $semesters >= 1 && $semesters <= 20;
            $bad = false;
            if (!$dept) {
                $errors[] = ['row' => $row, 'field' => 'department', 'message' => "Unknown department \"{$deptText}\""];
                $bad = true;
            }
            if ($code === '' || mb_strlen($code) > 30) {
                $errors[] = ['row' => $row, 'field' => 'code', 'message' => 'Code is required (max 30 characters)'];
                $bad = true;
            }
            if ($name === '' || mb_strlen($name) > 200) {
                $errors[] = ['row' => $row, 'field' => 'name', 'message' => 'Name is required (max 200 characters)'];
                $bad = true;
            }
            if (!$semOk) {
                $errors[] = ['row' => $row, 'field' => 'total_semesters', 'message' => 'Total Semesters must be a whole number between 1 and 20'];
                $bad = true;
            }
            if ($bad) {
                continue;
            }
            $key = mb_strtolower($code);
            if (isset($seen[$key])) {
                $errors[] = ['row' => $row, 'field' => 'code', 'message' => 'Duplicate code within this file'];
                continue;
            }
            $seen[$key] = true;
            if (isset($codes[$key])) {
                $skipped++;
                continue;
            }
            $dn = $dept['id'] . '|' . mb_strtolower($name);
            if (isset($deptNames[$dn])) {
                $errors[] = ['row' => $row, 'field' => 'name', 'message' => "Program \"{$name}\" already exists in {$dept['name']}"];
                continue;
            }
            $deptNames[$dn] = true;
            $toInsert[] = ['department_id' => (int) $dept['id'], 'code' => $code, 'name' => $name, 'total_semesters' => $semesters];
        }
        if ($errors) {
            throw new HttpException(422, 'UPLOAD_INVALID', count($errors) . ' row(s) failed validation', ['rows' => $errors]);
        }
        if ($dryRun) {
            return ['valid' => count($toInsert), 'skipped' => $skipped, 'inserted' => 0];
        }
        Db::transaction(function ($pdo) use ($toInsert) {
            $stmt = $pdo->prepare('INSERT INTO programs (department_id, code, name, total_semesters) VALUES (:department_id, :code, :name, :total_semesters)');
            foreach ($toInsert as $p) {
                $stmt->execute($p);
            }
        });
        return ['valid' => count($toInsert), 'skipped' => $skipped, 'inserted' => count($toInsert)];
    }

    /**
     * Validates and (unless $dryRun) inserts coordinators. $makePassword returns a fresh temp password,
     * $hash hashes it. On a real import the result carries the created accounts with their temp passwords.
     *
     * @return array{valid:int,skipped:int,inserted:int,created:array<int,array{name:string,email:string,department:string,temp_password:string}>}
     */
    public static function importCoordinators(array $file, bool $dryRun, callable $makePassword, callable $hash): array
    {
        $raw = self::readRows($file, self::COORDINATOR_HEADERS);
        $pdo = Db::conn();
        $deptLookup = [];
        foreach ($pdo->query('SELECT id, code, name FROM departments WHERE is_active = 1')->fetchAll() as $d) {
            $deptLookup[mb_strtolower($d['code'])] = $d;
            $deptLookup[mb_strtolower($d['name'])] = $d;
        }
        $emails = [];
        foreach ($pdo->query('SELECT email FROM users')->fetchAll() as $u) {
            $emails[mb_strtolower($u['email'])] = true;
        }

        $errors = [];
        $toInsert = [];
        $skipped = 0;
        $seen = [];
        foreach ($raw as $item) {
            $row = $item['row'];
            [$name, $email, $deptText] = $item['cells'];
            $dept = $deptLookup[mb_strtolower($deptText)] ?? null;
            $bad = false;
            if ($name === '' || mb_strlen($name) > 120) {
                $errors[] = ['row' => $row, 'field' => 'name', 'message' => 'Name is required (max 120 characters)'];
                $bad = true;
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 160) {
                $errors[] = ['row' => $row, 'field' => 'email', 'message' => 'A valid email is required (max 160 characters)'];
                $bad = true;
            }
            if (!$dept) {
                $errors[] = ['row' => $row, 'field' => 'department', 'message' => "Unknown department \"{$deptText}\""];
                $bad = true;
            }
            if ($bad) {
                continue;
            }
            $key = mb_strtolower($email);
            if (isset($seen[$key])) {
                $errors[] = ['row' => $row, 'field' => 'email', 'message' => 'Duplicate email within this file'];
                continue;
            }
            $seen[$key] = true;
            if (isset($emails[$key])) {
                $skipped++;
                continue;
            }
            $toInsert[] = ['name' => $name, 'email' => $key, 'department_id' => (int) $dept['id'], 'department' => $dept['name']];
        }
        if ($errors) {
            throw new HttpException(422, 'UPLOAD_INVALID', count($errors) . ' row(s) failed validation', ['rows' => $errors]);
        }
        if ($dryRun) {
            return ['valid' => count($toInsert), 'skipped' => $skipped, 'inserted' => 0, 'created' => []];
        }
        $created = [];
        Db::transaction(function ($pdo) use ($toInsert, $makePassword, $hash, &$created) {
            $stmt = $pdo->prepare(
                "INSERT INTO users (name, email, password_hash, role, department_id, must_change_password)
                 VALUES (:name, :email, :hash, 'DEPT_COORDINATOR', :department_id, 1)"
            );
            foreach ($toInsert as $u) {
                $temp = $makePassword();
                $stmt->execute(['name' => $u['name'], 'email' => $u['email'], 'hash' => $hash($temp), 'department_id' => $u['department_id']]);
                $created[] = ['name' => $u['name'], 'email' => $u['email'], 'department' => $u['department'], 'temp_password' => $temp];
            }
        });
        return ['valid' => count($toInsert), 'skipped' => $skipped, 'inserted' => count($created), 'created' => $created];
    }
}
