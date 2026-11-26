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

// One clean table: a column per field, one row per room, a shaded header row per session.
// Column headings repeat on every page (thead).
$serial = $serial ?? null;
$note = $note ?? null;
$invCols = 2;
foreach ($slots as $s) {
    foreach ($s['rooms'] as $r) {
        $invCols = max($invCols, count($r['invigilators']));
    }
}
$invCols = min($invCols, 4);
$cols = 4 + $invCols;
$invW = round(64 / $invCols, 2);
$title = 'INVIGILATION DUTY CHART - ' . mb_strtoupper($cycle['title']) . ' - ' . $cycle['month_year'];

$person = static fn (array $a): string => pdf_text($a['name']) . ' <span class="code">(' . e($a['employee_code']) . ')</span>';
$inline = static fn (array $list): string => $list ? implode(' &nbsp;&middot;&nbsp; ', array_map($person, $list)) : '<span class="muted">&mdash;</span>';

$totRooms = 0;
$totInv = 0;
$totRes = 0;
$totShort = 0;
foreach ($slots as $s) {
    $totRooms += count($s['rooms']);
    $totInv += count($s['invigilators']);
    $totRes += count($s['reserves']);
    $totShort += $s['shortfall'] + $s['reserve_shortfall'];
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { font-family: "DejaVu Sans Condensed", sans-serif; color: #000; font-size: 7pt; }
  .hindi { font-family: "lohitdevanagari", sans-serif; }
  .serif { font-family: "DejaVu Serif", serif; }
  table.letterhead { width: 100%; border-collapse: collapse; }
  table.letterhead td { padding: 0; }
  .l1 { font-size: 11.5pt; font-weight: bold; }
  .l2 { font-size: 11pt; font-weight: bold; }
  .l3 { font-size: 7.5pt; }
  .rule { border: none; border-top: 1px solid #000; margin: 2px 0; }
  table.refrow { width: 100%; border-collapse: collapse; font-size: 8pt; }
  table.refrow td { padding: 0; }
  .title { text-align: center; font-weight: bold; font-size: 10pt; margin: 2px 0 1px; }
  .summary { text-align: center; font-size: 7.5pt; color: #444; margin-bottom: 4px; }
  table.chart { width: 100%; border-collapse: collapse; }
  table.chart th, table.chart td { border: 0.5px solid #8a94a6; padding: 2px 4px; vertical-align: middle; }
  table.chart thead th { background: #1e3a8a; color: #fff; font-size: 7.4pt; text-align: center; border-color: #1e3a8a; }
  table.chart tr { page-break-inside: avoid; }
  tr.sess td { background: #dbe4f5; font-size: 7.8pt; padding: 3px 5px; border-top: 1px solid #1e3a8a; }
  tr.sess .when { font-weight: bold; color: #1e3a8a; font-size: 8.2pt; }
  tr.sess .meta { color: #333; }
  tr.res td { background: #f3f6fb; font-size: 7pt; }
  tr.alt td { background: #fafbfd; }
  td.c { text-align: center; }
  td.rm { font-weight: bold; }
  td.crs { font-size: 6.4pt; color: #333; }
  .code { color: #666; font-size: 6.4pt; }
  .muted { color: #aaa; }
  .short { color: #b91c1c; font-weight: bold; }
  table.footer { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.footer td { vertical-align: top; padding: 0; font-size: 8.5pt; }
  .sign-block { text-align: center; }
  .sign-block img { height: 34px; }
  .doc-note { margin-top: 6px; font-size: 8pt; }
</style>
</head>
<body>
  <table class="letterhead">
    <tr>
      <td style="width:12%; text-align:left; vertical-align:middle;"><?php if ($logoDataUri): ?><img src="<?= e($logoDataUri) ?>" style="height:36px" /><?php endif; ?></td>
      <td style="width:76%; text-align:center; vertical-align:middle;" class="serif">
        <div class="l1 hindi">जम्मू केंद्रीय विश्वविद्यालय</div>
        <div class="l2">Central University of Jammu</div>
        <div class="l3">Rahya-Suchani (Bagla), Samba-181143, Jammu</div>
      </td>
      <td style="width:12%;"></td>
    </tr>
  </table>
  <hr class="rule" />
  <table class="refrow serif">
    <tr>
      <td style="text-align:left"><?= $serial !== null ? e($serial) : e('CUJ/Exam/Invigilation/' . date('Y', strtotime($issuedOn)) . '/') ?></td>
      <td style="text-align:center; font-weight:bold; font-size:9.5pt;"><?= pdf_text($title) ?></td>
      <td style="text-align:right"><?= e(long_date($issuedOn)) ?></td>
    </tr>
  </table>
  <div class="summary">
    <?= count($slots) ?> sessions &middot; <?= $totRooms ?> rooms &middot; <?= $totInv ?> invigilator duties<?php if ($totRes): ?> &middot; <?= $totRes ?> reserve duties<?php endif; ?>
    <?php if ($totShort): ?> &middot; <span class="short"><?= $totShort ?> unfilled</span><?php endif; ?>
  </div>

  <table class="chart">
    <thead>
      <tr>
        <th style="width:4%">S.No.</th>
        <th style="width:13%">Room / Class</th>
        <th style="width:5%">Students</th>
        <th style="width:14%">Course Codes</th>
        <?php for ($i = 1; $i <= $invCols; $i++): ?><th style="width:<?= $invW ?>%">Invigilator <?= $i ?></th><?php endfor; ?>
      </tr>
    </thead>
    <tbody>
    <?php foreach ($slots as $s):
        $short = $s['shortfall'] + $s['reserve_shortfall']; ?>
      <tr class="sess">
        <td colspan="<?= $cols ?>">
          <span class="when"><?= e(ddmmyyyy($s['exam_date'])) ?> (<?= e($s['weekday']) ?>) &nbsp;&middot;&nbsp; <?= e($s['time_slot_label']) ?></span>
          <span class="meta">&nbsp;&nbsp;|&nbsp; <?= (int) $s['paper_count'] ?> papers &middot; <?= (int) $s['total_students'] ?> students<?php if ($s['has_seating']): ?> &middot; <?= count($s['rooms']) ?> rooms<?php endif; ?> &middot; <?= (int) $s['required'] ?> invigilators</span>
          <?php if ($short): ?>&nbsp;&middot; <span class="short"><?= $short ?> unfilled</span><?php endif; ?>
        </td>
      </tr>
      <?php if ($s['has_seating']): ?>
        <?php foreach ($s['rooms'] as $ri => $room):
            $inv = $room['invigilators'];
            $extra = array_slice($inv, $invCols); ?>
        <tr<?= $ri % 2 ? ' class="alt"' : '' ?>>
          <td class="c"><?= $ri + 1 ?></td>
          <td class="rm"><?= pdf_text($room['room']) ?></td>
          <td class="c"><?= (int) $room['students'] ?></td>
          <td class="crs"><?= !empty($room['courses']) ? e(implode(', ', array_column($room['courses'], 'code'))) : '<span class="muted">&ndash;</span>' ?></td>
          <?php for ($i = 0; $i < $invCols; $i++): ?>
            <td>
              <?php if (isset($inv[$i])): ?><?= $person($inv[$i]) ?><?php if ($i === $invCols - 1 && $extra): ?>, <?= implode(', ', array_map($person, $extra)) ?><?php endif; ?>
              <?php elseif ($i < $room['required']): ?><span class="short">Not assigned</span>
              <?php else: ?><span class="muted">&ndash;</span><?php endif; ?>
            </td>
          <?php endfor; ?>
        </tr>
        <?php endforeach; ?>
        <?php if ($s['unroomed']): ?>
        <tr><td></td><td class="rm">No room yet</td><td colspan="<?= $cols - 2 ?>"><?= $inline($s['unroomed']) ?></td></tr>
        <?php endif; ?>
      <?php else: ?>
        <tr><td></td><td class="rm">Invigilators</td><td colspan="<?= $cols - 2 ?>"><?= $inline($s['invigilators']) ?></td></tr>
      <?php endif; ?>
      <?php if ($s['reserves']): ?>
        <tr class="res"><td></td><td class="rm">Reserve</td><td colspan="<?= $cols - 2 ?>"><?= $inline($s['reserves']) ?></td></tr>
      <?php endif; ?>
    <?php endforeach; ?>
    </tbody>
  </table>

  <table class="footer serif">
    <tr>
      <td style="width:60%;"></td>
      <td class="sign-block" style="width:40%;">
        <?php if ($signatureDataUri): ?><img src="<?= e($signatureDataUri) ?>" /><?php endif; ?>
        <?php if ($controllerName): ?><div style="font-weight:bold"><?= pdf_text($controllerName) ?></div><?php endif; ?>
        <div style="font-weight:bold"><?= e($controllerTitle) ?></div>
      </td>
    </tr>
  </table>
  <?php if ($note !== null && $note !== ''): ?>
  <div class="doc-note serif"><?= nl2br(pdf_text($note)) ?></div>
  <?php endif; ?>
</body>
</html>
