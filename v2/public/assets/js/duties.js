// Invigilation duties (Exam Cell): rotation settings, generate, manual add / replace / swap / remove,
// per-slot overrides, staff unavailability, publish, and exports.

import { apiGet, apiSend, apiUpload, ApiError, buildQuery } from './api.js';
import { toast, confirmDialog, ddmmyyyy, el, clearFieldErrors, fieldErrorsFrom } from './ui.js';
import { downloadPdfWithOptions } from './pdf-options.js';

const qs = new URLSearchParams(location.search);
let cycleId = qs.get('cycle_id') ? Number(qs.get('cycle_id')) : null;
let overview = null;
let timeSlots = [];
let staffList = [];

const $ = (id) => document.getElementById(id);
const isPublished = () => overview && overview.roster.status === 'PUBLISHED';
const roleLabel = (role) => (role === 'RESERVE' ? 'Reserve' : 'Invigilator');

function errorMessage(err, fallback) {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Run a duty change; on a soft conflict (on leave, daily limit, own department) ask the admin
 * and retry with force. Hard conflicts (already on duty in that slot) just show the error.
 */
async function withConflictConfirm(run, successMessage) {
  try {
    await run(false);
  } catch (err) {
    if (!(err instanceof ApiError) || err.code !== 'DUTY_CONFLICT') {
      toast(errorMessage(err, 'Could not save the change'), 'error');
      return false;
    }
    const warnings = (err.fields && err.fields.warnings) || [err.message];
    const ok = await confirmDialog({
      title: 'Assign anyway?',
      message: `${warnings.join('. ')}. Assign anyway?`,
      confirmLabel: 'Assign anyway',
    });
    if (!ok) return false;
    try {
      await run(true);
    } catch (err2) {
      toast(errorMessage(err2, 'Could not save the change'), 'error');
      return false;
    }
  }
  toast(successMessage);
  await load();
  return true;
}

// ---- Generic searchable picker modal --------------------------------------------------

let pickerEl = null;
function pick({ title, items, emptyText = 'Nothing to choose from.' }) {
  if (!pickerEl) {
    pickerEl = el('div', { class: 'modal fade', tabindex: '-1' }, el('div', { class: 'modal-dialog modal-dialog-scrollable modal-lg' }, el('div', { class: 'modal-content' }, [
      el('div', { class: 'modal-header' }, [
        el('h5', { class: 'modal-title', 'data-role': 'title' }),
        el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal', 'aria-label': 'Close' }),
      ]),
      el('div', { class: 'modal-body' }, [
        el('input', { type: 'search', class: 'form-control mb-3', 'data-role': 'search', placeholder: 'Search by name, code or department…' }),
        el('div', { class: 'list-group', 'data-role': 'list' }),
      ]),
    ])));
    document.body.appendChild(pickerEl);
  }
  pickerEl.querySelector('[data-role="title"]').textContent = title;
  const search = pickerEl.querySelector('[data-role="search"]');
  const list = pickerEl.querySelector('[data-role="list"]');
  search.value = '';
  const modal = bootstrap.Modal.getOrCreateInstance(pickerEl);

  return new Promise((resolve) => {
    let chosen = null;
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const shown = items.filter((it) => !q || it.search.includes(q)).slice(0, 200);
      list.innerHTML = '';
      if (!shown.length) {
        list.appendChild(el('p', { class: 'text-muted small mb-0' }, emptyText));
        return;
      }
      shown.forEach((it) => {
        const btn = el('button', {
          type: 'button',
          class: `list-group-item list-group-item-action d-flex justify-content-between align-items-start gap-2${it.disabled ? ' disabled' : ''}`,
          onclick: () => { chosen = it.value; modal.hide(); },
        }, [
          el('div', {}, [el('div', { class: 'fw-semibold' }, it.label), it.sub ? el('div', { class: 'small text-muted' }, it.sub) : '']),
          el('div', { class: 'd-flex flex-wrap gap-1 justify-content-end' }, (it.badges || []).map((b) => el('span', { class: `chip ${b.cls}` }, b.text))),
        ]);
        if (it.disabled) btn.setAttribute('disabled', 'disabled');
        list.appendChild(btn);
      });
    };
    const onInput = () => render();
    const onShown = () => search.focus();
    const onHidden = () => {
      search.removeEventListener('input', onInput);
      pickerEl.removeEventListener('shown.bs.modal', onShown);
      pickerEl.removeEventListener('hidden.bs.modal', onHidden);
      resolve(chosen);
    };
    search.addEventListener('input', onInput);
    pickerEl.addEventListener('shown.bs.modal', onShown);
    pickerEl.addEventListener('hidden.bs.modal', onHidden);
    render();
    modal.show();
  });
}

async function pickStaffForSlot(slot, title) {
  const res = await apiGet(`/duties/candidates${buildQuery({ cycle_id: cycleId, exam_date: slot.exam_date, time_slot_id: slot.time_slot_id })}`);
  const items = res.data.map((c) => ({
    value: c.staff_id,
    label: `${c.name} (${c.employee_code})`,
    sub: [c.designation, c.department_name].filter(Boolean).join(' · '),
    search: `${c.name} ${c.employee_code} ${c.department_name || ''}`.toLowerCase(),
    disabled: c.blocked,
    badges: [
      { text: `${c.duties} dut${c.duties === 1 ? 'y' : 'ies'}`, cls: 'chip-neutral' },
      ...c.flags.map((f) => ({ text: f, cls: 'chip-reappear' })),
    ],
  }));
  return pick({ title, items, emptyText: 'No active staff. Add staff in Admin > Duty Staff.' });
}

// ---- Actions ----------------------------------------------------------------------------

async function addToSlot(slot, role, room = null) {
  const where = room ? ` · ${room.room}` : '';
  const staffId = await pickStaffForSlot(slot, `Add ${roleLabel(role).toLowerCase()} · ${ddmmyyyy(slot.exam_date)} ${slot.time_slot_label}${where}`);
  if (!staffId) return;
  await withConflictConfirm(
    (force) => apiSend('POST', '/duties/assignments', {
      cycle_id: cycleId, exam_date: slot.exam_date, time_slot_id: slot.time_slot_id, staff_id: staffId, role, room_id: room ? room.id : null, force,
    }),
    'Duty added',
  );
}

// ---- Seating allotment ------------------------------------------------------------------

let seatingModalEl = null;
function seatingRow(room = '', students = '', courses = '') {
  return el('tr', {}, [
    el('td', {}, el('input', { type: 'text', class: 'form-control form-control-sm', 'data-f': 'room', maxlength: '60', value: room, placeholder: 'e.g. Room 101' })),
    el('td', { style: 'width: 7rem' }, el('input', { type: 'number', class: 'form-control form-control-sm', 'data-f': 'students', min: '1', max: '1000', value: String(students) })),
    el('td', {}, el('input', { type: 'text', class: 'form-control form-control-sm', 'data-f': 'courses', maxlength: '1000', value: courses, placeholder: 'optional, e.g. UCSE0O001T' })),
    el('td', { class: 'small text-muted text-nowrap', 'data-f': 'need' }),
    el('td', { class: 'text-end' }, el('button', { type: 'button', class: 'btn btn-sm btn-link text-danger p-0', title: 'Remove row', 'data-f': 'del' }, el('i', { class: 'bi bi-x-lg' }))),
  ]);
}

/** Type in / edit one session's seating: room / class + students, one row each. */
async function editSeating(slot) {
  if (!seatingModalEl) {
    seatingModalEl = el('div', { class: 'modal fade', tabindex: '-1' }, el('div', { class: 'modal-dialog modal-lg modal-dialog-scrollable' }, el('div', { class: 'modal-content' }, [
      el('div', { class: 'modal-header' }, [el('h5', { class: 'modal-title', 'data-role': 'title' }), el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' })]),
      el('div', { class: 'modal-body' }, [
        el('p', { class: 'small text-muted', 'data-role': 'hint' }),
        el('table', { class: 'table table-sm align-middle mb-2' }, [
          el('thead', {}, el('tr', {}, ['Room / Class', 'Students', 'Course codes', 'Teachers', ''].map((h) => el('th', {}, h)))),
          el('tbody', { 'data-role': 'rows' }),
        ]),
        el('div', { class: 'd-flex justify-content-between align-items-center' }, [
          el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', 'data-role': 'add' }, [el('i', { class: 'bi bi-plus-lg me-1' }), 'Add room']),
          el('span', { class: 'small', 'data-role': 'total' }),
        ]),
        el('div', { class: 'invalid-text mt-2', 'data-role': 'error' }),
      ]),
      el('div', { class: 'modal-footer' }, [
        el('button', { type: 'button', class: 'btn btn-outline-danger me-auto', 'data-role': 'clear' }, 'Clear seating'),
        el('button', { type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary', 'data-role': 'save' }, 'Save seating'),
      ]),
    ])));
    document.body.appendChild(seatingModalEl);
  }
  const m = seatingModalEl;
  const q = (role) => m.querySelector(`[data-role="${role}"]`);
  const r = overview.roster;
  const tbody = q('rows');
  q('title').textContent = `Seating · ${ddmmyyyy(slot.exam_date)} (${slot.weekday}) ${slot.time_slot_label}`;
  q('hint').textContent = `${slot.total_students} students registered in this session. Each room gets ${r.per_room_small} teacher(s), or ${r.per_room_large} if it seats more than ${r.room_threshold}. Course codes are optional; the duty letters print them.`;
  q('error').textContent = '';
  tbody.innerHTML = '';
  (slot.rooms.length ? slot.rooms : [{ room: '', students: '' }]).forEach((x) => tbody.appendChild(seatingRow(x.room, x.students, (x.course_codes || []).join(', '))));

  const refresh = () => {
    let seated = 0;
    let teachers = 0;
    tbody.querySelectorAll('tr').forEach((tr) => {
      const n = Number(tr.querySelector('[data-f="students"]').value) || 0;
      const need = n ? (n > r.room_threshold ? r.per_room_large : r.per_room_small) : 0;
      seated += n;
      teachers += need;
      tr.querySelector('[data-f="need"]').textContent = n ? String(need) : '';
    });
    const diff = seated - slot.total_students;
    q('total').innerHTML = '';
    q('total').append(
      `${seated} seated · ${teachers} teachers `,
      diff !== 0 && seated ? el('span', { class: 'chip chip-reappear ms-1' }, diff > 0 ? `${diff} more than registered` : `${-diff} fewer than registered`) : '',
    );
  };
  const onInput = () => refresh();
  const onClick = (e) => {
    const del = e.target.closest('[data-f="del"]');
    if (del) { del.closest('tr').remove(); refresh(); }
  };
  const addRow = () => { tbody.appendChild(seatingRow()); tbody.lastChild.querySelector('input').focus(); };

  const save = async (rooms) => {
    q('error').textContent = '';
    try {
      await apiSend('PUT', '/duties/seating', { cycle_id: cycleId, exam_date: slot.exam_date, time_slot_id: slot.time_slot_id, rooms });
      bootstrap.Modal.getOrCreateInstance(m).hide();
      toast(rooms.length ? `Seating saved: ${rooms.length} room(s). Regenerate to post teachers room-wise.` : 'Seating cleared');
      await load();
    } catch (err) {
      q('error').textContent = err instanceof ApiError && err.fields ? Object.values(err.fields).join(' · ') : errorMessage(err, 'Could not save the seating');
    }
  };
  const onSave = () => {
    const rooms = [...tbody.querySelectorAll('tr')]
      .map((tr) => ({
        room: tr.querySelector('[data-f="room"]').value.trim(),
        students: Number(tr.querySelector('[data-f="students"]').value),
        courses: tr.querySelector('[data-f="courses"]').value.trim(),
      }))
      .filter((x) => x.room || x.students);
    if (!rooms.length) { q('error').textContent = 'Add at least one room, or use Clear seating.'; return; }
    save(rooms);
  };
  const onClear = async () => {
    const ok = await confirmDialog({ title: 'Clear seating', message: 'Remove this session\'s seating? Teachers posted to its rooms stay on duty but lose their room.', confirmLabel: 'Clear', danger: true });
    if (ok) save([]);
  };

  tbody.addEventListener('input', onInput);
  tbody.addEventListener('click', onClick);
  q('add').addEventListener('click', addRow);
  q('save').addEventListener('click', onSave);
  q('clear').addEventListener('click', onClear);
  q('clear').classList.toggle('d-none', !slot.rooms.length);
  m.addEventListener('hidden.bs.modal', () => {
    tbody.removeEventListener('input', onInput);
    tbody.removeEventListener('click', onClick);
    q('add').removeEventListener('click', addRow);
    q('save').removeEventListener('click', onSave);
    q('clear').removeEventListener('click', onClear);
  }, { once: true });
  refresh();
  bootstrap.Modal.getOrCreateInstance(m).show();
}

/** Upload the seating Excel: validate first, show problems / mismatches, then save. */
async function uploadSeating(file) {
  const out = $('seatingResult');
  out.innerHTML = '';
  const send = async (dryRun) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('cycle_id', String(cycleId));
    fd.append('dry_run', dryRun ? 'true' : 'false');
    return (await apiUpload('/duties/seating/import', fd)).data;
  };
  try {
    const check = await send(true);
    const lines = [el('div', {}, `${check.rooms} rooms in ${check.slots} session(s), ${check.students} students seated.`)];
    if (check.mismatches.length) {
      lines.push(el('div', { class: 'mt-1' }, 'Seated ≠ registered in:'));
      lines.push(el('ul', { class: 'mb-0 small' }, check.mismatches.map((x) => el('li', {}, `${ddmmyyyy(x.exam_date)} ${x.time_slot_label}: ${x.seated} seated, ${x.registered} registered`))));
    }
    const ok = await confirmDialog({
      title: 'Upload seating',
      message: `${check.rooms} rooms in ${check.slots} session(s). This replaces the seating of those sessions${check.mismatches.length ? ` (${check.mismatches.length} session(s) have a different seated count than registered)` : ''}. Continue?`,
      confirmLabel: 'Upload',
    });
    out.appendChild(el('div', { class: `alert ${check.mismatches.length ? 'alert-warning' : 'alert-info'} py-2 small mb-2` }, lines));
    if (!ok) return;
    const res = await send(false);
    toast(`Seating saved for ${res.slots} session(s). Regenerate the rotation to post teachers room-wise.`);
    await load();
  } catch (err) {
    if (err instanceof ApiError && err.rows && err.rows.length) {
      out.appendChild(el('div', { class: 'table-scroll', style: 'max-height:14rem;overflow-y:auto;' }, el('table', { class: 'table table-sm mb-2' }, [
        el('thead', { class: 'table-danger' }, el('tr', {}, ['Row', 'Field', 'Message'].map((h) => el('th', {}, h)))),
        el('tbody', {}, err.rows.map((x) => el('tr', {}, [el('td', {}, String(x.row)), el('td', {}, x.field), el('td', {}, x.message)]))),
      ])));
    }
    toast(errorMessage(err, 'Could not upload the seating'), 'error');
  }
}

async function replaceDuty(slot, a) {
  const staffId = await pickStaffForSlot(slot, `Replace ${a.name} · ${ddmmyyyy(slot.exam_date)} ${slot.time_slot_label}`);
  if (!staffId) return;
  await withConflictConfirm((force) => apiSend('PUT', `/duties/assignments/${a.id}`, { staff_id: staffId, force }), 'Duty reassigned');
}

async function swapDuty(slot, a) {
  const items = [];
  overview.slots.forEach((s) => {
    if (s.exam_date === slot.exam_date && s.time_slot_id === slot.time_slot_id) return;
    [...s.invigilators, ...s.reserves].forEach((b) => items.push({
      value: b.id,
      label: `${b.name} (${b.employee_code})`,
      sub: `${ddmmyyyy(s.exam_date)} (${s.weekday}) · ${s.time_slot_label} · ${roleLabel(b.role)}`,
      search: `${b.name} ${b.employee_code} ${b.department_name || ''} ${ddmmyyyy(s.exam_date)}`.toLowerCase(),
      badges: b.department_code ? [{ text: b.department_code, cls: 'chip-neutral' }] : [],
    }));
  });
  const otherId = await pick({ title: `Swap ${a.name}'s duty on ${ddmmyyyy(slot.exam_date)} ${slot.time_slot_label} with…`, items });
  if (!otherId) return;
  await withConflictConfirm((force) => apiSend('POST', '/duties/assignments/swap', { a_id: a.id, b_id: otherId, force }), 'Duties swapped');
}

async function removeDuty(slot, a) {
  const ok = await confirmDialog({
    title: 'Remove duty',
    message: `Remove ${a.name} from ${ddmmyyyy(slot.exam_date)} ${slot.time_slot_label}? The slot will be short until someone else is added or the rotation is regenerated.`,
    confirmLabel: 'Remove', danger: true,
  });
  if (!ok) return;
  try {
    await apiSend('DELETE', `/duties/assignments/${a.id}`);
    toast('Duty removed');
    await load();
  } catch (err) {
    toast(errorMessage(err, 'Could not remove the duty'), 'error');
  }
}

async function setOverride(slot, value) {
  try {
    await apiSend('PUT', '/duties/slots', { cycle_id: cycleId, exam_date: slot.exam_date, time_slot_id: slot.time_slot_id, required: value });
    toast(value === null ? 'Slot reset to the computed number' : 'Invigilators needed updated');
    await load();
  } catch (err) {
    toast(errorMessage(err, 'Could not update the slot'), 'error');
  }
}

async function generate() {
  const hasDuties = overview && overview.totals.assigned > 0;
  if (hasDuties) {
    const ok = await confirmDialog({
      title: 'Regenerate rotation',
      message: 'Auto-assigned duties will be rebuilt from the rotation. Duties you added, replaced or swapped by hand are kept.',
      confirmLabel: 'Regenerate',
    });
    if (!ok) return;
  }
  const btn = $('generateBtn');
  btn.disabled = true;
  try {
    const res = await apiSend('POST', '/duties/generate', { cycle_id: cycleId });
    const r = res.data;
    toast(`${r.assigned} duties assigned across ${r.slots} slots${r.kept_manual ? `, ${r.kept_manual} manual kept` : ''}`);
    if (r.shortfall > 0) toast(`${r.shortfall} duties could not be filled — not enough eligible staff`, 'warning');
    await load();
  } catch (err) {
    toast(errorMessage(err, 'Could not generate the rotation'), 'error');
  } finally {
    btn.disabled = false;
  }
}

async function togglePublish() {
  const publish = !isPublished();
  const ok = await confirmDialog({
    title: publish ? 'Publish roster' : 'Unpublish roster',
    message: publish
      ? 'Publishing locks the roster and removes the DRAFT watermark from the PDFs. Published rosters also count towards future rotations.'
      : 'Unpublishing makes the roster editable again. PDFs will show the DRAFT watermark until it is published again.',
    confirmLabel: publish ? 'Publish' : 'Unpublish',
  });
  if (!ok) return;
  try {
    await apiSend('PATCH', '/duties/status', { cycle_id: cycleId, status: publish ? 'PUBLISHED' : 'DRAFT' });
    toast(publish ? 'Roster published' : 'Roster unpublished');
    await load();
  } catch (err) {
    toast(errorMessage(err, 'Could not change the status'), 'error');
  }
}

// ---- Rendering ----------------------------------------------------------------------------

function renderHeader() {
  const r = overview.roster;
  $('rosterStatus').innerHTML = '';
  $('rosterStatus').appendChild(r.status === 'PUBLISHED'
    ? el('span', { class: 'chip chip-open' }, [el('i', { class: 'bi bi-lock-fill me-1' }), 'Published'])
    : el('span', { class: 'chip chip-reappear' }, 'Draft'));
  if (r.generated_at) {
    $('rosterStatus').appendChild(el('span', { class: 'small text-muted ms-2' }, `Generated ${ddmmyyyy(r.generated_at.slice(0, 10))} ${r.generated_at.slice(11, 16)}`));
  }

  $('generateBtn').disabled = isPublished();
  const pub = $('publishBtn');
  pub.innerHTML = '';
  pub.append(el('i', { class: `bi ${isPublished() ? 'bi-unlock' : 'bi-check2-circle'} me-1` }), isPublished() ? 'Unpublish' : 'Publish');

  const hasDuties = overview.totals.assigned > 0;
  const q = buildQuery({ cycle_id: cycleId });
  [['exportExcel', `/api/duties/excel${q}`], ['chartPdf', `/api/duties/chart-pdf${q}`], ['lettersPdf', `/api/duties/letters-pdf${q}`]].forEach(([id, href]) => {
    const a = $(id);
    a.href = hasDuties ? href : '#';
    a.classList.toggle('disabled', !hasDuties);
  });

  // Settings form
  const f = $('settingsForm');
  f.students_per_invigilator.value = r.students_per_invigilator;
  f.min_per_slot.value = r.min_per_slot;
  f.reserve_per_slot.value = r.reserve_per_slot;
  f.max_per_day.value = r.max_per_day;
  f.room_threshold.value = r.room_threshold;
  f.per_room_small.value = r.per_room_small;
  f.per_room_large.value = r.per_room_large;
  f.exclude_own_department.checked = !!r.exclude_own_department;
  [...f.elements].forEach((input) => { input.disabled = isPublished(); });
  $('seatingTemplate').href = `/api/duties/seating/template${q}`;
  $('seatingUploadBtn').disabled = isPublished();
}

function stat(label, value, hint, danger) {
  return el('div', { class: 'col-6 col-md-3' }, el('div', { class: 'card-surface stat-card h-100' }, [
    el('div', { class: 'stat-label' }, label),
    el('div', { class: `stat-value${danger ? ' text-danger' : ''}` }, String(value)),
    hint ? el('div', { class: 'small text-muted' }, hint) : '',
  ]));
}

function renderStats() {
  const t = overview.totals;
  const short = t.shortfall + t.reserve_shortfall;
  $('statsRow').innerHTML = '';
  $('statsRow').append(
    stat('Exam slots', t.slots, `${t.slots_with_seating} with seating · ${t.rooms} rooms`),
    stat('Duties assigned', t.assigned, `of ${t.required + t.reserve_required} needed`),
    stat('Staff on duty', `${t.staff_on_duty} / ${t.active_staff}`, t.active_staff ? `load ${t.min_load}–${t.max_load} per person` : 'no active staff'),
    stat('Unfilled', short, short ? 'not enough eligible staff' : 'all slots covered', short > 0),
  );

  const alerts = $('alertWrap');
  alerts.innerHTML = '';
  if (!t.active_staff) {
    alerts.appendChild(el('div', { class: 'alert alert-warning py-2' }, ['No active staff yet. ', el('a', { href: '/admin/staff' }, 'Add duty staff'), ' before generating the rotation.']));
  }
  if (!overview.slots.length) {
    alerts.appendChild(el('div', { class: 'alert alert-info py-2' }, 'This exam cycle has no scheduled exams yet, so there are no duty slots.'));
  }
  const noSeating = overview.slots.filter((s) => !s.has_seating).length;
  if (overview.slots.length && noSeating) {
    alerts.appendChild(el('div', { class: 'alert alert-info py-2' },
      `${noSeating} of ${overview.slots.length} sessions have no seating allotment yet; they use the students-per-invigilator estimate. Upload the seating or click "Seating" on a session.`));
  }
  if (overview.orphans.length) {
    alerts.appendChild(el('div', { class: 'alert alert-warning py-2' },
      `${overview.orphans.length} duty(ies) are in slots that no longer have exams (the date sheet changed). Regenerate to clean them up.`));
  }
}

function dutyChip(slot, a) {
  const label = `${a.name} (${a.employee_code})`;
  const cls = a.role === 'RESERVE' ? 'chip-neutral' : 'chip-regular';
  const content = [a.is_manual ? el('i', { class: 'bi bi-hand-index-thumb', title: 'Assigned by hand' }) : '', label];
  if (isPublished()) {
    return el('span', { class: `chip ${cls} me-1 mb-1 text-nowrap`, 'data-search': `${a.name} ${a.employee_code}`.toLowerCase() }, content);
  }
  const menu = el('ul', { class: 'dropdown-menu' }, [
    el('li', {}, el('button', { type: 'button', class: 'dropdown-item', onclick: () => replaceDuty(slot, a) }, [el('i', { class: 'bi bi-arrow-left-right me-2' }), 'Replace…'])),
    el('li', {}, el('button', { type: 'button', class: 'dropdown-item', onclick: () => swapDuty(slot, a) }, [el('i', { class: 'bi bi-shuffle me-2' }), 'Swap with…'])),
    el('li', {}, el('hr', { class: 'dropdown-divider' })),
    el('li', {}, el('button', { type: 'button', class: 'dropdown-item text-danger', onclick: () => removeDuty(slot, a) }, [el('i', { class: 'bi bi-x-lg me-2' }), 'Remove'])),
  ]);
  return el('span', { class: 'dropdown d-inline-block me-1 mb-1', 'data-search': `${a.name} ${a.employee_code}`.toLowerCase() }, [
    el('button', { type: 'button', class: `chip ${cls} border-0 text-nowrap`, 'data-bs-toggle': 'dropdown', 'aria-expanded': 'false', title: [a.designation, a.department_name].filter(Boolean).join(' · ') }, content),
    menu,
  ]);
}

function addButton(slot, role, room = null) {
  if (isPublished()) return '';
  return el('button', { type: 'button', class: 'btn btn-sm btn-link p-0 small', onclick: () => addToSlot(slot, role, room) }, [el('i', { class: 'bi bi-plus-circle me-1' }), 'Add']);
}

/** Invigilators cell: room by room when the session has seating, else one list. */
function invigilatorsCell(s) {
  if (!s.has_seating) return [...s.invigilators.map((a) => dutyChip(s, a)), addButton(s, 'INVIGILATOR')];
  const blocks = s.rooms.map((room) => el('div', { class: 'd-flex flex-wrap align-items-start gap-1 py-1 border-bottom' }, [
    el('div', { class: 'small me-1', style: 'min-width: 9.5rem; max-width: 14rem' }, [
      el('span', { class: 'fw-semibold text-nowrap' }, room.room), ` · ${room.students} st. · `,
      el('span', { class: room.shortfall ? 'text-danger fw-semibold' : 'text-muted' }, `${room.invigilators.length}/${room.required}`),
      room.courses && room.courses.length
        ? el('div', { class: 'text-muted', style: 'font-size: .75rem', title: room.courses.map((c) => `${c.code} ${c.name}`).join('\n') }, room.courses.map((c) => c.code).join(', '))
        : '',
    ]),
    el('div', {}, [...room.invigilators.map((a) => dutyChip(s, a)), room.shortfall ? addButton(s, 'INVIGILATOR', room) : '']),
  ]));
  if (s.unroomed.length) {
    blocks.push(el('div', { class: 'd-flex flex-wrap align-items-start gap-1 py-1' }, [
      el('div', { class: 'small text-muted text-nowrap me-1', style: 'min-width: 9.5rem' }, 'No room yet'),
      el('div', {}, s.unroomed.map((a) => dutyChip(s, a))),
    ]));
  }
  return blocks;
}

function requiredCell(slot) {
  if (slot.has_seating) {
    return el('div', {}, [el('span', { class: 'fw-semibold' }, String(slot.required)), el('div', { class: 'small text-muted text-nowrap' }, 'from seating')]);
  }
  if (isPublished()) return el('span', {}, String(slot.required));
  const input = el('input', {
    type: 'number', min: '0', max: '500', value: String(slot.required), class: 'form-control form-control-sm',
    style: 'width: 4.5rem', 'aria-label': 'Invigilators needed', title: `Computed: ${slot.computed_required}`,
  });
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (v === '' || Number(v) === slot.computed_required) setOverride(slot, null);
    else setOverride(slot, Number(v));
  });
  return el('div', {}, [
    input,
    slot.override_required !== null
      ? el('button', { type: 'button', class: 'btn btn-link btn-sm p-0 small', onclick: () => setOverride(slot, null) }, `reset (${slot.computed_required})`)
      : '',
  ]);
}

function renderSlots() {
  const wrap = $('slotsWrap');
  wrap.innerHTML = '';
  if (!overview.slots.length) {
    wrap.appendChild(el('p', { class: 'text-muted mb-0' }, 'No exam slots in this cycle.'));
    return;
  }
  const rows = overview.slots.map((s) => {
    const short = s.shortfall + s.reserve_shortfall;
    return el('tr', {}, [
      el('td', { class: 'text-nowrap' }, [ddmmyyyy(s.exam_date), el('br'), el('span', { class: 'small text-muted' }, s.weekday)]),
      el('td', { class: 'text-nowrap small' }, s.time_slot_label),
      el('td', { class: 'small text-nowrap' }, [
        `${s.paper_count} / ${s.total_students}`, el('br'),
        el('button', {
          type: 'button', class: `btn btn-sm ${s.has_seating ? 'btn-outline-secondary' : 'btn-outline-primary'} mt-1 py-0`,
          disabled: isPublished() ? 'disabled' : undefined, onclick: () => editSeating(s),
        }, [el('i', { class: 'bi bi-grid-3x3-gap me-1' }), s.has_seating ? `${s.rooms.length} rooms` : 'Seating']),
      ]),
      el('td', {}, requiredCell(s)),
      el('td', {}, invigilatorsCell(s)),
      el('td', {}, [...s.reserves.map((a) => dutyChip(s, a)), s.reserve_required || s.reserves.length ? addButton(s, 'RESERVE') : '']),
      el('td', {}, short > 0 ? el('span', { class: 'chip chip-reappear' }, `${short} short`) : el('i', { class: 'bi bi-check-circle text-success' })),
    ]);
  });
  const heads = [['Date'], ['Time'], ['Papers / Students'], ['Needed'], ['Invigilators', 'min-width: 28rem'], ['Reserves', 'min-width: 9rem'], ['']];
  wrap.appendChild(el('table', { class: 'table align-top mb-0' }, [
    el('thead', {}, el('tr', {}, heads.map(([h, style]) => el('th', { style }, h)))),
    el('tbody', {}, rows),
  ]));
  applySearch();
}

function applySearch() {
  const q = $('slotSearch').value.trim().toLowerCase();
  document.querySelectorAll('#slotsWrap [data-search]').forEach((n) => {
    n.classList.toggle('opacity-25', !!q && !n.dataset.search.includes(q));
  });
}

function renderLoad() {
  const wrap = $('loadWrap');
  wrap.innerHTML = '';
  const load = overview.staff_load;
  wrap.appendChild(el('div', { class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 mb-2' }, [
    el('h3', { class: 'h6 fw-semibold mb-0' }, 'Duty load per staff member'),
    el('span', { class: 'small text-muted' }, 'The rotation keeps these counts within one of each other unless staff are unavailable or limited.'),
  ]));
  if (!load.length) {
    wrap.appendChild(el('p', { class: 'text-muted mb-0' }, 'No staff yet.'));
    return;
  }
  const rows = load.map((l) => el('tr', { class: l.is_active ? '' : 'text-muted' }, [
    el('td', {}, l.employee_code),
    el('td', {}, [l.name, l.is_active ? '' : el('span', { class: 'chip chip-neutral ms-1' }, 'Inactive')]),
    el('td', { class: 'small' }, l.department_name || '—'),
    el('td', {}, String(l.invigilator)),
    el('td', {}, String(l.reserve)),
    el('td', { class: 'fw-semibold' }, String(l.total)),
    el('td', { class: 'small' }, l.duties.map((d) => `${ddmmyyyy(d.exam_date)} ${d.time_slot_label}${d.role === 'RESERVE' ? ' (R)' : ''}`).join('; ')),
    el('td', { class: 'text-end' }, l.total > 0
      ? el('button', {
        type: 'button', class: 'btn btn-sm btn-link', title: 'Duty letter PDF',
        onclick: () => downloadPdfWithOptions(`/api/duties/letters-pdf${buildQuery({ cycle_id: cycleId, staff_id: l.staff_id })}`),
      }, el('i', { class: 'bi bi-envelope-paper' }))
      : ''),
  ]));
  wrap.appendChild(el('div', { class: 'table-scroll' }, el('table', { class: 'table table-sm align-middle mb-0' }, [
    el('thead', {}, el('tr', {}, ['Code', 'Name', 'Department', 'Invig.', 'Reserve', 'Total', 'Duties', ''].map((h) => el('th', {}, h)))),
    el('tbody', {}, rows),
  ])));
}

async function renderUnavailability() {
  const wrap = $('unavailWrap');
  const res = await apiGet(`/duties/unavailability${buildQuery({ cycle_id: cycleId })}`);
  const items = res.data;
  wrap.innerHTML = '';
  wrap.appendChild(el('div', { class: 'd-flex justify-content-between align-items-center mb-2' }, [
    el('h3', { class: 'h6 fw-semibold mb-0' }, 'Unavailable staff'),
    el('button', { type: 'button', class: 'btn btn-outline-primary btn-sm', onclick: addUnavailability }, [el('i', { class: 'bi bi-plus-lg me-1' }), 'Add']),
  ]));
  wrap.appendChild(el('p', { class: 'small text-muted' }, 'Leave or other engagements. The rotation skips these staff; they get the next duty they can take.'));
  if (!items.length) {
    wrap.appendChild(el('p', { class: 'text-muted small mb-0' }, 'Nobody marked unavailable in this cycle.'));
    return;
  }
  wrap.appendChild(el('ul', { class: 'list-unstyled mb-0 small' }, items.map((u) => el('li', { class: 'd-flex justify-content-between align-items-start gap-2 py-1 border-bottom' }, [
    el('div', {}, [
      el('div', { class: 'fw-semibold' }, `${u.name} (${u.employee_code})`),
      el('div', { class: 'text-muted' }, `${ddmmyyyy(u.date_from)}${u.date_to !== u.date_from ? ` – ${ddmmyyyy(u.date_to)}` : ''} · ${u.time_slot_label || 'All day'}${u.reason ? ` · ${u.reason}` : ''}`),
    ]),
    el('button', { type: 'button', class: 'btn btn-sm btn-link text-danger p-0', title: 'Remove', onclick: () => deleteUnavailability(u) }, el('i', { class: 'bi bi-trash' })),
  ]))));
}

let unavailModalEl = null;
async function addUnavailability() {
  if (!staffList.length) staffList = (await apiGet('/admin/staff')).data.filter((s) => Number(s.is_active));
  const start = overview.cycle.start_date;
  if (!unavailModalEl) {
    unavailModalEl = el('div', { class: 'modal fade', tabindex: '-1' }, el('div', { class: 'modal-dialog' }, el('form', { class: 'modal-content', novalidate: 'novalidate' }, [
      el('div', { class: 'modal-header' }, [el('h5', { class: 'modal-title' }, 'Mark staff unavailable'), el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' })]),
      el('div', { class: 'modal-body' }, [
        el('div', { class: 'mb-3' }, [el('label', { class: 'form-label', for: 'ua_staff' }, 'Staff member'), el('select', { class: 'form-select', id: 'ua_staff', name: 'staff_id' }), el('div', { class: 'invalid-text', 'data-error-for': 'staff_id' })]),
        el('div', { class: 'row g-2 mb-3' }, [
          el('div', { class: 'col-6' }, [el('label', { class: 'form-label', for: 'ua_from' }, 'From'), el('input', { type: 'date', class: 'form-control', id: 'ua_from', name: 'date_from' }), el('div', { class: 'invalid-text', 'data-error-for': 'date_from' })]),
          el('div', { class: 'col-6' }, [el('label', { class: 'form-label', for: 'ua_to' }, 'To'), el('input', { type: 'date', class: 'form-control', id: 'ua_to', name: 'date_to' }), el('div', { class: 'invalid-text', 'data-error-for': 'date_to' })]),
        ]),
        el('div', { class: 'mb-3' }, [el('label', { class: 'form-label', for: 'ua_slot' }, 'Session'), el('select', { class: 'form-select', id: 'ua_slot', name: 'time_slot_id' })]),
        el('div', { class: 'mb-0' }, [el('label', { class: 'form-label', for: 'ua_reason' }, 'Reason (optional)'), el('input', { type: 'text', class: 'form-control', id: 'ua_reason', name: 'reason', maxlength: '200', placeholder: 'e.g. Medical leave' })]),
      ]),
      el('div', { class: 'modal-footer' }, [el('button', { type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Cancel'), el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save')]),
    ])));
    document.body.appendChild(unavailModalEl);
    unavailModalEl.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      clearFieldErrors(form);
      const body = {
        staff_id: Number(form.staff_id.value) || null,
        date_from: form.date_from.value,
        date_to: form.date_to.value || form.date_from.value,
        time_slot_id: form.time_slot_id.value ? Number(form.time_slot_id.value) : null,
        reason: form.reason.value.trim() || null,
      };
      try {
        const res = await apiSend('POST', '/duties/unavailability', body);
        bootstrap.Modal.getOrCreateInstance(unavailModalEl).hide();
        const clashes = res.data.conflicting_duties;
        toast(clashes ? `Saved. ${clashes} existing duty(ies) clash — replace them or regenerate.` : 'Saved', clashes ? 'warning' : 'success');
        await renderUnavailability();
      } catch (err) {
        if (err instanceof ApiError && err.fields) fieldErrorsFrom(err, form);
        toast(errorMessage(err, 'Could not save'), 'error');
      }
    });
  }
  const form = unavailModalEl.querySelector('form');
  clearFieldErrors(form);
  form.staff_id.innerHTML = '';
  form.staff_id.appendChild(el('option', { value: '' }, 'Select…'));
  staffList.forEach((s) => form.staff_id.appendChild(el('option', { value: String(s.id) }, `${s.name} (${s.employee_code})${s.department_name ? ` — ${s.department_name}` : ''}`)));
  form.time_slot_id.innerHTML = '';
  form.time_slot_id.appendChild(el('option', { value: '' }, 'All day'));
  timeSlots.forEach((t) => form.time_slot_id.appendChild(el('option', { value: String(t.id) }, t.label)));
  form.date_from.value = start;
  form.date_to.value = start;
  form.date_from.min = form.date_to.min = overview.cycle.start_date;
  form.date_from.max = form.date_to.max = overview.cycle.end_date;
  form.reason.value = '';
  bootstrap.Modal.getOrCreateInstance(unavailModalEl).show();
}

async function deleteUnavailability(u) {
  const ok = await confirmDialog({ title: 'Remove unavailability', message: `${u.name} will be available for duty again on these dates.`, confirmLabel: 'Remove', danger: true });
  if (!ok) return;
  try {
    await apiSend('DELETE', `/duties/unavailability/${u.id}`);
    toast('Removed');
    await renderUnavailability();
  } catch (err) {
    toast(errorMessage(err, 'Could not remove'), 'error');
  }
}

// ---- Settings ---------------------------------------------------------------------------

async function saveSettings(e) {
  e.preventDefault();
  const f = e.target;
  clearFieldErrors(f);
  const body = {
    cycle_id: cycleId,
    students_per_invigilator: Number(f.students_per_invigilator.value),
    min_per_slot: Number(f.min_per_slot.value),
    reserve_per_slot: Number(f.reserve_per_slot.value),
    max_per_day: Number(f.max_per_day.value),
    room_threshold: Number(f.room_threshold.value),
    per_room_small: Number(f.per_room_small.value),
    per_room_large: Number(f.per_room_large.value),
    exclude_own_department: f.exclude_own_department.checked,
  };
  try {
    await apiSend('PUT', '/duties/settings', body);
    toast(overview.totals.assigned ? 'Settings saved. Regenerate the rotation to apply them.' : 'Settings saved');
    await load();
  } catch (err) {
    if (err instanceof ApiError && err.fields) fieldErrorsFrom(err, f);
    toast(errorMessage(err, 'Could not save settings'), 'error');
  }
}

// ---- Boot -------------------------------------------------------------------------------

async function load() {
  if (!cycleId) return;
  history.replaceState(null, '', '/duties' + buildQuery({ cycle_id: cycleId }));
  overview = (await apiGet(`/duties${buildQuery({ cycle_id: cycleId })}`)).data;
  renderHeader();
  renderStats();
  renderSlots();
  renderLoad();
}

async function init() {
  const [cyclesRes, metaRes] = await Promise.all([apiGet('/admin/cycles'), apiGet('/meta')]);
  timeSlots = metaRes.data.time_slots;
  const cycles = cyclesRes.data;
  const select = $('cycleSelect');
  cycles.forEach((c) => select.appendChild(el('option', { value: String(c.id) }, `${c.title} – ${c.month_year}${c.status === 'LOCKED' ? ' (locked)' : ''}`)));
  if (!cycles.length) {
    $('slotsWrap').innerHTML = '';
    $('slotsWrap').appendChild(el('p', { class: 'text-muted mb-0' }, 'No exam cycles yet. Create one in Admin > Sessions & Cycles.'));
    return;
  }
  if (!cycleId || !cycles.some((c) => c.id === cycleId)) cycleId = cycles[0].id;
  select.value = String(cycleId);
  select.addEventListener('change', async () => {
    cycleId = Number(select.value);
    await Promise.all([load(), renderUnavailability()]);
  });

  $('generateBtn').addEventListener('click', generate);
  $('publishBtn').addEventListener('click', togglePublish);
  $('settingsForm').addEventListener('submit', saveSettings);
  $('slotSearch').addEventListener('input', applySearch);
  const seatingFile = $('seatingFile');
  $('seatingUploadBtn').addEventListener('click', () => seatingFile.click());
  seatingFile.addEventListener('change', async () => {
    const file = seatingFile.files[0];
    seatingFile.value = '';
    if (file) await uploadSeating(file);
  });
  ['chartPdf', 'lettersPdf'].forEach((id) => $(id).addEventListener('click', (e) => {
    e.preventDefault();
    if ($(id).classList.contains('disabled')) return;
    downloadPdfWithOptions($(id).getAttribute('href'));
  }));
  $('exportExcel').addEventListener('click', (e) => { if ($('exportExcel').classList.contains('disabled')) e.preventDefault(); });

  await Promise.all([load(), renderUnavailability()]);
}

init().catch((err) => {
  console.error(err);
  toast('Could not load the duties page. Please refresh.', 'error');
});

