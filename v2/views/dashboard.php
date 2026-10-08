<?php /** @var array $user */ ?>
<div class="d-flex flex-wrap gap-2 mb-4">
  <a href="/entries/new" class="btn btn-primary"><i class="bi bi-file-earmark-plus me-1"></i>Add entry</a>
  <a href="/datesheets" class="btn btn-outline-secondary"><i class="bi bi-cloud-upload me-1"></i>Upload table</a>
  <a href="/datesheets" class="btn btn-outline-secondary"><i class="bi bi-calendar3 me-1"></i>Open date sheets</a>
</div>

<div class="row g-3 mb-4" id="statCards">
  <?php for ($i = 0; $i < 4; $i++): ?>
  <div class="col-6 col-lg-3"><div class="card-surface stat-card"><div class="skeleton" style="height:48px"></div></div></div>
  <?php endfor; ?>
</div>

<div id="deptStatusWrap"></div>
