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

// ---- Generic simple-resource CRUD (Departments, Subject Types, Time Slots) ----
async function renderSimpleCrud({ resource, title, fields, columns, deleteNote }) {
  root.innerHTML = '<div class="skeleton" style="height:240px"></div>';
  const rows = (await apiGet(`/admin/${resource}`)).data;

  const addBtn = el('button', { type: 'button', class: 'btn btn-primary' }, [el('i', { class: 'bi bi-plus-lg me-1' }), `Add ${title.toLowerCase()}`]);
  addBtn.addEventListener('click', () => openCreateEdit());

  const wrap = el('div', { class: 'd-flex flex-column gap-3' }, [
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
  });
}

async function renderSubjectTypes() {
  await renderSimpleCrud({
    resource: 'subject-types', title: 'Subject type',
    fields: [{ name: 'name', label: 'Name', type: 'text' }],
    columns: [{ key: 'name', label: 'Name' }],
    deleteNote: (d) => `"${d.name}" will be deactivated if used by entries, or deleted otherwise.`,
  });
}

async function renderTimeSlots() {
  await renderSimpleCrud({
    resource: 'time-slots', title: 'Time slot',
    fields: [
      { name: 'label', label: 'Label', type: 'text', hint: 'e.g. 2:00PM-5:00PM' },
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
    ]));
    sessionsWrap.appendChild(el('div', { class: 'table-scroll' }, table(['Session', 'Current'], bodyRows)));
  }

  function renderCyclesTable(items) {
    cyclesWrap.innerHTML = '';
    const bodyRows = items.map((c) => el('tr', {}, [
      el('td', {}, `${c.title} – ${c.month_year}`),
      el('td', {}, c.session_label || ''),
      el('td', {}, `${ddmmyyyy(c.start_date)} – ${ddmmyyyy(c.end_date)}`),
      el('td', {}, c.status === 'LOCKED' ? el('span', { class: 'chip chip-locked' }, [el('i', { class: 'bi bi-lock-fill me-1' }), 'Locked']) : el('span', { class: 'chip chip-open' }, 'Open')),
      el('td', {}, el('button', {
        type: 'button', class: 'btn btn-sm btn-outline-secondary',
        onclick: () => toggleCycleStatus(c),
      }, c.status === 'OPEN' ? [el('i', { class: 'bi bi-lock me-1' }), 'Lock'] : [el('i', { class: 'bi bi-unlock me-1' }), 'Unlock'])),
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

  async function openSessionModal() {
    const values = await openFormModal({
      title: 'Add academic session',
      fields: [{ name: 'label', label: 'Label', type: 'text', hint: 'e.g. 2026-27' }, { name: 'is_current', label: 'Make this the current session', type: 'checkbox' }],
    });
    if (!values) return;
    try {
      await apiSend('POST', '/admin/sessions', values);
      toast('Session created');
      closeFormModal();
      renderSessionsTable((await apiGet('/admin/sessions')).data);
    } catch (err) {
      if (err instanceof ApiError) { if (err.fields) formModalErrors(err); toast(err.message, 'error'); }
    }
  }

  async function openCycleModal() {
    const sessions = (await apiGet('/admin/sessions')).data;
    const values = await openFormModal({
      title: 'Add exam cycle',
      fields: [
        { name: 'academic_session_id', label: 'Academic session', type: 'select', options: sessions.map((s) => ({ value: s.id, label: s.label })) },
        { name: 'title', label: 'Title', type: 'text' },
        { name: 'month_year', label: 'Month, Year', type: 'text', hint: 'e.g. May, 2026' },
        { name: 'start_date', label: 'Start date', type: 'date' },
        { name: 'end_date', label: 'End date', type: 'date' },
      ],
      initialValues: { title: 'End Semester Examination' },
    });
    if (!values) return;
    values.academic_session_id = Number(values.academic_session_id);
    try {
      await apiSend('POST', '/admin/cycles', values);
      toast('Exam cycle created');
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
      showTempPassword(res.data.email, res.data.temp_password);
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
      showTempPassword(user.email, res.data.temp_password);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not reset password', 'error');
    }
  }

  function showTempPassword(email, password) {
    const modalEl = el('div', { class: 'modal fade' }, el('div', { class: 'modal-dialog' }, el('div', { class: 'modal-content' }, [
      el('div', { class: 'modal-header' }, [el('h5', { class: 'modal-title' }, 'Temporary password'), el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' })]),
      el('div', { class: 'modal-body' }, [
        el('p', {}, ['Share this temporary password with ', el('strong', {}, email), '. They will be required to change it on first login.']),
        el('p', { class: 'border rounded px-3 py-2', style: 'font-family:monospace' }, password),
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
  'subject-types': renderSubjectTypes,
  'sessions-cycles': renderSessionsCycles,
  users: renderUsers,
  branding: renderBranding,
  'audit-log': () => renderAuditLog(1),
};

(renderers[tab] || renderDepartments)().catch((err) => {
  console.error(err);
  toast('Could not load this tab. Please refresh.', 'error');
});
