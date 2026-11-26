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

// Compact layout: one shaded band per session, then its rooms four to a line
// (room | students | invigilators), so the whole cycle fits in a few landscape pages.
$serial = $serial ?? null;
$note = $note ?? null;
$perLine = 4;
$title = 'INVIGILATION DUTY CHART - ' . mb_strtoupper($cycle['title']) . ' - ' . $cycle['month_year'];

$person = static fn (array $a): string => pdf_text($a['name']) . ' <span class="code">' . e($a['employee_code']) . '</span>';
$people = static fn (array $list): string => $list ? implode('<br />', array_map($person, $list)) : '<span class="muted">&mdash;</span>';
$inline = static fn (array $list): string => $list ? implode(', ', array_map($person, $list)) : '&mdash;';

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
  body { font-family: "DejaVu Sans Condensed", sans-serif; color: #000; font-size: 7.6pt; }
  .hindi { font-family: "lohitdevanagari", sans-serif; }
  .serif { font-family: "DejaVu Serif", serif; }
  table.letterhead { width: 100%; border-collapse: collapse; }
  table.letterhead td { padding: 0; }
  .l1 { font-size: 13pt; font-weight: bold; }
  .l2 { font-size: 12.5pt; font-weight: bold; }
  .l3, .l4 { font-size: 8pt; }
  .rule { border: none; border-top: 1.2px solid #000; margin: 3px 0; }
  table.refrow { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin: 2px 0; }
  table.refrow td { padding: 0; }
  .title { text-align: center; font-weight: bold; text-decoration: underline; font-size: 10.5pt; margin: 4px 0 2px; }
  .summary { text-align: center; font-size: 8pt; color: #333; margin-bottom: 5px; }
  table.chart { width: 100%; border-collapse: collapse; }
  table.chart td { border: 0.6px solid #777; padding: 1.6px 3px; vertical-align: top; }
  table.chart tr { page-break-inside: avoid; }
  tr.band td { background: #1e3a8a; color: #fff; border-color: #1e3a8a; padding: 3px 5px; font-size: 8.3pt; }
  tr.band .when { font-weight: bold; font-size: 8.8pt; }
  tr.band .res { color: #dbe4ff; }
  tr.band .res b { color: #fff; }
  td.room { font-weight: bold; background: #f1f4fa; }
  td.st { text-align: center; background: #f1f4fa; color: #333; }
  td.blank { border: none; }
  td.wide { background: #fff; }
  .code { color: #555; font-size: 6.8pt; }
  .muted { color: #999; }
  .short { color: #b91c1c; font-weight: bold; }
  tr.gap td { border: none; height: 3px; padding: 0; }
  table.footer { width: 100%; border-collapse: collapse; margin-top: 14px; }
  table.footer td { vertical-align: top; padding: 0; font-size: 9pt; }
  .sign-block { text-align: center; }
  .sign-block img { height: 38px; }
  .doc-note { margin-top: 8px; font-size: 8.5pt; }
</style>
</head>
<body>
  <table class="letterhead">
    <tr>
      <td style="width:12%; text-align:left; vertical-align:middle;"><?php if ($logoDataUri): ?><img src="<?= e($logoDataUri) ?>" style="height:44px" /><?php endif; ?></td>
      <td style="width:76%; text-align:center; vertical-align:middle;" class="serif">
        <div class="l1 hindi">जम्मू केंद्रीय विश्वविद्यालय</div>
        <div class="l2">Central University of Jammu</div>
        <div class="l3 hindi">राया-सूचानी (बागला)-181143, सांबा, जम्मू (जम्मू और कश्मीर)</div>
        <div class="l4">Rahya-Suchani (Bagla), Samba-181143, Jammu</div>
      </td>
      <td style="width:12%;"></td>
    </tr>
  </table>
  <hr class="rule" />
  <table class="refrow serif">
    <tr>
      <td style="text-align:left"><?= $serial !== null ? e($serial) : e('CUJ/Exam/Invigilation/' . date('Y', strtotime($issuedOn)) . '/') ?></td>
      <td style="text-align:right"><?= e(long_date($issuedOn)) ?></td>
    </tr>
  </table>
  <div class="title serif"><?= pdf_text($title) ?></div>
  <div class="summary">
    <?= count($slots) ?> sessions &middot; <?= $totRooms ?> rooms &middot; <?= $totInv ?> invigilator duties<?php if ($totRes): ?> &middot; <?= $totRes ?> reserve duties<?php endif; ?>
    <?php if ($totShort): ?> &middot; <span class="short"><?= $totShort ?> unfilled</span><?php endif; ?>
    &nbsp;|&nbsp; Each room: room &middot; students &middot; invigilators (employee code)
  </div>

  <table class="chart">
    <?php foreach ($slots as $si => $s):
        $short = $s['shortfall'] + $s['reserve_shortfall']; ?>
      <?php if ($si > 0): ?><tr class="gap"><td colspan="<?= $perLine * 3 ?>"></td></tr><?php endif; ?>
      <tr class="band">
        <td colspan="<?= $perLine * 3 ?>">
          <span class="when"><?= e(ddmmyyyy($s['exam_date'])) ?> (<?= e($s['weekday']) ?>) &nbsp; <?= e($s['time_slot_label']) ?></span>
          &nbsp;&middot;&nbsp; <?= (int) $s['paper_count'] ?> papers &middot; <?= (int) $s['total_students'] ?> students
          <?php if ($s['has_seating']): ?>&middot; <?= count($s['rooms']) ?> rooms<?php endif; ?>
          &middot; <?= (int) $s['required'] ?> invigilators
          <?php if ($short): ?>&middot; <b><?= $short ?> unfilled</b><?php endif; ?>
          <?php if ($s['reserves']): ?>
            &nbsp;&nbsp;<span class="res"><b>Reserve:</b> <?= implode(', ', array_map(static fn ($a) => pdf_text($a['name']) . ' (' . e($a['employee_code']) . ')', $s['reserves'])) ?></span>
          <?php endif; ?>
        </td>
      </tr>
      <?php if ($s['has_seating']): ?>
        <?php foreach (array_chunk($s['rooms'], $perLine) as $line): ?>
        <tr>
          <?php foreach ($line as $room): ?>
            <td class="room" style="width:11%"><?= pdf_text($room['room']) ?></td>
            <td class="st" style="width:2.6%"><?= (int) $room['students'] ?></td>
            <td style="width:11.4%"><?= $people($room['invigilators']) ?><?php if ($room['shortfall'] > 0): ?><br /><span class="short"><?= (int) $room['shortfall'] ?> short</span><?php endif; ?></td>
          <?php endforeach; ?>
          <?php for ($i = count($line); $i < $perLine; $i++): ?><td class="blank"></td><td class="blank"></td><td class="blank"></td><?php endfor; ?>
        </tr>
        <?php endforeach; ?>
        <?php if ($s['unroomed']): ?>
        <tr><td class="room">No room yet</td><td class="wide" colspan="<?= $perLine * 3 - 1 ?>"><?= $inline($s['unroomed']) ?></td></tr>
        <?php endif; ?>
      <?php else: ?>
        <tr><td class="room">No seating</td><td class="wide" colspan="<?= $perLine * 3 - 1 ?>"><?= $inline($s['invigilators']) ?></td></tr>
      <?php endif; ?>
    <?php endforeach; ?>
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
