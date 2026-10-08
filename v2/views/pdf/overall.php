<?php
/** @var string $cycleTitle */
/** @var string $cycleMonthYear */
/** @var array $rows */

$title = 'DATE SHEET FOR ' . mb_strtoupper($cycleTitle) . ' - ' . $cycleMonthYear . ' (ALL DEPARTMENTS)';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: "DejaVu Serif", serif; color: #000; font-size: 11px; }
  .hindi { font-family: "lohitdevanagari", sans-serif; }
  table.letterhead { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.letterhead td { text-align: center; padding: 0; }
  .l1 { font-size: 18px; font-weight: bold; }
  .l2 { font-size: 17px; font-weight: bold; }
  .l3, .l4 { font-size: 11px; }
  .rule { border: none; border-top: 1.5px solid #000; margin: 4px 0; }
  .title { text-align: center; font-weight: bold; text-decoration: underline; font-size: 14px; margin: 8px 0 10px; }
  table.overall { width: 100%; border-collapse: collapse; }
  table.overall th, table.overall td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; }
  table.overall th { text-align: center; font-weight: bold; }
  table.overall tr { page-break-inside: avoid; }
  td.num { text-align: right; }
  td.center { text-align: center; }
  tr.total-row td { font-weight: bold; background: #f0f0f0; }
</style>
</head>
<body>
  <table class="letterhead">
    <tr><td class="l1 hindi">जम्मू केंद्रीय विश्वविद्यालय</td></tr>
    <tr><td class="l2">Central University of Jammu</td></tr>
    <tr><td class="l3 hindi">राया-सूचानी (बागला)-181143, सांबा, जम्मू (जम्मू और कश्मीर)</td></tr>
    <tr><td class="l4">Rahya-Suchani (Bagla), Samba-181143, Jammu</td></tr>
  </table>
  <hr class="rule" />
  <div class="title"><?= e($title) ?></div>

  <table class="overall">
    <thead>
      <tr>
        <th>S.No</th><th>Date (Day)</th><th>Time</th><th>Department</th><th>Program</th>
        <th>Sem</th><th>Type</th><th>Course Code</th><th>Course Name</th><th>Students</th>
      </tr>
    </thead>
    <tbody>
      <?php
      $sno = 0;
      $currentDate = null;
      $dayPapers = 0;
      $dayStudents = 0;
      $flush = function () use (&$currentDate, &$dayPapers, &$dayStudents) {
          if ($currentDate !== null) {
              echo '<tr class="total-row"><td colspan="9" class="center">Total for ' . e(ddmmyyyy($currentDate)) . '</td><td class="num">' . $dayPapers . ' papers / ' . $dayStudents . ' students</td></tr>';
          }
      };
      foreach ($rows as $row):
          if ($row['exam_date'] !== $currentDate) {
              $flush();
              $currentDate = $row['exam_date'];
              $dayPapers = 0;
              $dayStudents = 0;
          }
          $dayPapers++;
          $dayStudents += (int) $row['student_count'];
          $sno++;
      ?>
      <tr>
        <td class="center"><?= $sno ?></td>
        <td class="center"><?= e(ddmmyyyy($row['exam_date'])) ?> (<?= e(weekday_of($row['exam_date'])) ?>)</td>
        <td class="center"><?= e($row['time_slot_label']) ?></td>
        <td><?= e($row['department_name']) ?></td>
        <td><?= e($row['program_name']) ?></td>
        <td class="center"><?= e($row['semester']) ?></td>
        <td class="center"><?= e(exam_type_label($row['exam_type'])) ?></td>
        <td class="center"><?= e($row['course_code']) ?></td>
        <td><?= e($row['course_name']) ?></td>
        <td class="num"><?= e($row['student_count']) ?></td>
      </tr>
      <?php endforeach; $flush(); ?>
    </tbody>
  </table>
</body>
</html>
