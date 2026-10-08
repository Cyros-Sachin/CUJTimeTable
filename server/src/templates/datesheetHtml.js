import { ddmmyyyy, weekdayOf, longDate } from '../utils/dates.js';
import { toRoman } from '../utils/roman.js';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BASE_STYLE = `
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: "Liberation Serif", "Times New Roman", serif; color: #000; margin: 0; padding: 0; font-size: 13px; }
  .hindi { font-family: "Noto Sans Devanagari", sans-serif; }
  .page { padding: 0 2mm; }
  .letterhead { text-align: center; }
  .letterhead img.logo { height: 60px; margin-bottom: 4px; }
  .letterhead .l1 { font-size: 20px; font-weight: bold; }
  .letterhead .l2 { font-size: 19px; font-weight: bold; }
  .letterhead .l3 { font-size: 12px; }
  .letterhead .l4 { font-size: 12px; }
  .rule { border: none; border-top: 1.5px solid #000; margin: 6px 0 4px; }
  .ref-row { display: flex; justify-content: space-between; font-size: 13px; margin: 6px 0; }
  .title { text-align: center; font-weight: bold; text-decoration: underline; font-size: 15px; margin: 10px 0 4px; }
  .dept-line { text-align: center; font-weight: bold; text-decoration: underline; text-transform: uppercase; font-size: 14px; margin: 2px 0; }
  .program-line { text-align: center; font-weight: bold; text-decoration: underline; font-size: 13px; margin: 2px 0 12px; }
  table.datesheet { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.datesheet thead { display: table-header-group; }
  table.datesheet tr { page-break-inside: avoid; }
  table.datesheet th, table.datesheet td { border: 1px solid #000; padding: 6px 8px; font-size: 13px; }
  table.datesheet th { text-align: center; font-weight: bold; }
  table.datesheet td.date-cell { text-align: center; white-space: nowrap; }
  table.datesheet td.date-cell .weekday { display: block; font-size: 11px; }
  table.datesheet td.code-cell { text-align: center; white-space: nowrap; }
  table.datesheet td.name-cell { text-align: center; }
  table.datesheet td.time-cell { text-align: center; white-space: nowrap; }
  .footer-row { display: flex; justify-content: space-between; margin-top: 46px; }
  .to-block { font-size: 13px; }
  .to-block .head-line { font-weight: bold; }
  .sign-block { text-align: center; font-size: 13px; }
  .sign-block img.signature { height: 50px; display: block; margin: 0 auto 4px; }
  .sign-block .controller-name { font-weight: bold; }
  .sign-block .controller-title { font-weight: bold; margin-top: 2px; }
`;

export function datesheetHtml({
  logoDataUri, signatureDataUri, controllerName, controllerTitle,
  refNo, issuedOn, cycleTitle, cycleMonthYear, departmentName, programName,
  semester, examType, rows,
}) {
  const title = `DATE SHEET FOR ${cycleTitle.toUpperCase()} - ${cycleMonthYear}`;
  const programLine = `${esc(programName)} SEMESTER-${toRoman(semester)}${examType === 'REAPPEAR' ? ' (REAPPEAR)' : ''}`;

  const tableRows = rows.map((r) => `
    <tr>
      <td class="date-cell">${ddmmyyyy(r.exam_date)}<span class="weekday">(${weekdayOf(r.exam_date)})</span></td>
      <td class="code-cell">(${esc(r.course_code)})</td>
      <td class="name-cell">${esc(r.course_name)}</td>
      <td class="time-cell">${esc(r.time_slot_label)}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(refNo)}</title>
<style>${BASE_STYLE}</style>
</head>
<body>
  <div class="page">
    <div class="letterhead">
      ${logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="" />` : ''}
      <div class="l1 hindi">जम्मू केंद्रीय विश्वविद्यालय</div>
      <div class="l2">Central University of Jammu</div>
      <div class="l3 hindi">राया-सूचानी (बागला)-181143, सांबा, जम्मू (जम्मू और कश्मीर)</div>
      <div class="l4">Rahya-Suchani (Bagla), Samba-181143, Jammu</div>
    </div>
    <hr class="rule" />
    <div class="ref-row">
      <span>${esc(refNo)}</span>
      <span>${esc(longDate(issuedOn))}</span>
    </div>
    <div class="title">${esc(title)}</div>
    <div class="dept-line">${esc(departmentName)}</div>
    <div class="program-line">${programLine}</div>
    <table class="datesheet">
      <thead>
        <tr>
          <th style="width:20%">Date</th>
          <th style="width:18%">Course Code</th>
          <th style="width:42%">Courses Name</th>
          <th style="width:20%">Time</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    <div class="footer-row">
      <div class="to-block">
        <div>To</div>
        <div class="head-line">The Head,</div>
        <div>${esc(departmentName)}</div>
      </div>
      <div class="sign-block">
        ${signatureDataUri ? `<img class="signature" src="${signatureDataUri}" alt="" />` : ''}
        ${controllerName ? `<div class="controller-name">${esc(controllerName)}</div>` : ''}
        <div class="controller-title">${esc(controllerTitle)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
