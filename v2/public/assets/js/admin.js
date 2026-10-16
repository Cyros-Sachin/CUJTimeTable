import { apiGet, apiSend, apiUpload, ApiError, buildQuery } from './api.js';
import { toast, confirmDialog, openFormModal, closeFormModal, formModalErrors, ddmmyyyy, el } from './ui.js';

const root = document.getElementById('adminTabRoot');
const tab = root.dataset.tab;

function table(headers, rows) {
  return el('table', { class: 'table align-middle mb-0' }, [
    el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))),
    el('tbody', {}, rows),
  ]);
}

function actionsCell(onEdit, onDelete) {
  return el('td', { class: 'text-end' }, [
    onEdit ? el('button', { type: 'button', class: 'btn btn-sm btn-link', onclick: onEdit }, el('i', { class: 'bi bi-pencil' })) : '',
    onDelete ? el('button', { type: 'button', class: 'btn btn-sm btn-link text-danger', onclick: onDelete }, el('i', { class: 'bi bi-trash' })) : '',
  ]);
}

// ---- Excel/CSV bulk import card (Departments, Programs, Coordinators) -------------------
function importCard({ resource, label, onImported }) {
  let file = null;
  const input = el('input', { type: 'file', accept: '.xlsx,.csv', class: 'd-none' });
  const fileName = el('span', { class: 'small fw-semibold' });
  const result = el('div', { class: 'mt-2' });
  const validateBtn = el('button', { type: 'button', class: 'btn btn-outline-secondary btn-sm', disabled: 'disabled' }, 'Validate only');
  const uploadBtn = el('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: 'disabled' }, 'Upload');

  input.addEventListener('change', () => {
    file = input.files[0] || null;
    fileName.textContent = file ? file.name : '';
    result.innerHTML = '';
    validateBtn.disabled = uploadBtn.disabled = !file;
  });

  async function run(dryRun) {
    if (!file) return;
    result.innerHTML = '';
    const fd = new FormData();
    fd.append('file', file);
    fd.append('dry_run', dryRun ? 'true' : 'false');
    try {
      const res = await apiUpload(`/admin/${resource}/import`, fd);
      const d = res.data;
      const skippedNote = d.skipped ? `; ${d.skipped} already exist${dryRun ? ' and will be skipped' : 'ed'}` : '';
      if (dryRun) {
        result.appendChild(el('p', { class: 'text-success small mb-0' }, `${d.valid} new ${label} ready to add${skippedNote}.`));
      } else {
        toast(`${d.inserted} ${label} added${skippedNote}`);
        file = null;
        input.value = '';
        fileName.textContent = '';
        validateBtn.disabled = uploadBtn.disabled = true;
        await onImported(d);
      }
    } catch (err) {
      if (err instanceof ApiError && err.rows && err.rows.length) {
        const tbl = el('table', { class: 'table table-sm mb-0' }, [
          el('thead', { class: 'table-danger' }, el('tr', {}, ['Row', 'Field', 'Message'].map((h) => el('th', {}, h)))),
          el('tbody', {}, err.rows.map((r) => el('tr', {}, [el('td', {}, String(r.row)), el('td', {}, r.field), el('td', {}, r.message)]))),
        ]);
        result.appendChild(el('div', { class: 'table-scroll', style: 'max-height:14rem;overflow-y:auto;' }, tbl));
      } else {
        toast(err instanceof ApiError ? err.message : 'Upload failed', 'error');
      }
    }
  }
  validateBtn.addEventListener('click', () => run(true));
  uploadBtn.addEventListener('click', () => run(false));

  return el('div', { class: 'card-surface p-3' }, [
    el('div', { class: 'd-flex flex-wrap align-items-center justify-content-between mb-2' }, [
      el('h3', { class: 'h6 fw-semibold mb-0' }, `Bulk add ${label} from Excel`),
      el('a', { href: `/api/admin/${resource}/template`, class: 'small' }, [el('i', { class: 'bi bi-download me-1' }), 'Download template']),
    ]),
    el('div', { class: 'd-flex flex-wrap align-items-center gap-2' }, [
      el('button', { type: 'button', class: 'btn btn-outline-secondary btn-sm', onclick: () => input.click() }, [el('i', { class: 'bi bi-cloud-upload me-1' }), 'Choose .xlsx / .csv']),
      input, fileName, validateBtn, uploadBtn,
    ]),
    result,
  ]);
}

// ---- Generic simple-resource CRUD (Departments, Subject Types, Time Slots) ----
async function renderSimpleCrud({ resource, title, fields, columns, deleteNote, importLabel }) {
  root.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const rows = (await apiGet(`/admin/${resource}`)).data;

  const addBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [el('i', { class: 'bi bi-plus-lg me-1' }), `Add ${title.toLowerCase()}`]);
  addBtn.addEventListener('click', () => openCreateEdit());

  const wrap = el('div', { class: 'd-flex flex-column gap-3' }, [
    importLabel ? importCard({
      resource, label: importLabel,
      onImported: async () => renderTable((await apiGet(`/admin/${resource}`)).data),
    }) : '',
    el('div', { class: 'd-flex justify-content-end' }, addBtn),
    el('div', { class: 'card-surface p-0', id: 'crudTableWrap' }),
  ]);
  root.innerHTML = '';
  root.appendChild(wrap);

  renderTable(rows);

  function renderTable(items) {
    const tableWrap = document.getElementById('crudTableWrap');
    tableWrap.innerHTML = '';
    if (!items.length) {
      tableWrap.appendChild(el('p', { class: 'text-muted mb-0 p-3' }, `No ${title.toLowerCase()}s yet.`));
      return;
    }
    const headers = [...columns.map((c) => c.label), ''];
    const bodyRows = items.map((item) => el('tr', {}, [
      ...columns.map((c) => el('td', {}, String(c.render ? c.render(item) : item[c.key] ?? ''))),
      actionsCell(() => openCreateEdit(item), () => doDelete(item)),
    ]));
    tableWrap.appendChild(el('div', { class: 'table-scroll' }, table(headers, bodyRows)));
  }

  async function openCreateEdit(item) {
    const values = await openFormModal({
      title: item ? `Edit ${title.toLowerCase()}` : `Add ${title.toLowerCase()}`,
      fields,
      initialValues: item || {},
    });
    if (!values) return;
    try {
      if (item) await apiSend('PUT', `/admin/${resource}/${item.id}`, values);
      else await apiSend('POST', `/admin/${resource}`, values);
      toast(`${title} ${item ? 'updated' : 'created'}`);
      closeFormModal();
      const refreshed = (await apiGet(`/admin/${resource}`)).data;
      renderTable(refreshed);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) formModalErrors(err);
        toast(err.message, 'error');
      }
    }
  }

  async function doDelete(item) {
    const ok = await confirmDialog({
      title: `Remove ${title.toLowerCase()}`,
      message: deleteNote ? deleteNote(item) : `This ${title.toLowerCase()} will be removed.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    try {
      await apiSend('DELETE', `/admin/${resource}/${item.id}`);
      toast(`${title} removed`);
      const refreshed = (await apiGet(`/admin/${resource}`)).data;
      renderTable(refreshed);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete', 'error');
    }
  }
}

async function renderDepartments() {
  await renderSimpleCrud({
    resource: 'departments', title: 'Department',
    fields: [{ name: 'code', label: 'Code', type: 'text' }, { name: 'name', label: 'Name', type: 'text' }],
    columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }],
    deleteNote: (d) => `"${d.name}" will be deactivated if it has programs, or deleted otherwise.`,
    importLabel: 'departments',
  });
}

async function renderTimeSlots() {
  await renderSimpleCrud({
    resource: 'time-slots', title: 'Time slot',
    fields: [
      { name: 'start_time', label: 'Start time', type: 'time' },
      { name: 'end_time', label: 'End time', type: 'time' },
    ],
    columns: [{ key: 'label', label: 'Label' }, { key: 'start_time', label: 'Start' }, { key: 'end_time', label: 'End' }],
    deleteNote: (d) => `"${d.label}" will be deactivated if used by entries, or deleted otherwise.`,
  });
}

async function renderPrograms() {
  root.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const [rows, meta] = await Promise.all([apiGet('/admin/programs'), apiGet('/meta')]);
  const items = rows.data;
  const departments = meta.data.departments;

  const addBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [el('i', { class: 'bi bi-plus-lg me-1' }), 'Add program']);
  addBtn.addEventListener('click', () => openCreateEdit());

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'd-flex flex-column gap-3' }, [
    importCard({ resource: 'programs', label: 'programs', onImported: async () => renderTable((await apiGet('/admin/programs')).data) }),
    el('div', { class: 'd-flex justify-content-end' }, addBtn),
    el('div', { class: 'card-surface p-0', id: 'crudTableWrap' }),
  ]));
  renderTable(items);

  function renderTable(list) {
    const wrap = document.getElementById('crudTableWrap');
    wrap.innerHTML = '';
    if (!list.length) { wrap.appendChild(el('p', { class: 'text-muted mb-0 p-3' }, 'No programs yet.')); return; }
    const bodyRows = list.map((p) => el('tr', {}, [
      el('td', {}, p.code), el('td', {}, p.name), el('td', {}, p.department_name), el('td', {}, String(p.total_semesters)),
      actionsCell(() => openCreateEdit(p), () => doDelete(p)),
    ]));
    wrap.appendChild(el('div', { class: 'table-scroll' }, table(['Code', 'Name', 'Department', 'Semesters', ''], bodyRows)));
  }

  async function openCreateEdit(item) {
    const values = await openFormModal({
      title: item ? 'Edit program' : 'Add program',
      fields: [
        { name: 'department_id', label: 'Department', type: 'select', options: departments.map((d) => ({ value: d.id, label: d.name })) },
        { name: 'code', label: 'Code', type: 'text' },
        { name: 'name', label: 'Name', type: 'text' },
        { name: 'total_semesters', label: 'Total semesters', type: 'number' },
      ],
      initialValues: item || { total_semesters: 4 },
    });
    if (!values) return;
    values.department_id = Number(values.department_id);
    values.total_semesters = Number(values.total_semesters);
    try {
      if (item) await apiSend('PUT', `/admin/programs/${item.id}`, values);
      else await apiSend('POST', '/admin/programs', values);
      toast(`Program ${item ? 'updated' : 'created'}`);
      closeFormModal();
      renderTable((await apiGet('/admin/programs')).data);
    } catch (err) {
      if (err instanceof ApiError) { if (err.fields) formModalErrors(err); toast(err.message, 'error'); }
    }
  }

  async function doDelete(item) {
    const ok = await confirmDialog({ title: 'Remove program', message: `"${item.name}" will be deactivated if it has exam entries, or deleted otherwise.`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      await apiSend('DELETE', `/admin/programs/${item.id}`);
      toast('Program removed');
      renderTable((await apiGet('/admin/programs')).data);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not delete', 'error');
    }
  }
}

async function renderSessionsCycles() {
  root.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const [sessionsRes, cyclesRes] = await Promise.all([apiGet('/admin/sessions'), apiGet('/admin/cycles')]);

  root.innerHTML = '';
  const sessionsHeader = el('div', { class: 'd-flex justify-content-between align-items-center mb-2' }, [
    el('h3', { class: 'h6 fw-semibold mb-0' }, 'Academic sessions'),
    el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => openSessionModal() }, [el('i', { class: 'bi bi-plus-lg me-1' }), 'Add session']),
  ]);
  const sessionsWrap = el('div', { class: 'card-surface p-0 mb-4', id: 'sessionsWrap' });
  const cyclesHeader = el('div', { class: 'd-flex justify-content-between align-items-center mb-2' }, [
    el('h3', { class: 'h6 fw-semibold mb-0' }, 'Exam cycles'),
    el('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => openCycleModal() }, [el('i', { class: 'bi bi-plus-lg me-1' }), 'Add cycle']),
  ]);
  const cyclesWrap = el('div', { class: 'card-surface p-0', id: 'cyclesWrap' });

  root.append(sessionsHeader, sessionsWrap, cyclesHeader, cyclesWrap);

  renderSessionsTable(sessionsRes.data);
  renderCyclesTable(cyclesRes.data);

  function renderSessionsTable(items) {
    sessionsWrap.innerHTML = '';
    const bodyRows = items.map((s) => el('tr', {}, [
      el('td', {}, s.label),
      el('td', {}, s.is_current ? el('span', { class: 'chip chip-open' }, 'Current') : ''),
      actionsCell(() => openSessionModal(s), null),
    ]));
    sessionsWrap.appendChild(el('div', { class: 'table-scroll' }, table(['Session', 'Current', ''], bodyRows)));
  }

  function renderCyclesTable(items) {
    cyclesWrap.innerHTML = '';
    const bodyRows = items.map((c) => el('tr', {}, [
      el('td', {}, `${c.title} – ${c.month_year}`),
      el('td', {}, c.session_label || ''),
      el('td', {}, `${ddmmyyyy(c.start_date)} – ${ddmmyyyy(c.end_date)}`),
      el('td', {}, c.status === 'LOCKED' ? el('span', { class: 'chip chip-locked' }, [el('i', { class: 'bi bi-lock-fill me-1' }), 'Locked']) : el('span', { class: 'chip chip-open' }, 'Open')),
      el('td', { class: 'text-end text-nowrap' }, [
        el('button', { type: 'button', class: 'btn btn-sm btn-link', onclick: () => openCycleModal(c), title: 'Edit' }, el('i', { class: 'bi bi-pencil' })),
        el('button', {
          type: 'button', class: 'btn btn-sm btn-outline-secondary',
          onclick: () => toggleCycleStatus(c),
        }, c.status === 'OPEN' ? [el('i', { class: 'bi bi-lock me-1' }), 'Lock'] : [el('i', { class: 'bi bi-unlock me-1' }), 'Unlock']),
      ]),
    ]));
    cyclesWrap.appendChild(el('div', { class: 'table-scroll' }, table(['Title', 'Session', 'Window', 'Status', ''], bodyRows)));
  }

  async function toggleCycleStatus(cycle) {
    try {
      await apiSend('PATCH', `/admin/cycles/${cycle.id}/status`, { status: cycle.status === 'OPEN' ? 'LOCKED' : 'OPEN' });
      toast(cycle.status === 'OPEN' ? 'Cycle locked' : 'Cycle unlocked');
      renderCyclesTable((await apiGet('/admin/cycles')).data);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update cycle status', 'error');
    }
  }

  async function openSessionModal(item) {
    const values = await openFormModal({
      title: item ? 'Edit academic session' : 'Add academic session',
      fields: [{ name: 'label', label: 'Label', type: 'text', hint: 'e.g. 2026-27' }, { name: 'is_current', label: 'Make this the current session', type: 'checkbox' }],
      initialValues: item ? { label: item.label, is_current: !!Number(item.is_current) } : {},
    });
    if (!values) return;
    try {
      if (item) await apiSend('PUT', `/admin/sessions/${item.id}`, values);
      else await apiSend('POST', '/admin/sessions', values);
      toast(item ? 'Session updated' : 'Session created');
      closeFormModal();
      renderSessionsTable((await apiGet('/admin/sessions')).data);
    } catch (err) {
      if (err instanceof ApiError) { if (err.fields) formModalErrors(err); toast(err.message, 'error'); }
    }
  }

  async function openCycleModal(item) {
    const sessions = (await apiGet('/admin/sessions')).data;
    const values = await openFormModal({
      title: item ? 'Edit exam cycle' : 'Add exam cycle',
      fields: [
        { name: 'academic_session_id', label: 'Academic session', type: 'select', options: sessions.map((s) => ({ value: s.id, label: s.label })) },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'month_year', label: 'Month, Year', type: 'text', hint: 'e.g. May, 2026' },
        { name: 'start_date', label: 'Start date', type: 'date' },
        { name: 'end_date', label: 'End date', type: 'date' },
      ],
      initialValues: item
        ? { academic_session_id: item.academic_session_id, title: item.title, month_year: item.month_year, start_date: item.start_date.slice(0, 10), end_date: item.end_date.slice(0, 10) }
        : { title: 'End Semester Examination' },
    });
    if (!values) return;
    values.academic_session_id = Number(values.academic_session_id);
    try {
      if (item) await apiSend('PUT', `/admin/cycles/${item.id}`, values);
      else await apiSend('POST', '/admin/cycles', values);
      toast(item ? 'Exam cycle updated' : 'Exam cycle created');
      closeFormModal();
      renderCyclesTable((await apiGet('/admin/cycles')).data);
    } catch (err) {
      if (err instanceof ApiError) { if (err.fields) formModalErrors(err); toast(err.message, 'error'); }
    }
  }
}

async function renderUsers() {
  root.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const [usersRes, metaRes] = await Promise.all([apiGet('/admin/users'), apiGet('/meta')]);
  const departments = metaRes.data.departments;

  const addBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [el('i', { class: 'bi bi-plus-lg me-1' }), 'Add coordinator']);
  addBtn.addEventListener('click', () => openCreateModal());

  root.innerHTML = '';
  root.appendChild(el('div', { class: 'd-flex flex-column gap-3' }, [
    importCard({ resource: 'users', label: 'coordinators', onImported: async (d) => { downloadCredentials(d.created || [], d.emailed || 0); renderTable((await apiGet('/admin/users')).data); } }),
    el('div', { class: 'd-flex justify-content-end' }, addBtn),
    el('div', { class: 'card-surface p-0', id: 'usersWrap' }),
  ]));
  renderTable(usersRes.data);

  function renderTable(items) {
    const wrap = document.getElementById('usersWrap');
    wrap.innerHTML = '';
    const bodyRows = items.map((u) => el('tr', {}, [
      el('td', {}, u.name), el('td', {}, u.email), el('td', {}, u.role === 'EXAM_CELL' ? 'Exam Cell' : 'Coordinator'),
      el('td', {}, u.department_name || '—'),
      el('td', {}, u.is_active ? el('span', { class: 'chip chip-open' }, 'Active') : el('span', { class: 'chip chip-neutral' }, 'Inactive')),
      el('td', {}, u.last_login_at ? ddmmyyyy(u.last_login_at.slice(0, 10)) : '—'),
      el('td', {}, u.role === 'DEPT_COORDINATOR' ? el('div', { class: 'd-flex gap-2' }, [
        el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', onclick: () => toggleActive(u) }, u.is_active ? 'Deactivate' : 'Activate'),
        el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', onclick: () => resetPassword(u) }, 'Reset password'),
      ]) : ''),
    ]));
    wrap.appendChild(el('div', { class: 'table-scroll' }, table(['Name', 'Email', 'Role', 'Department', 'Status', 'Last login', ''], bodyRows)));
  }

  // Temp passwords are only known now, so hand them over as a CSV the admin can keep.
  function downloadCredentials(created, emailed) {
    if (!created.length) return;
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['Name', 'Email', 'Department', 'Temporary password', 'Email sent'].map(esc).join(',')]
      .concat(created.map((c) => [c.name, c.email, c.department, c.temp_password, c.email_sent ? 'Yes' : 'No'].map(esc).join(',')));
    const url = URL.createObjectURL(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = el('a', { href: url, download: 'Coordinator_Credentials.csv' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`${emailed} of ${created.length} credential emails sent. Credentials CSV downloaded.`);
  }

  async function openCreateModal() {
    const values = await openFormModal({
      title: 'Add department coordinator',
      fields: [
        { name: 'name', label: 'Name', type: 'text' },
        { name: 'email', label: 'Email', type: 'email' },
        { name: 'department_id', label: 'Department', type: 'select', options: departments.map((d) => ({ value: d.id, label: d.name })) },
      ],
    });
    if (!values) return;
    values.department_id = Number(values.department_id);
    try {
      const res = await apiSend('POST', '/admin/users', values);
      toast('Coordinator created');
      closeFormModal();
      showTempPassword(res.data.email, res.data.temp_password, {});
      renderTable((await apiGet('/admin/users')).data);
    } catch (err) {
      if (err instanceof ApiError) { if (err.fields) formModalErrors(err); toast(err.message, 'error'); }
    }
  }

  async function toggleActive(user) {
    try {
      await apiSend('PUT', `/admin/users/${user.id}`, { is_active: !user.is_active });
      toast(user.is_active ? 'User deactivated' : 'User activated');
      renderTable((await apiGet('/admin/users')).data);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update user', 'error');
    }
  }

  async function resetPassword(user) {
    try {
      const res = await apiSend('POST', `/admin/users/${user.id}/reset-password`);
      showTempPassword(user.email, res.data.temp_password, { emailSent: res.data.email_sent, emailError: res.data.email_error });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reset password', 'error');
    }
  }

  function showTempPassword(email, password, { emailSent, emailError } = {}) {
    let visible = false;
    const pwText = el('span', { class: 'flex-grow-1 text-break', style: 'font-family:monospace' }, '\u2022'.repeat(password.length));
    const eyeIcon = el('i', { class: 'bi bi-eye' });
    const eyeBtn = el('button', { type: 'button', class: 'btn btn-sm btn-link text-secondary p-0', title: 'Show / hide password', 'aria-label': 'Show or hide password' }, eyeIcon);
    eyeBtn.addEventListener('click', () => {
      visible = !visible;
      pwText.textContent = visible ? password : '\u2022'.repeat(password.length);
      eyeIcon.className = visible ? 'bi bi-eye-slash' : 'bi bi-eye';
    });
    const copyBtn = el('button', { type: 'button', class: 'btn btn-sm btn-link text-secondary p-0', title: 'Copy password', 'aria-label': 'Copy password' }, el('i', { class: 'bi bi-clipboard' }));
    copyBtn.addEventListener('click', () => {
      if (navigator.clipboard) navigator.clipboard.writeText(password);
      toast('Copied');
    });

    const banner = emailSent === true
      ? el('div', { class: 'alert alert-success py-2 small' }, ['An email with the new password was sent to ', el('strong', {}, email), '.'])
      : emailSent === false
        ? el('div', { class: 'alert alert-danger py-2 small' }, `The email could not be sent${emailError ? ` (${emailError})` : ''}. Share the password below manually.`)
        : '';

    const modalEl = el('div', { class: 'modal fade' }, el('div', { class: 'modal-dialog' }, el('div', { class: 'modal-content' }, [
      el('div', { class: 'modal-header' }, [el('h5', { class: 'modal-title' }, 'Temporary password'), el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' })]),
      el('div', { class: 'modal-body' }, [
        banner,
        el('p', {}, ['Temporary password for ', el('strong', {}, email), '. They will be required to change it on first login.']),
        el('div', { class: 'd-flex align-items-center gap-2 border rounded px-3 py-2' }, [pwText, eyeBtn, copyBtn]),
      ]),
      el('div', { class: 'modal-footer' }, el('button', { type: 'button', class: 'btn btn-primary', 'data-bs-dismiss': 'modal' }, 'Done')),
    ])));
    document.body.appendChild(modalEl);
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modalEl.addEventListener('hidden.bs.modal', () => modalEl.remove());
    modal.show();
  }
}

async function renderBranding() {
  root.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const branding = (await apiGet('/admin/branding')).data;

  root.innerHTML = '';
  const form = el('form', { class: 'card-surface p-4 mb-4', style: 'max-width:28rem' }, [
    el('h3', { class: 'h6 fw-semibold mb-3' }, 'Controller details'),
    el('div', { class: 'mb-3' }, [el('label', { class: 'form-label' }, 'Controller name'), el('input', { class: 'form-control', name: 'controller_name', value: branding.controller_name || '' })]),
    el('div', { class: 'mb-3' }, [el('label', { class: 'form-label' }, 'Controller title'), el('input', { class: 'form-control', name: 'controller_title', value: branding.controller_title || 'Controller of Examinations' })]),
    el('button', { type: 'submit', class: 'btn btn-primary' }, 'Save'),
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiSend('PUT', '/admin/branding', {
        controller_name: form.querySelector('[name="controller_name"]').value,
        controller_title: form.querySelector('[name="controller_title"]').value,
      });
      toast('Branding updated');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update branding', 'error');
    }
  });

  const logoInput = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'd-none' });
  const logoCard = el('div', { class: 'card-surface p-4 mb-4', style: 'max-width:28rem' }, [
    el('h3', { class: 'h6 fw-semibold mb-2' }, 'Logo'),
    el('p', { class: 'small text-muted' }, 'PNG or JPG, up to 1MB. Appears at the top of each date sheet PDF.'),
    logoInput,
    el('button', { type: 'button', class: 'btn btn-outline-secondary', onclick: () => logoInput.click() }, 'Upload logo'),
  ]);
  logoInput.addEventListener('change', () => uploadBrandingFile('logo', logoInput.files[0]));

  const sigInput = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'd-none' });
  const sigCard = el('div', { class: 'card-surface p-4', style: 'max-width:28rem' }, [
    el('h3', { class: 'h6 fw-semibold mb-2' }, 'Signature'),
    el('p', { class: 'small text-muted' }, "PNG or JPG, up to 1MB. Appears above the Controller's name on each date sheet PDF."),
    sigInput,
    el('button', { type: 'button', class: 'btn btn-outline-secondary', onclick: () => sigInput.click() }, 'Upload signature'),
  ]);
  sigInput.addEventListener('change', () => uploadBrandingFile('signature', sigInput.files[0]));

  root.append(form, logoCard, sigCard);

  async function uploadBrandingFile(kind, file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await apiUpload(`/admin/branding/${kind}`, fd);
      toast(`${kind === 'logo' ? 'Logo' : 'Signature'} uploaded`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Upload failed', 'error');
    }
  }
}

async function renderAuditLog(page = 1) {
  root.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  const res = await apiGet(`/admin/audit-logs${buildQuery({ page, page_size: 50 })}`);
  const rows = res.data;
  const meta = res.meta;

  root.innerHTML = '';
  if (!rows.length) {
    root.appendChild(el('p', { class: 'text-muted mb-0' }, 'No audit log entries yet.'));
    return;
  }

  const bodyRows = rows.map((r) => el('tr', {}, [
    el('td', {}, new Date(r.created_at.replace(' ', 'T') + '+05:30').toLocaleString('en-IN')),
    el('td', {}, r.user_name || 'System'),
    el('td', {}, r.action),
    el('td', {}, r.entity ? `${r.entity}${r.entity_id ? ' #' + r.entity_id : ''}` : '—'),
    el('td', {}, r.ip || '—'),
  ]));

  const totalPages = Math.max(1, Math.ceil(meta.total / meta.page_size));
  root.appendChild(el('div', { class: 'card-surface p-0 mb-2' }, el('div', { class: 'table-scroll' }, table(['Time', 'User', 'Action', 'Entity', 'IP'], bodyRows))));
  if (totalPages > 1) {
    root.appendChild(el('div', { class: 'd-flex justify-content-between align-items-center small text-muted' }, [
      el('span', {}, `Page ${meta.page} of ${totalPages} (${meta.total} total)`),
      el('div', { class: 'd-flex gap-2' }, [
        el('button', { class: 'btn btn-sm btn-outline-secondary', disabled: page <= 1 ? 'disabled' : undefined, onclick: () => renderAuditLog(page - 1) }, 'Previous'),
        el('button', { class: 'btn btn-sm btn-outline-secondary', disabled: page >= totalPages ? 'disabled' : undefined, onclick: () => renderAuditLog(page + 1) }, 'Next'),
      ]),
    ]));
  }
}

const renderers = {
  departments: renderDepartments,
  programs: renderPrograms,
  'time-slots': renderTimeSlots,
  'sessions-cycles': renderSessionsCycles,
  users: renderUsers,
  branding: renderBranding,
  'audit-log': () => renderAuditLog(1),
};

(renderers[tab] || renderDepartments)().catch((err) => {
  console.error(err);
  toast('Could not load this tab. Please refresh.', 'error');
});
