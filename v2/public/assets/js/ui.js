// Small shared UI helpers: toasts, a confirm dialog built on Bootstrap's
// modal, and date/format helpers used across the page scripts.

export function toast(message, variant = 'success') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `alert alert-${variant === 'error' ? 'danger' : variant} shadow-sm mb-0`;
  el.style.minWidth = '260px';
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

let confirmModalEl = null;
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  if (!confirmModalEl) {
    confirmModalEl = document.createElement('div');
    confirmModalEl.className = 'modal fade';
    confirmModalEl.tabIndex = -1;
    confirmModalEl.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title" data-role="title"></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body" data-role="message"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn" data-role="confirm">Confirm</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(confirmModalEl);
  }
  confirmModalEl.querySelector('[data-role="title"]').textContent = title;
  confirmModalEl.querySelector('[data-role="message"]').textContent = message;
  const confirmBtn = confirmModalEl.querySelector('[data-role="confirm"]');
  confirmBtn.textContent = confirmLabel;
  confirmBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

  const modal = bootstrap.Modal.getOrCreateInstance(confirmModalEl);
  return new Promise((resolve) => {
    const onConfirm = () => { cleanup(); modal.hide(); resolve(true); };
    const onHide = () => { cleanup(); resolve(false); };
    function cleanup() {
      confirmBtn.removeEventListener('click', onConfirm);
      confirmModalEl.removeEventListener('hidden.bs.modal', onHide);
    }
    confirmBtn.addEventListener('click', onConfirm);
    confirmModalEl.addEventListener('hidden.bs.modal', onHide);
    modal.show();
  });
}

export function ddmmyyyy(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function weekdayOf(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function examTypeLabel(type) {
  return type === 'REGULAR' ? 'Regular' : 'Re-appear';
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null) node.setAttribute(key, value);
  });
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child === undefined || child === null) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

export function setLoading(button, loading, idleLabel) {
  button.disabled = loading;
  button.textContent = loading ? 'Please wait…' : idleLabel;
}

let formModalEl = null;

/**
 * Generic create/edit modal form for the admin CRUD tabs.
 * fields: [{ name, label, type: 'text'|'number'|'select'|'checkbox'|'time'|'date', options?, hint? }]
 * Resolves with the submitted values object, or null if cancelled.
 */
export function openFormModal({ title, fields, initialValues = {}, submitLabel = 'Save' }) {
  if (!formModalEl) {
    formModalEl = document.createElement('div');
    formModalEl.className = 'modal fade';
    formModalEl.tabIndex = -1;
    document.body.appendChild(formModalEl);
  }

  const fieldHtml = fields.map((f) => {
    const value = initialValues[f.name];
    const errorDiv = `<div class="invalid-text" data-error-for="${f.name}"></div>`;
    const hint = f.hint ? `<div class="form-text">${f.hint}</div>` : '';
    if (f.type === 'checkbox') {
      return `<div class="form-check mb-3">
        <input type="checkbox" class="form-check-input" id="fm_${f.name}" name="${f.name}" ${value ? 'checked' : ''} />
        <label class="form-check-label" for="fm_${f.name}">${f.label}</label>${errorDiv}</div>`;
    }
    if (f.type === 'select') {
      const opts = f.options.map((o) => `<option value="${o.value}" ${String(o.value) === String(value ?? '') ? 'selected' : ''}>${o.label}</option>`).join('');
      return `<div class="mb-3"><label class="form-label" for="fm_${f.name}">${f.label}</label>
        <select class="form-select" id="fm_${f.name}" name="${f.name}"><option value="">Select…</option>${opts}</select>${hint}${errorDiv}</div>`;
    }
    return `<div class="mb-3"><label class="form-label" for="fm_${f.name}">${f.label}</label>
      <input type="${f.type}" class="form-control" id="fm_${f.name}" name="${f.name}" value="${value ?? ''}" />${hint}${errorDiv}</div>`;
  }).join('');

  formModalEl.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <form id="genericForm">
          <div class="modal-header"><h5 class="modal-title">${title}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">${fieldHtml}</div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-primary">${submitLabel}</button>
          </div>
        </form>
      </div>
    </div>`;

  const modal = bootstrap.Modal.getOrCreateInstance(formModalEl);
  const formEl = formModalEl.querySelector('#genericForm');

  return new Promise((resolve) => {
    let resolved = false;
    const onSubmit = (e) => {
      e.preventDefault();
      const values = {};
      fields.forEach((f) => {
        const input = formEl.querySelector(`[name="${f.name}"]`);
        values[f.name] = f.type === 'checkbox' ? input.checked : input.value;
      });
      resolved = true;
      resolve(values);
    };
    const onHide = () => {
      formEl.removeEventListener('submit', onSubmit);
      formModalEl.removeEventListener('hidden.bs.modal', onHide);
      if (!resolved) resolve(null);
    };
    formEl.addEventListener('submit', onSubmit);
    formModalEl.addEventListener('hidden.bs.modal', onHide);
    modal.show();
  });
}

export function closeFormModal() {
  if (formModalEl) bootstrap.Modal.getOrCreateInstance(formModalEl).hide();
}

export function formModalErrors(apiError) {
  if (!formModalEl || !apiError.fields) return;
  Object.entries(apiError.fields).forEach(([field, message]) => {
    const feedback = formModalEl.querySelector(`[data-error-for="${field}"]`);
    if (feedback) feedback.textContent = message;
  });
}

export function fieldErrorsFrom(apiError, formEl) {
  if (!apiError.fields) return;
  Object.entries(apiError.fields).forEach(([field, message]) => {
    const input = formEl.querySelector(`[name="${field}"]`);
    const feedback = formEl.querySelector(`[data-error-for="${field}"]`);
    if (input) input.classList.add('is-invalid');
    if (feedback) feedback.textContent = message;
  });
}

export function clearFieldErrors(formEl) {
  formEl.querySelectorAll('.is-invalid').forEach((n) => n.classList.remove('is-invalid'));
  formEl.querySelectorAll('[data-error-for]').forEach((n) => { n.textContent = ''; });
}
