<?php
/** @var string|null $logoDataUri */
/** @var string|null $signatureDataUri */
/** @var string $controllerName */
/** @var string $controllerTitle */
/** @var array $cycle */
/** @var array $slots       DutyService::overview()['slots'] */
/** @var string $issuedOn */
/** @var string|null $serial */
/** @var string|null $note */

$serial = $serial ?? null;
$note = $note ?? null;
$title = 'INVIGILATION DUTY CHART - ' . mb_strtoupper($cycle['title']) . ' - ' . $cycle['month_year'];
$people = static function (array $list): string {
    if (!$list) {
        return '&mdash;';
    }
    $out = [];
    foreach ($list as $i => $a) {
        $out[] = '<b>' . ($i + 1) . '.</b> ' . pdf_text($a['name']) . ' <span class="code">(' . e($a['employee_code']) . ($a['department_code'] ? ', ' . e($a['department_code']) : '') . ')</span>';
    }
    // Names flow inline (separated by semicolons) so a 40-invigilator slot takes a few lines, not 40.
    return implode('; ', $out);
};
// With a seating allotment: one line per room / class, its student count and its teachers.
$invigilators = static function (array $s) use ($people): string {
    if (!$s['has_seating']) {
        return $people($s['invigilators']);
    }
    $lines = [];
    foreach ($s['rooms'] as $room) {
        $lines[] = '<b>' . pdf_text($room['room']) . '</b> <span class="code">(' . (int) $room['students'] . ' students)</span>: '
            . ($room['invigilators'] ? $people($room['invigilators']) : '&mdash;')
            . ($room['shortfall'] > 0 ? ' <span class="shorttext">[' . (int) $room['shortfall'] . ' short]</span>' : '');
    }
    if ($s['unroomed']) {
        $lines[] = '<i>No room yet:</i> ' . $people($s['unroomed']);
    }
    return implode('<br />', $lines);
};
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: "DejaVu Serif", serif; color: #000; font-size: 11px; }
  .hindi { font-family: "lohitdevanagari", sans-serif; }
  table.letterhead { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.letterhead td { padding: 0; }
  .l1 { font-size: 18px; font-weight: bold; }
  .l2 { font-size: 17px; font-weight: bold; }
  .l3, .l4 { font-size: 11px; }
  .rule { border: none; border-top: 1.5px solid #000; margin: 4px 0; }
  table.refrow { width: 100%; border-collapse: collapse; font-size: 11px; margin: 4px 0; }
  table.refrow td { padding: 0; }
  .title { text-align: center; font-weight: bold; text-decoration: underline; font-size: 14px; margin: 8px 0 10px; }
  table.chart { width: 100%; border-collapse: collapse; }
  table.chart th, table.chart td { border: 1px solid #000; padding: 4px 6px; font-size: 10.5px; vertical-align: top; }
  table.chart th { text-align: center; font-weight: bold; background: #e5e7eb; }
  table.chart tr { page-break-inside: avoid; }
  td.center { text-align: center; }
  td.nowrap { white-space: nowrap; }
  td.people { line-height: 1.45; }
  td.short { color: #b91c1c; font-weight: bold; text-align: center; }
  .shorttext { color: #b91c1c; font-weight: bold; }
  .code { font-size: 9.5px; color: #333; }
  table.footer { width: 100%; border-collapse: collapse; margin-top: 30px; }
  table.footer td { vertical-align: top; padding: 0; font-size: 12px; }
  .sign-block { text-align: center; }
  .sign-block img { height: 46px; }
  .doc-note { margin-top: 14px; font-size: 11px; }
</style>
</head>
<body>
  <table class="letterhead">
    <tr>
      <td style="width:15%; text-align:left; vertical-align:middle;"><?php if ($logoDataUri): ?><img src="<?= e($logoDataUri) ?>" style="height:60px" /><?php endif; ?></td>
      <td style="width:70%; text-align:center; vertical-align:middle;">
        <div class="l1 hindi">जम्मू केंद्रीय विश्वविद्यालय</div>
        <div class="l2">Central University of Jammu</div>
        <div class="l3 hindi">राया-सूचानी (बागला)-181143, सांबा, जम्मू (जम्मू और कश्मीर)</div>
        <div class="l4">Rahya-Suchani (Bagla), Samba-181143, Jammu</div>
      </td>
      <td style="width:15%;"></td>
    </tr>
  </table>
  <hr class="rule" />
  <table class="refrow">
    <tr>
      <td style="text-align:left"><?= $serial !== null ? e($serial) : e('CUJ/Exam/Invigilation/' . date('Y', strtotime($issuedOn)) . '/') ?></td>
      <td style="text-align:right"><?= e(long_date($issuedOn)) ?></td>
    </tr>
  </table>
  <div class="title"><?= pdf_text($title) ?></div>

  <table class="chart">
    <thead>
      <tr>
        <th style="width:5%">S.No</th>
        <th style="width:9%">Date (Day)</th>
        <th style="width:12%">Time</th>
        <th style="width:7%">Papers / Students</th>
        <th style="width:47%">Invigilators (room-wise)</th>
        <th style="width:15%">Reserve</th>
        <th style="width:5%">Short</th>
      </tr>
    </thead>
    <tbody>
      <?php foreach ($slots as $i => $s): $short = $s['shortfall'] + $s['reserve_shortfall']; ?>
      <tr>
        <td class="center"><?= $i + 1 ?></td>
        <td class="center"><?= e(ddmmyyyy($s['exam_date'])) ?><br />(<?= e($s['weekday']) ?>)</td>
        <td class="center nowrap"><?= e($s['time_slot_label']) ?></td>
        <td class="center"><?= (int) $s['paper_count'] ?> / <?= (int) $s['total_students'] ?><?php if ($s['has_seating']): ?><br /><span class="code"><?= count($s['rooms']) ?> rooms</span><?php endif; ?></td>
        <td class="people"><?= $invigilators($s) ?></td>
        <td class="people"><?= $people($s['reserves']) ?></td>
        <td class="<?= $short > 0 ? 'short' : 'center' ?>"><?= $short > 0 ? $short : '&ndash;' ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>

  <table class="footer">
    <tr>
      <td style="width:55%;"></td>
      <td class="sign-block" style="width:45%;">
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
