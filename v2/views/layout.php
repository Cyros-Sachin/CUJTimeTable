<?php
/** @var string $pageTitle */
/** @var string $activeNav */
/** @var array $user */
/** @var string $content */

use App\Core\View;

$pageScripts = [
    'entries' => 'entry-form.js',
    'datesheets' => 'datesheet.js',
    'consolidated' => 'consolidated.js',
    'admin' => 'admin.js',
    'dashboard' => 'dashboard.js',
];
$script = $pageScripts[$activeNav ?? ''] ?? null;
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="csrf-token" content="<?= e(csrf_token()) ?>" />
  <title><?= e($pageTitle) ?> · CUJ Date Sheet</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600&display=swap" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.css" rel="stylesheet" />
  <link href="/assets/css/app.css" rel="stylesheet" />
</head>
<body>
  <div class="app-shell">
    <?= View::renderPartial('partials/sidebar', ['activeNav' => $activeNav ?? '', 'user' => $user ?? null]) ?>
    <div class="app-main">
      <?= View::renderPartial('partials/topbar', ['pageTitle' => $pageTitle, 'user' => $user ?? null]) ?>
      <main class="app-content">
        <?= View::renderPartial('partials/flash') ?>
        <?= $content ?>
      </main>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/flatpickr@4.6.13/dist/flatpickr.min.js"></script>
  <?php if ($script): ?>
  <script type="module" src="/assets/js/<?= e($script) ?>?v=<?= (int) @filemtime(__DIR__ . '/../public/assets/js/' . $script) ?>"></script>
  <?php endif; ?>
</body>
</html>
