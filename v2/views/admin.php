<?php
/** @var string $tab */
$tabs = [
    'departments' => 'Departments',
    'programs' => 'Programs',
    'time-slots' => 'Time Slots',
    'subject-types' => 'Subject Types',
    'sessions-cycles' => 'Sessions & Cycles',
    'users' => 'Users',
    'branding' => 'Letterhead & Signature',
    'audit-log' => 'Audit Log',
];
?>
<ul class="nav nav-tabs mb-4" id="adminTabs">
  <?php foreach ($tabs as $slug => $label): ?>
  <li class="nav-item">
    <a class="nav-link <?= $tab === $slug ? 'active' : '' ?>" href="/admin/<?= e($slug) ?>"><?= e($label) ?></a>
  </li>
  <?php endforeach; ?>
</ul>

<div id="adminTabRoot" data-tab="<?= e($tab) ?>"><div class="skeleton" style="height:300px"></div></div>
