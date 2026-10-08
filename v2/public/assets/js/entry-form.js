import { apiGet, apiSend, ApiError, buildQuery } from './api.js';
import { clearFieldErrors, fieldErrorsFrom, setLoading, toast, ddmmyyyy, weekdayOf, examTypeLabel, el } from './ui.js';

const root = document.getElementById('entryFormRoot');
const entryId = root.dataset.entryId || null;
const form = document.getElementById('entryForm');

const fields = {
  program_id: document.getElementById('program_id'),
  department_id: document.getElementById('department_id'),
  semester: document.getElementById('semester'),
  subject_type_id: document.getElementById('subject_type_id'),
  time_slot_id: document.getElementById('time_slot_id'),
  exam_date: document.getElementById('exam_date'),
  course_code: document.getElementById('course_code'),
  course_name: document.getElementById('course_name'),
  student_count: document.getElementById('student_count'),
  academic_session_id: document.getElementById('academic_session_id'),
  exam_cycle_id: document.getElementById('exam_cycle_id'),
};

let meta = null;
let user = null;
let examType = 'REGULAR';
let flatpickrInstance = null;
let clashCheckTimer = null;

function fillSelect(selectEl, options, { placeholder = 'Select…', value = null } = {}) {
  selectEl.innerHTML = '';
  selectEl.appendChild(el('option', { value: '' }, placeholder));
  options.forEach((opt) => {
    const o = el('option', { value: String(opt.value) }, opt.label);
    selectEl.appendChild(o);
  });
  if (value !== null) selectEl.value = String(value);
}

function selectedProgram() {
  const id = Number(fields.program_id.value);
  return meta.programs.find((p) => p.id === id) || null;
}

function selectedCycle() {
  const id = Number(fields.exam_cycle_id.value);
  return meta.cycles.find((c) => c.id === id) || null;
}

function currentSessionId() {
  if (fields.academic_session_id.value) return Number(fields.academic_session_id.value);
  const current = meta.sessions.find((s) => s.is_current);
  return current ? current.id : null;
}

function refreshPrograms() {
  const deptId = Number(fields.department_id.value) || null;
  const programs = meta.programs.filter((p) => !deptId || p.department_id === deptId);
  fillSelect(fields.program_id, programs.map((p) => ({ value: p.id, label: p.name })), { placeholder: 'Select program…' });
  fields.program_id.disabled = !deptId;
  refreshSemesters();
}

function refreshSemesters() {
  const program = selectedProgram();
  const total = program ? program.total_semesters : 0;
  const options = Array.from({ length: total }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  fillSelect(fields.semester, options, { placeholder: 'Select semester…' });
  fields.semester.disabled = !program;
}

function refreshCycles() {
  const sessionId = currentSessionId();
  let cycles = meta.cycles.filter((c) => c.academic_session_id === sessionId);
  if (user.role === 'DEPT_COORDINATOR') {
    cycles = cycles.filter((c) => c.status === 'OPEN' || String(c.id) === fields.exam_cycle_id.value);
  }
  fillSelect(fields.exam_cycle_id, cycles.map((c) => ({
    value: c.id, label: `${c.title} – ${c.month_year}${c.status === 'LOCKED' ? ' (Locked)' : ''}`,
  })), { placeholder: 'Select examination…' });
  fields.exam_cycle_id.disabled = !sessionId;
  updateFlatpickrBounds();
}

function updateFlatpickrBounds() {
  const cycle = selectedCycle();
  if (!flatpickrInstance) return;
  flatpickrInstance.set('minDate', cycle ? cycle.start_date : null);
  flatpickrInstance.set('maxDate', cycle ? cycle.end_date : null);
}

function updateWeekdayLabel() {
  const label = document.getElementById('weekdayLabel');
  const val = flatpickrInstance?.selectedDates[0];
  if (!val) { label.textContent = ''; return; }
  const iso = flatpickrInstance.formatDate(val, 'Y-m-d');
  label.textContent = `(${weekdayOf(iso)})`;
}

async function loadMeta() {
  const meRes = await apiGet('/auth/me');
  user = meRes.data;
  const metaRes = await apiGet('/meta');
  meta = metaRes.data;

  fillSelect(fields.subject_type_id, meta.subject_types.map((s) => ({ value: s.id, label: s.name })), { placeholder: 'Select subject type…' });
  fillSelect(fields.time_slot_id, meta.time_slots.map((t) => ({ value: t.id, label: t.label })), { placeholder: 'Select timing…' });
  fillSelect(fields.academic_session_id, meta.sessions.map((s) => ({ value: s.id, label: s.label })), { placeholder: 'Select session…' });

  if (user.role === 'DEPT_COORDINATOR') {
    fields.department_id.innerHTML = '';
    fields.department_id.appendChild(el('option', { value: String(user.department.id) }, user.department.name));
    fields.department_id.disabled = true;
    fields.department_id.value = String(user.department.id);
  } else {
    fillSelect(fields.department_id, meta.departments.map((d) => ({ value: d.id, label: d.name })), { placeholder: 'Select department…' });
  }

  const current = meta.sessions.find((s) => s.is_current);
  if (current) fields.academic_session_id.value = String(current.id);

  refreshPrograms();
  refreshCycles();

  flatpickrInstance = flatpickr(fields.exam_date, {
    dateFormat: 'd-m-Y',
    onChange: () => { updateWeekdayLabel(); scheduleClashCheck(); },
  });
  updateFlatpickrBounds();
}

async function loadExistingEntry() {
  if (!entryId) return;
  const res = await apiGet(`/entries/${entryId}`);
  const entry = res.data;

  examType = entry.exam_type;
  document.querySelectorAll('#examTypeTabs .nav-link').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.examType === examType);
  });

  fields.department_id.value = String(entry.department_id);
  refreshPrograms();
  fields.program_id.value = String(entry.program_id);
  refreshSemesters();
  fields.semester.value = String(entry.semester);
  fields.subject_type_id.value = String(entry.subject_type_id);
  fields.time_slot_id.value = String(entry.time_slot_id);
  fields.course_code.value = entry.course_code;
  fields.course_name.value = entry.course_name;
  fields.student_count.value = String(entry.student_count);
  fields.academic_session_id.value = String(meta.cycles.find((c) => c.id === entry.exam_cycle_id)?.academic_session_id || '');
  refreshCycles();
  fields.exam_cycle_id.value = String(entry.exam_cycle_id);
  updateFlatpickrBounds();
  flatpickrInstance.setDate(entry.exam_date, true, 'Y-m-d');
  updateWeekdayLabel();

  document.getElementById('saveBtn').textContent = 'Save';
  document.getElementById('saveAnotherBtn').classList.add('d-none');

  await refreshSidePanel();
}

function scheduleClashCheck() {
  clearTimeout(clashCheckTimer);
  const clashBox = document.getElementById('clashMessage');
  clashBox.classList.add('d-none');

  clashCheckTimer = setTimeout(async () => {
    const payload = buildPayload({ forCheck: true });
    if (!payload) return;
    try {
      await apiSend('POST', '/entries/check-clash', payload);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CLASH') {
        clashBox.textContent = err.message;
        clashBox.classList.remove('d-none');
      }
    }
  }, 400);
}

function buildPayload({ forCheck = false } = {}) {
  const departmentId = Number(fields.department_id.value) || undefined;
  const programId = Number(fields.program_id.value) || undefined;
  const cycleId = Number(fields.exam_cycle_id.value) || undefined;
  const slotId = Number(fields.time_slot_id.value) || undefined;
  const semester = Number(fields.semester.value) || undefined;
  const isoDate = flatpickrInstance?.selectedDates[0] ? flatpickrInstance.formatDate(flatpickrInstance.selectedDates[0], 'Y-m-d') : undefined;

  if (!departmentId || !programId || !cycleId || !slotId || !semester || !isoDate) return null;

  const payload = {
    exam_cycle_id: cycleId,
    department_id: departmentId,
    program_id: programId,
    semester,
    exam_type: examType,
    subject_type_id: Number(fields.subject_type_id.value) || (forCheck ? 1 : undefined),
    time_slot_id: slotId,
    exam_date: isoDate,
    course_code: (fields.course_code.value || (forCheck ? 'TEMP0000' : '')).toUpperCase(),
    course_name: fields.course_name.value || (forCheck ? 'TEMP' : ''),
    student_count: Number(fields.student_count.value) || (forCheck ? 1 : undefined),
  };
  if (forCheck && entryId) payload.exclude_id = Number(entryId);
  return payload;
}

async function refreshSidePanel() {
  const programId = Number(fields.program_id.value) || null;
  const semester = Number(fields.semester.value) || null;
  const cycleId = Number(fields.exam_cycle_id.value) || null;
  const body = document.getElementById('sidePanelBody');
  const title = document.getElementById('sidePanelTitle');

  const program = selectedProgram();
  title.textContent = `Already added${program ? ' · ' + program.name : ''}${semester ? ' Sem ' + semester : ''}`;

  if (!programId || !semester || !cycleId) {
    body.textContent = 'Pick a program, semester and examination to see existing entries.';
    return;
  }

  body.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  const res = await apiGet(`/entries${buildQuery({ cycle_id: cycleId, exam_type: examType, program_id: programId, semester, page_size: 50 })}`);
  const rows = res.data;

  if (!rows.length) {
    body.textContent = 'No entries yet for this selection.';
    return;
  }

  body.innerHTML = '';
  const list = el('ul', { class: 'list-unstyled d-flex flex-column gap-2 mb-0' },
    rows.map((e) => el('li', { class: 'border rounded px-2 py-1' }, [
      el('div', { class: 'fw-semibold small' }, `${e.course_code} — ${e.course_name}`),
      el('div', { class: 'text-muted', style: 'font-size:.75rem' }, `${ddmmyyyy(e.exam_date)} · ${e.time_slot_label} · ${examTypeLabel(e.exam_type)}`),
    ])));
  body.appendChild(list);
}

function resetCourseFields() {
  form.reset();
  document.getElementById('clashMessage').classList.add('d-none');
  flatpickrInstance.clear();
  updateWeekdayLabel();
}

async function submitForm({ addAnother = false } = {}) {
  clearFieldErrors(form);
  const payload = buildPayload();
  if (!payload) {
    toast('Please fill in all required fields', 'error');
    return;
  }

  const btn = addAnother ? document.getElementById('saveAnotherBtn') : document.getElementById('saveBtn');
  setLoading(btn, true, addAnother ? 'Save & add another' : 'Save');

  try {
    if (entryId) {
      await apiSend('PUT', `/entries/${entryId}`, payload);
      toast('Entry updated');
      window.location.href = '/datesheets';
    } else {
      await apiSend('POST', '/entries', payload);
      toast('Entry saved');
      if (addAnother) {
        const code = fields.course_code.value;
        const name = fields.course_name.value;
        resetCourseFields();
        fields.department_id.value = String(payload.department_id);
        if (user.role !== 'DEPT_COORDINATOR') refreshPrograms();
        fields.program_id.value = String(payload.program_id);
        refreshSemesters();
        fields.semester.value = String(payload.semester);
        fields.subject_type_id.value = String(payload.subject_type_id);
        fields.time_slot_id.value = String(payload.time_slot_id);
        fields.academic_session_id.value = String(currentSessionId());
        refreshCycles();
        fields.exam_cycle_id.value = String(payload.exam_cycle_id);
        updateFlatpickrBounds();
        await refreshSidePanel();
        fields.course_code.focus();
      } else {
        window.location.href = '/datesheets';
      }
    }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.fields) fieldErrorsFrom(err, form);
      toast(err.message, 'error');
    }
  } finally {
    setLoading(btn, false, addAnother ? 'Save & add another' : 'Save');
  }
}

document.querySelectorAll('#examTypeTabs .nav-link').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#examTypeTabs .nav-link').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    examType = btn.dataset.examType;
    refreshCycles();
    refreshSidePanel();
    scheduleClashCheck();
  });
});

fields.department_id.addEventListener('change', () => { refreshPrograms(); refreshSidePanel(); scheduleClashCheck(); });
fields.program_id.addEventListener('change', () => { refreshSemesters(); refreshSidePanel(); scheduleClashCheck(); });
fields.semester.addEventListener('change', () => { refreshSidePanel(); scheduleClashCheck(); });
fields.academic_session_id.addEventListener('change', () => { refreshCycles(); scheduleClashCheck(); });
fields.exam_cycle_id.addEventListener('change', () => { updateFlatpickrBounds(); refreshSidePanel(); scheduleClashCheck(); });
fields.time_slot_id.addEventListener('change', scheduleClashCheck);
fields.course_code.addEventListener('input', () => {
  fields.course_code.value = fields.course_code.value.toUpperCase();
});

form.addEventListener('submit', (e) => { e.preventDefault(); submitForm({ addAnother: false }); });
document.getElementById('saveAnotherBtn').addEventListener('click', () => submitForm({ addAnother: true }));
document.getElementById('resetBtn').addEventListener('click', (e) => { e.preventDefault(); resetCourseFields(); });

(async function init() {
  if (entryId) document.getElementById('saveAnotherBtn').classList.add('d-none');
  await loadMeta();
  await loadExistingEntry();
  if (!entryId) await refreshSidePanel();
})().catch((err) => {
  console.error(err);
  toast('Could not load the form. Please refresh.', 'error');
});
