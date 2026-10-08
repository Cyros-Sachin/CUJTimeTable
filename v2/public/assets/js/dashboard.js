import { apiGet } from './api.js';
import { ddmmyyyy, el } from './ui.js';

async function main() {
  const stats = (await apiGet('/dashboard/stats')).data;

  const cards = [
    ['Entries', stats.entries],
    ['Programs covered', stats.programs_covered],
    ['Next exam date', stats.next_exam_date ? ddmmyyyy(stats.next_exam_date) : '—'],
    ['Clashes blocked this week', stats.clashes_blocked_week],
  ];

  const wrap = document.getElementById('statCards');
  wrap.innerHTML = '';
  cards.forEach(([label, value]) => {
    wrap.appendChild(el('div', { class: 'col-6 col-lg-3' }, [
      el('div', { class: 'card-surface stat-card' }, [
        el('div', { class: 'stat-label' }, label),
        el('div', { class: 'stat-value' }, String(value)),
      ]),
    ]));
  });

  if (stats.department_status) {
    const table = el('table', { class: 'table align-middle mb-0' }, [
      el('thead', {}, el('tr', {}, [
        el('th', {}, 'Department'), el('th', {}, 'Groups with entries'), el('th', {}, 'Last updated'),
      ])),
      el('tbody', {}, stats.department_status.map((d) => el('tr', {}, [
        el('td', { class: 'fw-semibold' }, d.name),
        el('td', {}, d.groups_with_entries > 0
          ? el('span', { class: 'chip chip-open' }, `${d.groups_with_entries} groups`)
          : el('span', { class: 'chip chip-neutral' }, 'No entries')),
        el('td', { class: 'text-muted' }, d.last_updated ? ddmmyyyy(d.last_updated.slice(0, 10)) : '—'),
      ]))),
    ]);
    const container = document.getElementById('deptStatusWrap');
    container.appendChild(el('div', { class: 'card-surface p-3' }, [
      el('h2', { class: 'h6 fw-semibold mb-3' }, 'Department submission status'),
      el('div', { class: 'table-scroll' }, table),
    ]));
  }
}

main().catch((err) => console.error(err));
