<?php
/** @var string|null $logoDataUri */
/** @var string|null $signatureDataUri */
/** @var string $controllerName */
/** @var string $controllerTitle */
/** @var string $refNo */
/** @var string $issuedOn */
/** @var string $cycleTitle */
/** @var string $cycleMonthYear */
/** @var string $departmentName */
/** @var string $programName */
/** @var int $semester */
/** @var string $examType */
/** @var array $rows */

$title = 'DATE SHEET FOR ' . mb_strtoupper($cycleTitle) . ' - ' . $cycleMonthYear;
$programLine = e($programName) . ' SEMESTER-' . to_roman($semester) . ($examType === 'REAPPEAR' ? ' (REAPPEAR)' : '');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: "DejaVu Serif", serif; color: #000; font-size: 13px; }
  .hindi { font-family: "lohitdevanagari", sans-serif; }
  table.letterhead { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.letterhead td { text-align: center; padding: 0; }
  .l1 { font-size: 20px; font-weight: bold; }
  .l2 { font-size: 19px; font-weight: bold; }
  .l3, .l4 { font-size: 12px; }
  .rule { border: none; border-top: 1.5px solid #000; margin: 4px 0; }
  table.refrow { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0; }
  table.refrow td { padding: 0; }
  .title { text-align: center; font-weight: bold; text-decoration: underline; font-size: 15px; margin: 10px 0 4px; }
  .dept-line { text-align: center; font-weight: bold; text-decoration: underline; text-transform: uppercase; font-size: 14px; margin: 2px 0; }
  .program-line { text-align: center; font-weight: bold; text-decoration: underline; font-size: 13px; margin: 2px 0 12px; }
  table.datesheet { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.datesheet th, table.datesheet td { border: 1px solid #000; padding: 6px 8px; font-size: 13px; }
  table.datesheet th { text-align: center; font-weight: bold; }
  table.datesheet tr { page-break-inside: avoid; }
  td.date-cell { text-align: center; white-space: nowrap; }
  td.date-cell .weekday { display: block; font-size: 11px; }
  td.code-cell { text-align: center; white-space: nowrap; }
  td.name-cell { text-align: center; }
  td.time-cell { text-align: center; white-space: nowrap; }
  table.footer { width: 100%; border-collapse: collapse; margin-top: 46px; }
  table.footer td { vertical-align: top; padding: 0; font-size: 13px; }
  .to-block .head-line { font-weight: bold; }
  .sign-block { text-align: center; }
  .sign-block img { height: 50px; }
  .sign-block .controller-name { font-weight: bold; }
  .sign-block .controller-title { font-weight: bold; margin-top: 2px; }
</style>
</head>
<body>
  <table class="letterhead">
    <tr><td><?php if ($logoDataUri): ?><img src="<?= e($logoDataUri) ?>" style="height:60px" /><?php endif; ?></td></tr>
    <tr><td class="l1 hindi">जम्मू केंद्रीय विश्वविद्यालय</td></tr>
    <tr><td class="l2">Central University of Jammu</td></tr>
    <tr><td class="l3 hindi">राया-सूचानी (बागला)-181143, सांबा, जम्मू (जम्मू और कश्मीर)</td></tr>
    <tr><td class="l4">Rahya-Suchani (Bagla), Samba-181143, Jammu</td></tr>
  </table>
  <hr class="rule" />
  <table class="refrow">
    <tr>
      <td style="text-align:left"><?= e($refNo) ?></td>
      <td style="text-align:right"><?= e(long_date($issuedOn)) ?></td>
    </tr>
  </table>
  <div class="title"><?= e($title) ?></div>
  <div class="dept-line"><?= e(mb_strtoupper($departmentName)) ?></div>
  <div class="program-line"><?= $programLine ?></div>

  <table class="datesheet">
    <thead>
      <tr>
        <th style="width:20%">Date</th>
        <th style="width:18%">Course Code</th>
        <th style="width:42%">Courses Name</th>
        <th style="width:20%">Time</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($rows as $row): ?>
      <tr>
        <td class="date-cell"><?= e(ddmmyyyy($row['exam_date'])) ?><span class="weekday">(<?= e(weekday_of($row['exam_date'])) ?>)</span></td>
        <td class="code-cell">(<?= e($row['course_code']) ?>)</td>
        <td class="name-cell"><?= e($row['course_name']) ?></td>
        <td class="time-cell"><?= e($row['time_slot_label']) ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <table class="footer">
    <tr>
      <td class="to-block" style="width:50%">
        <div>To</div>
        <div class="head-line">The Head,</div>
        <div><?= e($departmentName) ?></div>
      </td>
      <td class="sign-block" style="width:50%">
        <?php if ($signatureDataUri): ?><img src="<?= e($signatureDataUri) ?>" /><?php endif; ?>
        <?php if ($controllerName): ?><div class="controller-name"><?= e($controllerName) ?></div><?php endif; ?>
        <div class="controller-title"><?= e($controllerTitle) ?></div>
      </td>
    </tr>
  </table>
</body>
</html>
