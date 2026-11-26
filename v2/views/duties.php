<div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
  <div class="d-flex flex-wrap align-items-center gap-2">
    <select class="form-select" id="cycleSelect" style="min-width: 280px;" aria-label="Exam cycle"></select>
    <span id="rosterStatus"></span>
  </div>
  <div class="d-flex flex-wrap gap-2">
    <button type="button" id="generateBtn" class="btn btn-primary btn-sm"><i class="bi bi-arrow-repeat me-1"></i>Generate rotation</button>
    <button type="button" id="publishBtn" class="btn btn-outline-secondary btn-sm"></button>
    <a href="#" id="exportExcel" class="btn btn-outline-secondary btn-sm"><i class="bi bi-file-earmark-spreadsheet me-1"></i>Excel</a>
    <a href="#" id="chartPdf" class="btn btn-outline-secondary btn-sm"><i class="bi bi-file-earmark-pdf me-1"></i>Duty chart</a>
    <a href="#" id="lettersPdf" class="btn btn-outline-secondary btn-sm"><i class="bi bi-envelope-paper me-1"></i>Duty letters</a>
  </div>
</div>

<div class="row g-3 mb-3" id="statsRow"></div>
<div id="alertWrap"></div>

<div class="row g-3 mb-3">
  <div class="col-12 col-lg-6">
    <form class="card-surface p-3 h-100" id="settingsForm" novalidate>
      <h3 class="h6 fw-semibold mb-1">Rotation settings</h3>
      <p class="small text-muted mb-3">Invigilators per slot = the larger of the minimum and students &divide; ratio, rounded up. Change a slot's number in the table to override it.</p>
      <div class="row g-2">
        <div class="col-6">
          <label class="form-label small" for="set_spi">Students per invigilator</label>
          <input type="number" min="1" max="1000" class="form-control form-control-sm" id="set_spi" name="students_per_invigilator" />
          <div class="invalid-text" data-error-for="students_per_invigilator"></div>
        </div>
        <div class="col-6">
          <label class="form-label small" for="set_min">Minimum per slot</label>
          <input type="number" min="0" max="500" class="form-control form-control-sm" id="set_min" name="min_per_slot" />
          <div class="invalid-text" data-error-for="min_per_slot"></div>
        </div>
        <div class="col-6">
          <label class="form-label small" for="set_reserve">Reserves per slot</label>
          <input type="number" min="0" max="100" class="form-control form-control-sm" id="set_reserve" name="reserve_per_slot" />
          <div class="invalid-text" data-error-for="reserve_per_slot"></div>
        </div>
        <div class="col-6">
          <label class="form-label small" for="set_day">Max duties per day</label>
          <input type="number" min="1" max="10" class="form-control form-control-sm" id="set_day" name="max_per_day" />
          <div class="invalid-text" data-error-for="max_per_day"></div>
        </div>
        <div class="col-12">
          <div class="form-check">
            <input type="checkbox" class="form-check-input" id="set_own" name="exclude_own_department" />
            <label class="form-check-label small" for="set_own">Don't assign staff to a slot where their own department has a paper</label>
          </div>
        </div>
      </div>
      <div class="d-flex justify-content-end mt-3">
        <button type="submit" class="btn btn-outline-primary btn-sm" id="saveSettingsBtn">Save settings</button>
      </div>
    </form>
  </div>
  <div class="col-12 col-lg-6">
    <div class="card-surface p-3 h-100" id="unavailWrap"></div>
  </div>
</div>

<div class="row g-3">
  <div class="col-12">
    <div class="card-surface p-3">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <h3 class="h6 fw-semibold mb-0">Duty chart</h3>
        <input type="search" class="form-control form-control-sm" id="slotSearch" placeholder="Find staff by name or code…" style="max-width: 280px;" />
      </div>
      <div class="table-scroll" id="slotsWrap"><div class="skeleton" style="height:320px"></div></div>
    </div>
  </div>
</div>

<div class="card-surface p-3 mt-3" id="loadWrap"></div>
