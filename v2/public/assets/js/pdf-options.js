// PDF download options: Exam Cell admins get a small dialog to add an
// optional serial number and note (printed at the end of the PDF) before
// each download. Everyone else downloads directly.

import { apiGet } from './api.js';
import { el } from './ui.js';

const STORAGE_KEY = 'pdfOptions';

let userPromise = null;
let modalEl = null;
let serialInput = null;
let noteInput = null;
let pendingUrl = null;

function currentUser() {
  if (!userPromise) {
    userPromise = apiGet('/auth/me').then((res) => res.data).catch((err) => {
      userPromise = null;
      throw err;
    });
  }
  return userPromise;
}

function loadSaved() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    return { serial: String(saved.serial || ''), note: String(saved.note || '') };
  } catch {
    return { serial: '', note: '' };
  }
}

function save(values) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // storage unavailable — values just won't be remembered
  }
}

function withOptions(url, serial, note) {
  const target = new URL(url, location.origin);
  if (serial) target.searchParams.set('serial', serial);
  else target.searchParams.delete('serial');
  if (note) target.searchParams.set('note', note);
  else target.searchParams.delete('note');
  return target.origin === location.origin ? target.pathname + target.search + target.hash : target.href;
}

function ensureModal() {
  if (modalEl) return;
  serialInput = el('input', { type: 'text', class: 'form-control', id: 'pdfOptSerial', name: 'serial', maxlength: '60', autocomplete: 'off', placeholder: 'e.g. CUJ/EXAM/2026/123' });
  noteInput = el('textarea', { class: 'form-control', id: 'pdfOptNote', name: 'note', rows: '4', maxlength: '2000', placeholder: 'e.g. Disclaimer: dates are subject to change' });

  const form = el('form', {}, [
    el('div', { class: 'modal-header' }, [
      el('h5', { class: 'modal-title' }, 'Download PDF'),
      el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal', 'aria-label': 'Close' }),
    ]),
    el('div', { class: 'modal-body' }, [
      el('p', { class: 'small text-muted' }, 'Both fields are optional. Leave them blank to download the PDF as is.'),
      el('div', { class: 'mb-3' }, [
        el('label', { class: 'form-label', for: 'pdfOptSerial' }, 'Serial Number'),
        serialInput,
        el('div', { class: 'form-text' }, 'Printed as the full reference number at the top-left. Leave blank to use CUJ/Exam/Datesheet/<year>/.'),
      ]),
      el('div', { class: 'mb-0' }, [
        el('label', { class: 'form-label', for: 'pdfOptNote' }, 'Note'),
        noteInput,
        el('div', { class: 'form-text' }, 'Shown at the end of the PDF — e.g. a disclaimer or any other remarks.'),
      ]),
    ]),
    el('div', { class: 'modal-footer' }, [
      el('button', { type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, [el('i', { class: 'bi bi-download me-1' }), 'Download']),
    ]),
  ]);

  modalEl = el('div', { class: 'modal fade', tabindex: '-1', id: 'pdfOptionsModal', 'aria-labelledby': 'pdfOptionsTitle' },
    el('div', { class: 'modal-dialog' }, el('div', { class: 'modal-content' }, form)));
  modalEl.querySelector('.modal-title').id = 'pdfOptionsTitle';
  document.body.appendChild(modalEl);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pendingUrl) return;
    const serial = serialInput.value.trim();
    const note = noteInput.value.trim();
    save({ serial, note });
    const target = withOptions(pendingUrl, serial, note);
    pendingUrl = null;
    bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    window.location.href = target;
  });
  modalEl.addEventListener('shown.bs.modal', () => serialInput.focus());
  modalEl.addEventListener('hidden.bs.modal', () => { pendingUrl = null; });
}

/** Hide any other open modal (e.g. the PDF preview) so ours never stacks on top of it. */
function hideOpenModals() {
  const open = [...document.querySelectorAll('.modal.show')].filter((m) => m !== modalEl);
  return Promise.all(open.map((m) => new Promise((resolve) => {
    m.addEventListener('hidden.bs.modal', () => resolve(), { once: true });
    setTimeout(resolve, 600); // fallback if Bootstrap ignores hide() mid-transition
    bootstrap.Modal.getOrCreateInstance(m).hide();
  })));
}

export async function downloadPdfWithOptions(url) {
  let user = null;
  try {
    user = await currentUser();
  } catch {
    user = null;
  }
  if (!user || user.role !== 'EXAM_CELL') {
    window.location.href = url;
    return;
  }

  ensureModal();
  const saved = loadSaved();
  serialInput.value = saved.serial;
  noteInput.value = saved.note;
  await hideOpenModals();
  pendingUrl = url;
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

export function bindPdfDownload(anchorEl) {
  if (!anchorEl) return;
  anchorEl.addEventListener('click', (e) => {
    const href = anchorEl.getAttribute('href');
    if (!href || href === '#' || anchorEl.classList.contains('disabled')) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    downloadPdfWithOptions(anchorEl.href);
  });
}
