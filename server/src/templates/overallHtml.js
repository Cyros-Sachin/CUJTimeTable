import { ddmmyyyy, weekdayOf } from '../utils/dates.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_STYLE = `
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: "Liberation Serif", "Times New Roman", serif; color: #000; margin: 0; padding: 0; font-size: 11px; }
  .hindi { font-family: "Noto Sans Devanagari", sans-serif; }
  .page { padding: 0 2mm; }
  .letterhead { text-align: center; }
  .letterhead .l1 { font-size: 18px; font-weight: bold; }
  .letterhead .l2 { font-size: 17px; font-weight: bold; }
  .letterhead .l3, .letterhead .l4 { font-size: 11px; }
  .rule { border: none; border-top: 1.5px solid #000; margin: 6px 0 4px; }
  .title { text-align: center; font-weight: bold; text-decoration: underline; font-size: 14px; margin: 8px 0 10px; }
  table.overall { width: 100%; border-collapse: collapse; }
  table.overall thead { display: table-header-group; }
  table.overall tr { page-break-inside: avoid; }
  table.overall th, table.overall td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; }
  table.overall th { text-align: center; font-weight: bold; }
  table.overall td.num { text-align: right; }
  table.overall td.center { text-align: center; }
  tr.total-row td { font-weight: bold; background: #f0f0f0; }
`;

export function overallHtml({ cycleTitle, cycleMonthYear, rows }) {
  const title = `DATE SHEET FOR ${cycleTitle.toUpperCase()} - ${cycleMonthYear} (ALL DEPARTMENTS)`;

  const body = [];
  let sno = 0;
  let currentDate = null;
  let dayTotalPapers = 0;
  let dayTotalStudents = 0;

  const flushDayTotal = () => {
    if (currentDate) {
      body.push(`<tr class="total-row"><td colspan="9" class="center">Total for ${ddmmyyyy(currentDate)}</td><td class="num">${dayTotalPapers} papers / ${dayTotalStudents} students</td></tr>`);
    }
  };

  rows.forEach((r) => {
    if (r.exam_date !== currentDate) {
      flushDayTotal();
      currentDate = r.exam_date;
      dayTotalPapers = 0;
      dayTotalStudents = 0;
    }
    dayTotalPapers += 1;
    dayTotalStudents += r.student_count;
    sno += 1;
    body.push(`
      <tr>
        <td class="center">${sno}</td>
        <td class="center">${ddmmyyyy(r.exam_date)} (${weekdayOf(r.exam_date)})</td>
        <td class="center">${esc(r.time_slot_label)}</td>
        <td>${esc(r.department_name)}</td>
        <td>${esc(r.program_name)}</td>
        <td class="center">${r.semester}</td>
        <td class="center">${r.exam_type === 'REGULAR' ? 'Regular' : 'Re-appear'}</td>
        <td class="center">${esc(r.course_code)}</td>
        <td>${esc(r.course_name)}</td>
        <td class="num">${r.student_count}</td>
      </tr>`);
  });
  flushDayTotal();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>${BASE_STYLE}</style>
</head>
<body>
  <div class="page">
    <div class="letterhead">
      <div class="l1 hindi">जम्मू केंद्रीय विश्वविद्यालय</div>
      <div class="l2">Central University of Jammu</div>
      <div class="l3 hindi">राया-सूचानी (बागला)-181143, सांबा, जम्मू (जम्मू और कश्मीर)</div>
      <div class="l4">Rahya-Suchani (Bagla), Samba-181143, Jammu</div>
    </div>
    <hr class="rule" />
    <div class="title">${esc(title)}</div>
    <table class="overall">
      <thead>
        <tr>
          <th>S.No</th><th>Date (Day)</th><th>Time</th><th>Department</th><th>Program</th>
          <th>Sem</th><th>Type</th><th>Course Code</th><th>Course Name</th><th>Students</th>
        </tr>
      </thead>
      <tbody>
        ${body.join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}
