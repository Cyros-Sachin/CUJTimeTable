<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
  <ul class="nav nav-pills" id="examTypeTabs">
    <li class="nav-item"><button type="button" class="nav-link active" data-exam-type="REGULAR">Regular</button></li>
    <li class="nav-item"><button type="button" class="nav-link" data-exam-type="REAPPEAR">Re-appear</button></li>
  </ul>
  <div style="min-width: 260px;">
    <select class="form-select" id="cycleSelect"></select>
  </div>
</div>

<div class="row g-3 mb-4" id="filterRow">
  <div class="col-sm-4 d-none" id="deptFilterWrap">
    <label class="form-label">Department</label>
    <select class="form-select" id="deptFilter"><option value="">All departments</option></select>
  </div>
  <div class="col-sm-4">
    <label class="form-label">Program</label>
    <select class="form-select" id="programFilter"><option value="">All programs</option></select>
  </div>
  <div class="col-sm-4">
    <label class="form-label">Semester</label>
    <select class="form-select" id="semesterFilter"><option value="">All semesters</option></select>
  </div>
</div>

<div class="card-surface p-3 mb-4">
  <div class="table-scroll" id="entriesTableWrap"><div class="skeleton" style="height:200px"></div></div>
</div>

<div class="card-surface p-4 mb-4">
  <div class="d-flex align-items-center justify-content-between mb-3">
    <h3 class="h6 fw-semibold mb-0">Table upload</h3>
    <a href="#" id="templateLink" class="small"><i class="bi bi-download me-1"></i>Download template</a>
  </div>
  <div class="upload-drop" id="uploadDrop">
    <i class="bi bi-cloud-upload fs-3 text-muted"></i>
    <p class="text-muted mb-2">Drag &amp; drop an .xlsx or .csv file, or</p>
    <button type="button" class="btn btn-outline-secondary btn-sm" id="browseBtn">Browse file</button>
    <input type="file" id="fileInput" accept=".xlsx,.csv" class="d-none" />
    <p class="small fw-semibold mt-2 mb-0" id="fileName"></p>
  </div>
  <div class="d-flex gap-2 mt-3">
    <button type="button" class="btn btn-outline-secondary" id="validateOnlyBtn" disabled>Validate only</button>
    <button type="button" class="btn btn-primary" id="uploadBtn" disabled>Upload</button>
  </div>
  <div id="uploadResult" class="mt-3"></div>
</div>

<div class="card-surface p-4">
  <h3 class="h6 fw-semibold mb-3">Date sheets by program &amp; semester</h3>
  <div id="groupsList"><div class="skeleton" style="height:120px"></div></div>
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
