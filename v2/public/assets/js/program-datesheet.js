import { apiGet, ApiError, buildQuery } from './api.js';
import { toast, ddmmyyyy, el } from './ui.js';
import { bindPdfDownload } from './pdf-options.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

let meta = null;
let user = null;
let summary = [];
let summaryToken = 0;

const qs = new URLSearchParams(location.search);
const state = {
  cycle_id: qs.get('cycle_id') ? Number(qs.get('cycle_id')) : null,
  exam_type: qs.get('exam_type') === 'REAPPEAR' ? 'REAPPEAR' : 'REGULAR',
  department_id: qs.get('department_id') ? Number(qs.get('department_id')) : null,
  program_id: qs.get('program_id') ? Number(qs.get('program_id')) : null,
};

const $ = (id) => document.getElementById(id);

function pushState() {
  history.replaceState(null, '', '/datesheets/program' + buildQuery(state));
}

function fillSelect(selectEl, options, placeholder) {
  selectEl.innerHTML = '';
  if (placeholder !== null) selectEl.appendChild(el('option', { value: '' }, placeholder));
  options.forEach((opt) => selectEl.appendChild(el('option', { value: String(opt.value) }, opt.label)));
}

function roman(n) {
  return ROMAN[n - 1] || String(n);
}

function selectedProgram() {
  return meta.programs.find((p) => p.id === state.program_id) || null;
}

function pdfUrl(download) {
  return `/api/datesheets/program-pdf${buildQuery({
    cycle_id: state.cycle_id, exam_type: state.exam_type, program_id: state.program_id, download: download ? 1 : undefined,
  })}`;
}

async function init() {
  user = (await apiGet('/auth/me')).data;
  meta = (await apiGet('/meta')).data;

  // Cycle
  if (!state.cycle_id || !meta.cycles.some((c) => c.id === state.cycle_id)) state.cycle_id = meta.cycles[0]?.id ?? null;
  fillSelect($('cycleSelect'), meta.cycles.map((c) => ({ value: c.id, label: `${c.title} – ${c.month_year}` })), 'Select exam cycle…');
  if (state.cycle_id) $('cycleSelect').value = String(state.cycle_id);
  $('cycleSelect').addEventListener('change', (e) => {
    state.cycle_id = Number(e.target.value) || null;
    pushState();
    refreshSummary();
  });

  // Exam type tabs
  document.querySelectorAll('#examTypeTabs .nav-link').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.examType === state.exam_type);
    btn.addEventListener('click', () => {
      document.querySelectorAll('#examTypeTabs .nav-link').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.exam_type = btn.dataset.examType;
      pushState();
      refreshSummary();
    });
  });

  // Department: coordinators are locked to their own.
  const deptSelect = $('deptSelect');
  if (user.role === 'DEPT_COORDINATOR') {
    state.department_id = user.department?.id ?? user.department_id ?? meta.departments[0]?.id ?? null;
    const own = meta.departments.find((d) => d.id === state.department_id);
    fillSelect(deptSelect, [{ value: state.department_id ?? '', label: own ? own.name : (user.department?.name || 'My department') }], null);
    deptSelect.disabled = true;
  } else {
    fillSelect(deptSelect, meta.departments.map((d) => ({ value: d.id, label: d.name })), 'Select a department…');
    if (state.department_id && meta.departments.some((d) => d.id === state.department_id)) deptSelect.value = String(state.department_id);
    else state.department_id = null;
    deptSelect.addEventListener('change', (e) => {
      state.department_id = Number(e.target.value) || null;
      state.program_id = null;
      refreshProgramOptions();
      pushState();
      refreshSummary();
    });
  }

  refreshProgramOptions();
  $('programSelect').addEventListener('change', (e) => {
    state.program_id = Number(e.target.value) || null;
    pushState();
    refreshSummary();
  });

  $('previewBtn').addEventListener('click', previewPdf);
  bindPdfDownload($('downloadBtn'));
  bindPdfDownload($('pdfDownloadLink'));

  pushState();
  await refreshSummary();
}

function refreshProgramOptions() {
  const select = $('programSelect');
  const programs = state.department_id ? meta.programs.filter((p) => p.department_id === state.department_id) : [];
  fillSelect(select, programs.map((p) => ({ value: p.id, label: p.code ? `${p.name} (${p.code})` : p.name })),
    state.department_id ? (programs.length ? 'Select a program…' : 'No programs in this department') : 'Select a department first');
  select.disabled = !state.department_id;
  if (state.program_id && programs.some((p) => p.id === state.program_id)) select.value = String(state.program_id);
  else state.program_id = null;
}

function updateButtons() {
  const ready = Boolean(state.cycle_id && state.program_id && summary.length);
  $('previewBtn').disabled = !ready;
  const link = $('downloadBtn');
  link.classList.toggle('disabled', !ready);
  link.setAttribute('aria-disabled', ready ? 'false' : 'true');
  link.href = ready ? pdfUrl(true) : '#';
}

async function refreshSummary() {
  const wrap = $('summaryList');
  summary = [];
  updateButtons();
  if (!state.cycle_id || !state.program_id) {
    wrap.innerHTML = '';
    wrap.appendChild(el('p', { class: 'text-muted mb-0' }, !state.cycle_id ? 'Select an exam cycle.' : 'Select a program to see its semesters.'));
    return;
  }

  const token = ++summaryToken;
  wrap.innerHTML = '<div class="skeleton" style="height:80px"></div>';
  let rows;
  try {
    rows = (await apiGet(`/datesheets/program-summary${buildQuery({ cycle_id: state.cycle_id, exam_type: state.exam_type, program_id: state.program_id })}`)).data;
  } catch (err) {
    if (token !== summaryToken) return;
    wrap.innerHTML = '';
    wrap.appendChild(el('p', { class: 'text-danger mb-0' }, err instanceof ApiError ? err.message : 'Could not load the summary'));
    return;
  }
  if (token !== summaryToken) return; // a newer selection superseded this request

  summary = rows;
  updateButtons();
  wrap.innerHTML = '';
  if (!rows.length) {
    wrap.appendChild(el('p', { class: 'text-muted mb-0' }, 'No entries yet for this program and exam type in the selected cycle.'));
    return;
  }

  const total = rows.reduce((n, r) => n + r.course_count, 0);
  wrap.appendChild(el('ul', { class: 'list-unstyled d-flex flex-column gap-2 mb-2' }, rows.map((r) => el('li', {
    class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 border rounded px-3 py-2',
  }, [
    el('div', { class: 'fw-semibold small' }, `Semester-${roman(r.semester)}`),
    el('div', { class: 'text-muted', style: 'font-size:.8rem' }, `${r.course_count} course(s) · ${ddmmyyyy(r.first_date)} – ${ddmmyyyy(r.last_date)}`),
  ]))));
  wrap.appendChild(el('p', { class: 'text-muted small mb-0' }, `${rows.length} semester(s), ${total} course(s) in total.`));
}

function previewPdf() {
  if ($('previewBtn').disabled) return;
  const program = selectedProgram();
  $('pdfPreviewTitle').textContent = `${program ? program.name : 'Program'} — All semesters (${state.exam_type === 'REAPPEAR' ? 'Re-appear' : 'Regular'})`;
  $('pdfPreviewFrame').src = pdfUrl(false);
  $('pdfDownloadLink').href = pdfUrl(true);
  bootstrap.Modal.getOrCreateInstance($('pdfPreviewModal')).show();
}

init().catch((err) => {
  console.error(err);
  toast('Could not load the program date sheet page. Please refresh.', 'error');
});
