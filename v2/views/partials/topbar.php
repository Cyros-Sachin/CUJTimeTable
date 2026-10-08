<?php
/** @var string $pageTitle */
/** @var array|null $user */
?>
<header class="app-topbar">
  <div class="d-flex align-items-center gap-3">
    <button class="btn btn-link d-lg-none p-0" id="sidebarToggle" aria-label="Open menu">
      <i class="bi bi-list fs-4"></i>
    </button>
    <h1 class="h5 mb-0"><?= e($pageTitle) ?></h1>
  </div>
  <?php if ($user): ?>
  <div class="dropdown">
    <button class="btn btn-outline-secondary btn-sm dropdown-toggle rounded-pill" type="button" data-bs-toggle="dropdown">
      <?= e($user['name']) ?>
    </button>
    <ul class="dropdown-menu dropdown-menu-end">
      <li><a class="dropdown-item" href="/change-password"><i class="bi bi-key me-2"></i>Change password</a></li>
      <li><a class="dropdown-item text-danger" href="/logout"><i class="bi bi-box-arrow-right me-2"></i>Log out</a></li>
    </ul>
  </div>
  <?php endif; ?>
</header>
<script>
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('appSidebar').classList.add('open');
    document.getElementById('sidebarBackdrop').classList.remove('d-none');
  });
</script>
