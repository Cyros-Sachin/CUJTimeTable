import { apiGet, apiSend, apiUpload, ApiError, buildQuery } from './api.js';
import { toast, confirmDialog, ddmmyyyy, weekdayOf, el } from './ui.js';

let meta = null;
let user = null;
let selectedFile = null;

const qs = new URLSearchParams(location.search);
const state = {
  cycle_id: qs.get('cycle_id') ? Number(qs.get('cycle_id')) : null,
  exam_type: qs.get('exam_type') || 'REGULAR',
  department_id: qs.get('department_id') ? Number(qs.get('department_id')) : null,
  program_id: qs.get('program_id') ? Number(qs.get('program_id')) : null,
  semester: qs.get('semester') ? Number(qs.get('semester')) : null,
};

function pushState() {
  const params = buildQuery(state);
  history.replaceState(null, '', '/datesheets' + params);
}

function fillSelect(selectEl, options, placeholder) {
  selectEl.innerHTML = '';
  selectEl.appendChild(el('option', { value: '' }, placeholder));
  options.forEach((opt) => selectEl.appendChild(el('option', { value: String(opt.value) }, opt.label)));
}

async function init() {
  user = (await apiGet('/auth/me')).data;
  meta = (await apiGet('/meta')).data;

  if (user.role === 'DEPT_COORDINATOR') {
    state.department_id = user.department.id;
  } else {
    document.getElementById('deptFilterWrap').classList.remove('d-none');
    fillSelect(document.getElementById('deptFilter'), meta.departments.map((d) => ({ value: d.id, label: d.name })), 'All departments');
    if (state.department_id) document.getElementById('deptFilter').value = String(state.department_id);
  }

  if (!state.cycle_id && meta.cycles[0]) state.cycle_id = meta.cycles[0].id;
  fillSelect(document.getElementById('cycleSelect'), meta.cycles.map((c) => ({
    value: c.id, label: `${c.title} – ${c.month_year}${c.status === 'LOCKED' ? ' (Locked)' : ''}`,
  })), 'Select exam cycle…');
  if (state.cycle_id) document.getElementById('cycleSelect').value = String(state.cycle_id);

  document.querySelectorAll('#examTypeTabs .nav-link').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.examType === state.exam_type);
    btn.addEventListener('click', () => {
      document.querySelectorAll('#examTypeTabs .nav-link').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.exam_type = btn.dataset.examType;
      pushState();
      refreshAll();
    });
  });

  document.getElementById('cycleSelect').addEventListener('change', (e) => {
    state.cycle_id = Number(e.target.value) || null;
    pushState();
    refreshAll();
  });

  refreshProgramFilterOptions();
  document.getElementById('deptFilter')?.addEventListener('change', (e) => {
    state.department_id = Number(e.target.value) || null;
    state.program_id = null;
    refreshProgramFilterOptions();
    pushState();
    refreshAll();
  });
  document.getElementById('programFilter').addEventListener('change', (e) => {
    state.program_id = Number(e.target.value) || null;
    pushState();
    refreshAll();
  });

  fillSelect(document.getElementById('semesterFilter'), Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), 'All semesters');
  if (state.semester) document.getElementById('semesterFilter').value = String(state.semester);
  document.getElementById('semesterFilter').addEventListener('change', (e) => {
    state.semester = Number(e.target.value) || null;
    pushState();
    refreshAll();
  });

  setupUpload();
  await refreshAll();
}

function refreshProgramFilterOptions() {
  const programs = meta.programs.filter((p) => !state.department_id || p.department_id === state.department_id);
  fillSelect(document.getElementById('programFilter'), programs.map((p) => ({ value: p.id, label: p.name })), 'All programs');
  if (state.program_id) document.getElementById('programFilter').value = String(state.program_id);
}

async function refreshAll() {
  await Promise.all([refreshEntriesTable(), refreshGroups()]);
}

async function refreshEntriesTable() {
  const wrap = document.getElementById('entriesTableWrap');
  if (!state.cycle_id) { wrap.innerHTML = '<p class="text-muted mb-0">Select an exam cycle.</p>'; return; }
  wrap.innerHTML = '<div class="skeleton" style="height:200px"></div>';

  const res = await apiGet(`/entries${buildQuery({ cycle_id: state.cycle_id, exam_type: state.exam_type, department_id: state.department_id, program_id: state.program_id, semester: state.semester, page_size: 100 })}`);
  const rows = res.data;

  if (!rows.length) {
    wrap.innerHTML = '';
    wrap.appendChild(el('p', { class: 'text-muted mb-0' }, 'No entries yet for this selection.'));
    return;
  }

  const table = el('table', { class: 'table align-middle mb-0' }, [
    el('thead', {}, el('tr', {}, ['Date', 'Time', 'Code', 'Course Name', 'Subject Type', 'Students', ''].map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((r) => el('tr', {}, [
      el('td', {}, [`${ddmmyyyy(r.exam_date)}`, el('br'), el('span', { class: 'text-muted small' }, `(${weekdayOf(r.exam_date)})`)]),
      el('td', {}, r.time_slot_label),
      el('td', {}, r.course_code),
      el('td', {}, r.course_name),
      el('td', {}, r.subject_type_name),
      el('td', {}, String(r.student_count)),
      el('td', {}, [
        el('a', { href: `/entries/${r.id}/edit`, class: 'btn btn-sm btn-link', title: 'Edit' }, el('i', { class: 'bi bi-pencil' })),
        el('button', {
          type: 'button', class: 'btn btn-sm btn-link text-danger', title: 'Delete',
          onclick: () => deleteEntry(r.id),
        }, el('i', { class: 'bi bi-trash' })),
      ]),
    ]))),
  ]);

  wrap.innerHTML = '';
  wrap.appendChild(table);
}

async function deleteEntry(id) {
  const ok = await confirmDialog({ title: 'Delete entry', message: 'This will permanently remove the entry. This cannot be undone.', confirmLabel: 'Delete', danger: true });
  if (!ok) return;
  try {
    await apiSend('DELETE', `/entries/${id}`);
    toast('Entry deleted');
    refreshAll();
  } catch (err) {
    toast(err instanceof ApiError ? err.message : 'Could not delete entry', 'error');
  }
}

async function refreshGroups() {
  const wrap = document.getElementById('groupsList');
  if (!state.cycle_id) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = '<div class="skeleton" style="height:120px"></div>';

  const res = await apiGet(`/datesheets${buildQuery({ cycle_id: state.cycle_id, exam_type: state.exam_type, department_id: state.department_id })}`);
  const groups = res.data;

  if (!groups.length) {
    wrap.innerHTML = '';
    wrap.appendChild(el('p', { class: 'text-muted mb-0' }, 'No date sheets yet. Add entries above to generate one.'));
    return;
  }

  wrap.innerHTML = '';
  const list = el('ul', { class: 'list-unstyled d-flex flex-column gap-2 mb-0' },
    groups.map((g) => el('li', { class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 border rounded px-3 py-2' }, [
      el('div', {}, [
        el('div', { class: 'fw-semibold small' }, `${g.program_name} — Semester ${g.semester} ${g.department_code ? `(${g.department_code})` : ''}`),
        el('div', { class: 'text-muted', style: 'font-size:.8rem' }, [
          `${g.course_count} course(s) · ${ddmmyyyy(g.first_date)} – ${ddmmyyyy(g.last_date)}`,
          g.ref_no ? el('span', { class: `chip ms-1 ${state.exam_type === 'REGULAR' ? 'chip-regular' : 'chip-reappear'}` }, g.ref_no) : '',
        ]),
      ]),
      el('div', { class: 'd-flex gap-2' }, [
        el('button', { type: 'button', class: 'btn btn-outline-secondary btn-sm', onclick: () => previewPdf(g) }, [el('i', { class: 'bi bi-eye me-1' }), 'Preview PDF']),
        el('a', { href: pdfUrl(g, true), class: 'btn btn-outline-secondary btn-sm' }, [el('i', { class: 'bi bi-download me-1' }), 'Download']),
      ]),
    ])));
  wrap.appendChild(list);
}

function pdfUrl(g, download) {
  return `/api/datesheets/pdf${buildQuery({ cycle_id: state.cycle_id, program_id: g.program_id, semester: g.semester, exam_type: state.exam_type, download: download ? 1 : undefined })}`;
}

function previewPdf(g) {
  document.getElementById('pdfPreviewTitle').textContent = `${g.program_name} — Semester ${g.semester}`;
  document.getElementById('pdfPreviewFrame').src = pdfUrl(g, false);
  document.getElementById('pdfDownloadLink').href = pdfUrl(g, true);
  bootstrap.Modal.getOrCreateInstance(document.getElementById('pdfPreviewModal')).show();
}

function setupUpload() {
  document.getElementById('templateLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = `/api/entries/template?exam_type=${state.exam_type}`;
  });

  const drop = document.getElementById('uploadDrop');
  const input = document.getElementById('fileInput');
  document.getElementById('browseBtn').addEventListener('click', () => input.click());
  input.addEventListener('change', () => setFile(input.files[0]));

  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    setFile(e.dataTransfer.files[0]);
  });

  document.getElementById('validateOnlyBtn').addEventListener('click', () => runUpload(true));
  document.getElementById('uploadBtn').addEventListener('click', () => runUpload(false));
}

function setFile(file) {
  selectedFile = file || null;
  document.getElementById('fileName').textContent = selectedFile ? selectedFile.name : '';
  document.getElementById('validateOnlyBtn').disabled = !selectedFile;
  document.getElementById('uploadBtn').disabled = !selectedFile;
}

async function runUpload(dryRun) {
  if (!selectedFile || !state.cycle_id) {
    toast('Choose a file and an exam cycle first', 'error');
    return;
  }
  const resultBox = document.getElementById('uploadResult');
  resultBox.innerHTML = '';

  const fd = new FormData();
  fd.append('file', selectedFile);
  fd.append('exam_cycle_id', String(state.cycle_id));
  fd.append('exam_type', state.exam_type);
  fd.append('dry_run', dryRun ? 'true' : 'false');
  if (user.role === 'EXAM_CELL' && state.department_id) fd.append('department_id', String(state.department_id));

  try {
    const res = await apiUpload('/entries/bulk-upload', fd);
    if (dryRun) {
      toast(`${res.data.valid} row(s) validated successfully`);
      resultBox.appendChild(el('p', { class: 'text-success mb-0' }, `${res.data.valid} row(s) are valid and ready to upload.`));
    } else {
      toast(`${res.data.inserted} row(s) uploaded`);
      setFile(null);
      document.getElementById('fileInput').value = '';
      refreshAll();
    }
  } catch (err) {
    if (err instanceof ApiError && err.rows && err.rows.length) {
      const table = el('table', { class: 'table table-sm' }, [
        el('thead', { class: 'table-danger' }, el('tr', {}, ['Row', 'Field', 'Message'].map((h) => el('th', {}, h)))),
        el('tbody', {}, err.rows.map((r) => el('tr', {}, [el('td', {}, String(r.row)), el('td', {}, r.field), el('td', {}, r.message)]))),
      ]);
      resultBox.appendChild(el('div', { class: 'table-scroll', style: 'max-height:14rem;overflow-y:auto;' }, table));
    } else if (err instanceof ApiError) {
      toast(err.message, 'error');
    }
  }
}

init().catch((err) => {
  console.error(err);
  toast('Could not load the date sheet page. Please refresh.', 'error');
});
