<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
  <div style="min-width: 260px;">
    <select class="form-select" id="cycleSelect"></select>
  </div>
  <div class="d-flex gap-2">
    <a href="#" id="exportExcel" class="btn btn-outline-secondary btn-sm"><i class="bi bi-file-earmark-spreadsheet me-1"></i>Export Excel</a>
    <a href="#" id="exportPdf" class="btn btn-outline-secondary btn-sm"><i class="bi bi-file-earmark-pdf me-1"></i>Overall PDF</a>
    <a href="#" id="exportZip" class="btn btn-outline-secondary btn-sm"><i class="bi bi-file-earmark-zip me-1"></i>Download all PDFs</a>
  </div>
</div>

<div class="row g-3 mb-3">
  <div class="col-6 col-md-2">
    <label class="form-label">Exam Type</label>
    <select class="form-select" id="examTypeFilter"><option value="">All</option><option value="REGULAR">Regular</option><option value="REAPPEAR">Re-appear</option></select>
  </div>
  <div class="col-6 col-md-2">
    <label class="form-label">Department</label>
    <select class="form-select" id="deptFilter"><option value="">All</option></select>
  </div>
  <div class="col-6 col-md-2">
    <label class="form-label">Program</label>
    <select class="form-select" id="programFilter"><option value="">All</option></select>
  </div>
  <div class="col-6 col-md-2">
    <label class="form-label">Semester</label>
    <select class="form-select" id="semesterFilter"><option value="">All</option></select>
  </div>
  <div class="col-6 col-md-2">
    <label class="form-label">From</label>
    <input type="date" class="form-control" id="dateFrom" />
  </div>
  <div class="col-6 col-md-2">
    <label class="form-label">To</label>
    <input type="date" class="form-control" id="dateTo" />
  </div>
  <div class="col-12">
    <label class="form-label">Search</label>
    <input type="text" class="form-control" id="searchInput" placeholder="Course code or name…" />
  </div>
</div>

<ul class="nav nav-pills mb-3" id="viewTabs">
  <li class="nav-item"><button type="button" class="nav-link active" data-view="list">List</button></li>
  <li class="nav-item"><button type="button" class="nav-link" data-view="calendar">Calendar grid</button></li>
</ul>

<div class="card-surface p-3 mb-4">
  <div class="table-scroll" id="resultWrap"><div class="skeleton" style="height:240px"></div></div>
  <div id="pagination" class="d-flex justify-content-between align-items-center pt-2 small text-muted"></div>
</div>

<div class="card-surface p-3" id="dayWiseWrap"></div>
