<?php
/** @var string $activeNav */
/** @var array|null $user */

$items = [
    ['nav' => 'dashboard', 'href' => '/dashboard', 'icon' => 'bi-speedometer2', 'label' => 'Dashboard', 'roles' => ['DEPT_COORDINATOR', 'EXAM_CELL']],
    ['nav' => 'entries', 'href' => '/entries/new', 'icon' => 'bi-file-earmark-plus', 'label' => 'Add Entry', 'roles' => ['DEPT_COORDINATOR', 'EXAM_CELL']],
    ['nav' => 'datesheets', 'href' => '/datesheets', 'icon' => 'bi-calendar3', 'label' => 'Date Sheet', 'roles' => ['DEPT_COORDINATOR', 'EXAM_CELL']],
    ['nav' => 'consolidated', 'href' => '/consolidated', 'icon' => 'bi-table', 'label' => 'Consolidated', 'roles' => ['EXAM_CELL']],
    ['nav' => 'admin', 'href' => '/admin', 'icon' => 'bi-gear', 'label' => 'Admin', 'roles' => ['EXAM_CELL']],
];
?>
<aside class="app-sidebar" id="appSidebar">
  <div class="p-3 border-bottom">
    <div class="fw-bold text-primary" style="color: var(--cuj-primary)!important;">CUJ Date Sheet</div>
    <div class="text-muted small">Exam Automation</div>
  </div>
  <nav class="d-flex flex-column gap-1 p-2">
    <?php foreach ($items as $item): if ($user && !in_array($user['role'], $item['roles'], true)) continue; ?>
      <a class="nav-link-app <?= $activeNav === $item['nav'] ? 'active' : '' ?>" href="<?= e($item['href']) ?>">
        <i class="bi <?= e($item['icon']) ?>"></i> <?= e($item['label']) ?>
      </a>
    <?php endforeach; ?>
  </nav>
  <?php if ($user): ?>
  <div class="mt-auto p-3 border-top small text-muted">
    <div class="fw-semibold text-dark"><?= e($user['name']) ?></div>
    <div><?= e($user['department_name'] ?? 'Exam Cell') ?></div>
  </div>
  <?php endif; ?>
</aside>
<div class="sidebar-backdrop d-none" id="sidebarBackdrop"></div>
<script>
  document.getElementById('sidebarBackdrop')?.addEventListener('click', () => {
    document.getElementById('appSidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop').classList.add('d-none');
  });
</script>
