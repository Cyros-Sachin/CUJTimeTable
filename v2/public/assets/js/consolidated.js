import { apiGet, buildQuery } from './api.js';
import { toast, ddmmyyyy, weekdayOf, examTypeLabel, el } from './ui.js';

let meta = null;
let view = 'list';
const pageSize = 20;

const qs = new URLSearchParams(location.search);
const state = {
  cycle_id: qs.get('cycle_id') ? Number(qs.get('cycle_id')) : null,
  exam_type: qs.get('exam_type') || null,
  department_id: qs.get('department_id') ? Number(qs.get('department_id')) : null,
  program_id: qs.get('program_id') ? Number(qs.get('program_id')) : null,
  semester: qs.get('semester') ? Number(qs.get('semester')) : null,
  date_from: qs.get('date_from') || null,
  date_to: qs.get('date_to') || null,
  q: qs.get('q') || null,
  page: qs.get('page') ? Number(qs.get('page')) : 1,
};

function pushState() {
  history.replaceState(null, '', '/consolidated' + buildQuery(state));
}

function fillSelect(selectEl, options, placeholder) {
  const current = selectEl.value;
  selectEl.innerHTML = '';
  selectEl.appendChild(el('option', { value: '' }, placeholder));
  options.forEach((opt) => selectEl.appendChild(el('option', { value: String(opt.value) }, opt.label)));
  if (current) selectEl.value = current;
}

function filtersForExport() {
  return { ...state, page_size: pageSize };
}

function updateExportLinks() {
  const f = buildQuery(filtersForExport());
  document.getElementById('exportExcel').href = `/api/consolidated/excel${f}`;
  document.getElementById('exportPdf').href = `/api/consolidated/pdf${f}`;
  document.getElementById('exportZip').href = `/api/consolidated/zip${f}`;
}

async function init() {
  meta = (await apiGet('/meta')).data;

  if (!state.cycle_id && meta.cycles[0]) state.cycle_id = meta.cycles[0].id;
  fillSelect(document.getElementById('cycleSelect'), meta.cycles.map((c) => ({ value: c.id, label: `${c.title} – ${c.month_year}` })), 'Select exam cycle…');
  if (state.cycle_id) document.getElementById('cycleSelect').value = String(state.cycle_id);
  document.getElementById('cycleSelect').addEventListener('change', (e) => { state.cycle_id = Number(e.target.value) || null; state.page = 1; apply(); });

  fillSelect(document.getElementById('deptFilter'), meta.departments.map((d) => ({ value: d.id, label: d.name })), 'All');
  if (state.department_id) document.getElementById('deptFilter').value = String(state.department_id);
  document.getElementById('deptFilter').addEventListener('change', (e) => {
    state.department_id = Number(e.target.value) || null;
    state.program_id = null;
    refreshProgramOptions();
    state.page = 1;
    apply();
  });

  refreshProgramOptions();
  document.getElementById('programFilter').addEventListener('change', (e) => { state.program_id = Number(e.target.value) || null; state.page = 1; apply(); });

  fillSelect(document.getElementById('semesterFilter'), Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), 'All');
  if (state.semester) document.getElementById('semesterFilter').value = String(state.semester);
  document.getElementById('semesterFilter').addEventListener('change', (e) => { state.semester = Number(e.target.value) || null; state.page = 1; apply(); });

  if (state.exam_type) document.getElementById('examTypeFilter').value = state.exam_type;
  document.getElementById('examTypeFilter').addEventListener('change', (e) => { state.exam_type = e.target.value || null; state.page = 1; apply(); });

  if (state.date_from) document.getElementById('dateFrom').value = state.date_from;
  if (state.date_to) document.getElementById('dateTo').value = state.date_to;
  document.getElementById('dateFrom').addEventListener('change', (e) => { state.date_from = e.target.value || null; state.page = 1; apply(); });
  document.getElementById('dateTo').addEventListener('change', (e) => { state.date_to = e.target.value || null; state.page = 1; apply(); });

  if (state.q) document.getElementById('searchInput').value = state.q;
  document.getElementById('searchInput').addEventListener('blur', (e) => { state.q = e.target.value || null; state.page = 1; apply(); });
  document.getElementById('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.q = e.target.value || null; state.page = 1; apply(); } });

  document.querySelectorAll('#viewTabs .nav-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#viewTabs .nav-link').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      view = btn.dataset.view;
      renderCurrent();
    });
  });

  await apply();
}

function refreshProgramOptions() {
  const programs = meta.programs.filter((p) => !state.department_id || p.department_id === state.department_id);
  fillSelect(document.getElementById('programFilter'), programs.map((p) => ({ value: p.id, label: p.name })), 'All');
  if (state.program_id) document.getElementById('programFilter').value = String(state.program_id);
}

let lastResult = null;

async function apply() {
  pushState();
  updateExportLinks();
  if (!state.cycle_id) return;

  document.getElementById('resultWrap').innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const res = await apiGet(`/consolidated${buildQuery(filtersForExport())}`);
  lastResult = res;
  renderCurrent();
  renderDayWise(res.meta.day_wise_summary || []);
  renderPagination(res.meta);
}

function renderCurrent() {
  if (!lastResult) return;
  if (view === 'list') renderList(lastResult.data);
  else renderCalendar(lastResult.data);
}

function renderList(rows) {
  const wrap = document.getElementById('resultWrap');
  if (!rows.length) {
    wrap.innerHTML = '';
    wrap.appendChild(el('p', { class: 'text-muted mb-0' }, 'No entries match these filters.'));
    return;
  }
  const headers = ['Date', 'Time', 'Department', 'Program', 'Sem', 'Type', 'Code', 'Course Name', 'Students'];
  const table = el('table', { class: 'table align-middle mb-0' }, [
    el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))),
    el('tbody', {}, rows.map((r) => el('tr', {}, [
      el('td', {}, `${ddmmyyyy(r.exam_date)} (${weekdayOf(r.exam_date)})`),
      el('td', {}, r.time_slot_label),
      el('td', {}, r.department_name),
      el('td', {}, r.program_name),
      el('td', {}, String(r.semester)),
      el('td', {}, examTypeLabel(r.exam_type)),
      el('td', {}, r.course_code),
      el('td', {}, r.course_name),
      el('td', {}, String(r.student_count)),
    ]))),
  ]);
  wrap.innerHTML = '';
  wrap.appendChild(table);
}

function renderCalendar(rows) {
  const wrap = document.getElementById('resultWrap');
  if (!rows.length) {
    wrap.innerHTML = '';
    wrap.appendChild(el('p', { class: 'text-muted mb-0' }, 'No entries to show for this view.'));
    return;
  }
  const slotMap = new Map();
  rows.forEach((r) => slotMap.set(r.time_slot_id, r.time_slot_label));
  const slots = [...slotMap.entries()];
  const dates = [...new Set(rows.map((r) => r.exam_date))].sort();

  const table = el('table', { class: 'table align-middle mb-0' }, [
    el('thead', {}, el('tr', {}, ['Date', ...slots.map(([, label]) => label), 'Day total'].map((h) => el('th', {}, h)))),
    el('tbody', {}, dates.map((date) => {
      const dayRows = rows.filter((r) => r.exam_date === date);
      const totalStudents = dayRows.reduce((sum, r) => sum + r.student_count, 0);
      return el('tr', {}, [
        el('td', {}, [ddmmyyyy(date), el('br'), el('span', { class: 'text-muted small' }, `(${weekdayOf(date)})`)]),
        ...slots.map(([slotId]) => el('td', {}, dayRows.filter((r) => r.time_slot_id === slotId).map((r) =>
          el('span', { class: 'chip chip-regular d-block mb-1' }, `${r.department_code} · ${r.program_code} · ${r.course_code}`)))),
        el('td', { class: 'text-muted small' }, `${dayRows.length} papers / ${totalStudents} students`),
      ]);
    })),
  ]);
  wrap.innerHTML = '';
  wrap.appendChild(table);
}

function renderDayWise(dayWise) {
  const wrap = document.getElementById('dayWiseWrap');
  if (!dayWise.length) { wrap.innerHTML = ''; return; }
  const table = el('table', { class: 'table align-middle mb-0' }, [
    el('thead', {}, el('tr', {}, ['Date', 'Time', 'Papers', 'Students', 'Departments'].map((h) => el('th', {}, h)))),
    el('tbody', {}, dayWise.map((d) => el('tr', {}, [
      el('td', {}, `${ddmmyyyy(d.exam_date)} (${d.weekday})`),
      el('td', {}, d.time_slot_label),
      el('td', {}, String(d.paper_count)),
      el('td', {}, String(d.total_students)),
      el('td', {}, d.departments.join(', ')),
    ]))),
  ]);
  wrap.innerHTML = '';
  wrap.appendChild(el('h3', { class: 'h6 fw-semibold mb-3' }, 'Day-wise summary'));
  wrap.appendChild(el('div', { class: 'table-scroll' }, table));
}

function renderPagination(pageMeta) {
  const wrap = document.getElementById('pagination');
  wrap.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(pageMeta.total / pageMeta.page_size));
  if (totalPages <= 1) return;
  wrap.appendChild(el('span', {}, `Page ${pageMeta.page} of ${totalPages} (${pageMeta.total} total)`));
  wrap.appendChild(el('div', { class: 'd-flex gap-2' }, [
    el('button', { class: 'btn btn-sm btn-outline-secondary', disabled: pageMeta.page <= 1 ? 'disabled' : undefined, onclick: () => { state.page--; apply(); } }, 'Previous'),
    el('button', { class: 'btn btn-sm btn-outline-secondary', disabled: pageMeta.page >= totalPages ? 'disabled' : undefined, onclick: () => { state.page++; apply(); } }, 'Next'),
  ]));
}

init().catch((err) => {
  console.error(err);
  toast('Could not load the consolidated view. Please refresh.', 'error');
});
