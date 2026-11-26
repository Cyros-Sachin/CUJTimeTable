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

// Compact grid: a thin band per session, then one cell per room (room · students on top,
// invigilators below, one per line), six rooms to a line, so a whole cycle fits in a few pages.
$serial = $serial ?? null;
$note = $note ?? null;
$perLine = 6;
$cellW = round(100 / $perLine, 3) . '%';
$title = 'INVIGILATION DUTY CHART - ' . mb_strtoupper($cycle['title']) . ' - ' . $cycle['month_year'];

$person = static fn (array $a): string => pdf_text($a['name']) . ' <span class="code">' . e($a['employee_code']) . '</span>';
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
  table.chart { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.chart td { border: 0.5px solid #999; padding: 1.5px 3px 2px; vertical-align: top; line-height: 1.25; }
  table.chart tr { page-break-inside: avoid; }
  tr.band td { background: #1e3a8a; color: #fff; border-color: #1e3a8a; padding: 2.5px 5px; font-size: 7.8pt; }
  tr.band .when { font-weight: bold; font-size: 8.4pt; }
  tr.band .meta { color: #dbe4ff; }
  tr.res td { background: #eef2ff; font-size: 7pt; padding: 2px 5px; }
  .rm { font-weight: bold; color: #1e3a8a; }
  .st { color: #555; }
  .code { color: #666; font-size: 6.2pt; }
  .muted { color: #999; }
  .short { color: #b91c1c; font-weight: bold; }
  td.blank { border: none !important; }
  tr.gap td { border: none; height: 4px; padding: 0; }
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
    <?php foreach ($slots as $si => $s):
        $short = $s['shortfall'] + $s['reserve_shortfall']; ?>
      <?php if ($si > 0): ?><tr class="gap"><td colspan="<?= $perLine ?>"></td></tr><?php endif; ?>
      <tr class="band">
        <td colspan="<?= $perLine ?>">
          <span class="when"><?= e(ddmmyyyy($s['exam_date'])) ?> (<?= e($s['weekday']) ?>) &nbsp;|&nbsp; <?= e($s['time_slot_label']) ?></span>
          <span class="meta">&nbsp;&nbsp;<?= (int) $s['paper_count'] ?> papers &middot; <?= (int) $s['total_students'] ?> students<?php if ($s['has_seating']): ?> &middot; <?= count($s['rooms']) ?> rooms<?php endif; ?> &middot; <?= (int) $s['required'] ?> invigilators</span>
          <?php if ($short): ?>&nbsp;&middot; <b><?= $short ?> unfilled</b><?php endif; ?>
        </td>
      </tr>
      <?php if ($s['reserves']): ?>
      <tr class="res"><td colspan="<?= $perLine ?>"><b>Reserve:</b> <?= $inline($s['reserves']) ?></td></tr>
      <?php endif; ?>
      <?php if ($s['has_seating']): ?>
        <?php foreach (array_chunk($s['rooms'], $perLine) as $line): ?>
        <tr>
          <?php foreach ($line as $room): ?>
            <td style="width:<?= $cellW ?>">
              <span class="rm"><?= pdf_text($room['room']) ?></span> <span class="st">(<?= (int) $room['students'] ?>)</span><br />
              <?= $room['invigilators'] ? implode('<br />', array_map($person, $room['invigilators'])) : '<span class="muted">&mdash;</span>' ?>
              <?php if ($room['shortfall'] > 0): ?><br /><span class="short"><?= (int) $room['shortfall'] ?> short</span><?php endif; ?>
            </td>
          <?php endforeach; ?>
          <?php for ($i = count($line); $i < $perLine; $i++): ?><td class="blank" style="width:<?= $cellW ?>"></td><?php endfor; ?>
        </tr>
        <?php endforeach; ?>
        <?php if ($s['unroomed']): ?>
        <tr><td colspan="<?= $perLine ?>"><span class="rm">No room yet:</span> <?= $inline($s['unroomed']) ?></td></tr>
        <?php endif; ?>
      <?php else: ?>
        <tr><td colspan="<?= $perLine ?>"><span class="rm">Invigilators:</span> <?= $inline($s['invigilators']) ?></td></tr>
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
