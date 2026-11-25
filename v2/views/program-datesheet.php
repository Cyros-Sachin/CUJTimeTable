<?php
/** @var array $user */
?>
<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
  <ul class="nav nav-pills" id="examTypeTabs">
    <li class="nav-item"><button type="button" class="nav-link active" data-exam-type="REGULAR">Regular</button></li>
    <li class="nav-item"><button type="button" class="nav-link" data-exam-type="REAPPEAR">Re-appear</button></li>
  </ul>
  <div style="min-width: 260px;">
    <select class="form-select" id="cycleSelect"></select>
  </div>
</div>

<div class="card-surface p-4 mb-4">
  <h3 class="h6 fw-semibold mb-1">Department &amp; program-wise date sheet</h3>
  <p class="text-muted small mb-3">One consolidated date sheet covering every semester of the selected program.</p>
  <div class="row g-3 align-items-end">
    <div class="col-sm-5">
      <label class="form-label" for="deptSelect">Department</label>
      <select class="form-select" id="deptSelect"></select>
    </div>
    <div class="col-sm-4">
      <label class="form-label" for="programSelect">Program</label>
      <select class="form-select" id="programSelect"><option value="">Select a program…</option></select>
    </div>
    <div class="col-sm-3 d-flex gap-2">
      <button type="button" class="btn btn-outline-secondary" id="previewBtn" disabled><i class="bi bi-eye me-1"></i>Preview</button>
      <a href="#" class="btn btn-primary disabled" id="downloadBtn" aria-disabled="true"><i class="bi bi-download me-1"></i>Download PDF</a>
    </div>
  </div>
</div>

<div class="card-surface p-4">
  <h3 class="h6 fw-semibold mb-3">Semesters included</h3>
  <div id="summaryList"><p class="text-muted mb-0">Select a program to see its semesters.</p></div>
</div>

<div class="modal fade" id="pdfPreviewModal" tabindex="-1">
  <div class="modal-dialog modal-xl">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="pdfPreviewTitle"></h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="d-flex justify-content-end mb-2">
          <a href="#" id="pdfDownloadLink" class="btn btn-outline-secondary btn-sm">Download PDF</a>
        </div>
        <iframe id="pdfPreviewFrame" src="" style="width:100%;height:70vh;border:1px solid var(--cuj-border);border-radius:8px;"></iframe>
      </div>
    </div>
  </div>
</div>

