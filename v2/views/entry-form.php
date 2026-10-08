<?php /** @var string|null $entryId */ ?>
<div id="entryFormRoot" data-entry-id="<?= e($entryId ?? '') ?>" class="row g-4">
  <div class="col-lg-8">
    <div class="card-surface p-4">
      <ul class="nav nav-pills mb-4" id="examTypeTabs">
        <li class="nav-item"><button type="button" class="nav-link active" data-exam-type="REGULAR">Regular</button></li>
        <li class="nav-item"><button type="button" class="nav-link" data-exam-type="REAPPEAR">Re-appear</button></li>
      </ul>

      <form id="entryForm" novalidate>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="program_id">Program Name</label>
            <select class="form-select" id="program_id" name="program_id" disabled></select>
            <div class="invalid-text" data-error-for="program_id"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="department_id">Department Name</label>
            <select class="form-select" id="department_id" name="department_id"></select>
            <div class="invalid-text" data-error-for="department_id"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="semester">Semester</label>
            <select class="form-select" id="semester" name="semester" disabled></select>
            <div class="invalid-text" data-error-for="semester"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="subject_type_id">Subject Type</label>
            <select class="form-select" id="subject_type_id" name="subject_type_id"></select>
            <div class="invalid-text" data-error-for="subject_type_id"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="time_slot_id">Timing</label>
            <select class="form-select" id="time_slot_id" name="time_slot_id"></select>
            <div class="invalid-text" data-error-for="time_slot_id"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="exam_date">Date <span class="text-muted small" id="weekdayLabel"></span></label>
            <input type="text" class="form-control" id="exam_date" name="exam_date" placeholder="DD-MM-YYYY" autocomplete="off" />
            <div class="invalid-text" data-error-for="exam_date"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="course_code">Course Code</label>
            <input type="text" class="form-control text-uppercase" id="course_code" name="course_code" placeholder="e.g. MBIO1C004T" />
            <div class="invalid-text" data-error-for="course_code"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="course_name">Course Name</label>
            <input type="text" class="form-control" id="course_name" name="course_name" />
            <div class="invalid-text" data-error-for="course_name"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="student_count">No. of Students</label>
            <input type="number" min="1" max="5000" class="form-control" id="student_count" name="student_count" />
            <div class="invalid-text" data-error-for="student_count"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="academic_session_id">Academic Session</label>
            <select class="form-select" id="academic_session_id" name="academic_session_id"></select>
            <div class="invalid-text" data-error-for="academic_session_id"></div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="exam_cycle_id">Examination</label>
            <select class="form-select" id="exam_cycle_id" name="exam_cycle_id" disabled></select>
            <div class="invalid-text" data-error-for="exam_cycle_id"></div>
          </div>
        </div>

        <div class="alert alert-danger mt-3 d-none" id="clashMessage"></div>

        <div class="d-flex flex-wrap gap-2 mt-4">
          <button type="submit" class="btn btn-primary" id="saveBtn">Save</button>
          <button type="button" class="btn btn-outline-secondary d-none" id="saveAnotherBtn">Save &amp; add another</button>
          <button type="reset" class="btn btn-link" id="resetBtn">Reset</button>
        </div>
      </form>
    </div>
  </div>

  <div class="col-lg-4">
    <div class="card-surface p-3">
      <h3 class="h6 fw-semibold mb-3" id="sidePanelTitle">Already added</h3>
      <div id="sidePanelBody" class="small text-muted">Pick a program, semester and examination to see existing entries.</div>
    </div>
  </div>
</div>
