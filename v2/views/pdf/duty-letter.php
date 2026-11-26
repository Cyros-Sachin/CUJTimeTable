<?php
/** @var string|null $logoDataUri */
/** @var string|null $signatureDataUri */
/** @var string $controllerName */
/** @var string $controllerTitle */
/** @var array $cycle */
/** @var array $person      one DutyService::overview()['staff_load'] row */
/** @var string $issuedOn */
/** @var string|null $serial */
/** @var string|null $note */

$serial = $serial ?? null;
$note = $note ?? null;
$examName = $cycle['title'] . ' - ' . $cycle['month_year'];
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: "DejaVu Serif", serif; color: #000; font-size: 13px; }
  .hindi { font-family: "lohitdevanagari", sans-serif; }
  table.letterhead { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.letterhead td { padding: 0; }
  .l1 { font-size: 20px; font-weight: bold; }
  .l2 { font-size: 19px; font-weight: bold; }
  .l3, .l4 { font-size: 12px; }
  .rule { border: none; border-top: 1.5px solid #000; margin: 4px 0; }
  table.refrow { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0 14px; }
  table.refrow td { padding: 0; }
  .to-block div { margin: 1px 0; }
  .subject { margin: 16px 0 12px; font-weight: bold; }
  .body-text { text-align: justify; line-height: 1.5; margin-bottom: 12px; }
  table.duties { width: 100%; border-collapse: collapse; margin: 6px 0 14px; }
  table.duties th, table.duties td { border: 1px solid #000; padding: 6px 8px; font-size: 12.5px; text-align: center; }
  table.duties th { background: #e5e7eb; }
  ol.instructions { margin: 4px 0 0 18px; padding: 0; font-size: 12px; line-height: 1.5; }
  table.footer { width: 100%; border-collapse: collapse; margin-top: 36px; }
  table.footer td { vertical-align: top; padding: 0; font-size: 13px; }
  .sign-block { text-align: center; }
  .sign-block img { height: 50px; }
  .doc-note { margin-top: 16px; font-size: 12px; }
</style>
</head>
<body>
  <table class="letterhead">
    <tr>
      <td style="width:20%; text-align:left; vertical-align:middle;"><?php if ($logoDataUri): ?><img src="<?= e($logoDataUri) ?>" style="height:70px" /><?php endif; ?></td>
      <td style="width:60%; text-align:center; vertical-align:middle;">
        <div class="l1 hindi">जम्मू केंद्रीय विश्वविद्यालय</div>
        <div class="l2">Central University of Jammu</div>
        <div class="l3 hindi">राया-सूचानी (बागला)-181143, सांबा, जम्मू (जम्मू और कश्मीर)</div>
        <div class="l4">Rahya-Suchani (Bagla), Samba-181143, Jammu</div>
      </td>
      <td style="width:20%;"></td>
    </tr>
  </table>
  <hr class="rule" />
  <table class="refrow">
    <tr>
      <td style="text-align:left"><?= $serial !== null ? e($serial) : e('CUJ/Exam/Invigilation/' . date('Y', strtotime($issuedOn)) . '/') ?></td>
      <td style="text-align:right"><?= e(long_date($issuedOn)) ?></td>
    </tr>
  </table>

  <div class="to-block">
    <div>To</div>
    <div style="font-weight:bold"><?= pdf_text($person['name']) ?> (<?= e($person['employee_code']) ?>)</div>
    <?php if (!empty($person['designation'])): ?><div><?= pdf_text($person['designation']) ?></div><?php endif; ?>
    <?php if (!empty($person['department_name'])): ?><div><?= pdf_text($person['department_name']) ?></div><?php endif; ?>
    <div>Central University of Jammu</div>
  </div>

  <div class="subject">Subject: Invigilation duty for the <?= pdf_text($examName) ?></div>

  <div class="body-text">
    Sir/Madam,<br />
    You have been assigned invigilation duty for the <?= pdf_text($examName) ?> on the dates and sessions
    listed below. You are requested to report at the examination centre at least 30 minutes before the
    start of each session.
  </div>

  <table class="duties">
    <thead>
      <tr><th style="width:7%">S.No</th><th style="width:17%">Date</th><th style="width:16%">Day</th><th style="width:22%">Time</th><th style="width:18%">Room / Class</th><th style="width:20%">Duty</th></tr>
    </thead>
    <tbody>
      <?php foreach ($person['duties'] as $i => $d): ?>
      <tr>
        <td><?= $i + 1 ?></td>
        <td><?= e(ddmmyyyy($d['exam_date'])) ?></td>
        <td><?= e($d['weekday']) ?></td>
        <td><?= e($d['time_slot_label']) ?></td>
        <td><?= $d['room'] ? pdf_text($d['room']) : '&ndash;' ?></td>
        <td><?= $d['role'] === 'RESERVE' ? 'Reserve Invigilator' : 'Invigilator' ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <div style="font-weight:bold">Instructions</div>
  <ol class="instructions">
    <li>Duties can be exchanged only with the prior approval of the Examination Branch.</li>
    <li>Reserve invigilators must report at the scheduled time and remain available for the whole session.</li>
    <li>If you cannot perform a duty, inform the Examination Branch in writing well in advance.</li>
  </ol>

  <table class="footer">
    <tr>
      <td style="width:50%;"></td>
      <td class="sign-block" style="width:50%;">
        <?php if ($signatureDataUri): ?><img src="<?= e($signatureDataUri) ?>" /><?php endif; ?>
        <?php if ($controllerName): ?><div style="font-weight:bold"><?= pdf_text($controllerName) ?></div><?php endif; ?>
        <div style="font-weight:bold"><?= e($controllerTitle) ?></div>
      </td>
    </tr>
  </table>
  <?php if ($note !== null && $note !== ''): ?>
  <div class="doc-note"><?= nl2br(pdf_text($note)) ?></div>
  <?php endif; ?>
</body>
</html>
