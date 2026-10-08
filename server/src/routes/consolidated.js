import { Router } from 'express';
import archiver from 'archiver';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { validateQuery } from '../middleware/validate.js';
import { requireRole } from '../middleware/rbac.js';
import { listEntries, listAllEntriesForExport } from '../services/entryService.js';
import { buildConsolidatedWorkbook } from '../services/excelService.js';
import { renderDatesheetPdf, renderOverallPdf } from '../services/pdfService.js';
import { getOrCreateRef } from '../services/refService.js';
import { weekdayOf } from '../utils/dates.js';
import { writeAudit } from '../services/auditService.js';
import { httpError } from '../utils/httpError.js';

export const consolidatedRouter = Router();
consolidatedRouter.use(requireRole('EXAM_CELL'));

const filtersSchema = z.object({
  cycle_id: z.coerce.number().int().positive().optional(),
  exam_type: z.enum(['REGULAR', 'REAPPEAR']).optional(),
  department_id: z.coerce.number().int().positive().optional(),
  program_id: z.coerce.number().int().positive().optional(),
  semester: z.coerce.number().int().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
});

function dayWiseSummary(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.exam_date}|${r.time_slot_label}`;
    if (!map.has(key)) {
      map.set(key, { exam_date: r.exam_date, weekday: weekdayOf(r.exam_date), time_slot_label: r.time_slot_label, paper_count: 0, total_students: 0, departments: new Set() });
    }
    const bucket = map.get(key);
    bucket.paper_count += 1;
    bucket.total_students += r.student_count;
    bucket.departments.add(r.department_name);
  }
  return [...map.values()]
    .sort((a, b) => (a.exam_date + a.time_slot_label).localeCompare(b.exam_date + b.time_slot_label))
    .map((b) => ({ ...b, departments: [...b.departments] }));
}

consolidatedRouter.get('/', validateQuery(filtersSchema), async (req, res, next) => {
  try {
    const result = await listEntries(req.user, req.query);
    const allForSummary = await listAllEntriesForExport(req.user, req.query);
    res.json({
      data: result.rows,
      meta: { total: result.total, page: result.page, page_size: result.pageSize },
      day_wise_summary: dayWiseSummary(allForSummary),
    });
  } catch (err) {
    next(err);
  }
});

consolidatedRouter.get('/excel', validateQuery(filtersSchema), async (req, res, next) => {
  try {
    const rows = (await listAllEntriesForExport(req.user, req.query)).map((r) => ({ ...r, weekday: weekdayOf(r.exam_date) }));
    const dayWise = dayWiseSummary(rows);
    const byDepartment = {};
    for (const r of rows) {
      (byDepartment[r.department_name] ||= []).push(r);
    }

    const cycleLabel = rows[0] ? `${rows[0].cycle_title} ${rows[0].cycle_month_year}` : 'All';
    const workbook = await buildConsolidatedWorkbook({ cycleLabel, rows, dayWise, byDepartment });

    const safeName = cycleLabel.replace(/[^a-z0-9]+/gi, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="CUJ_Consolidated_Datesheet_${safeName}.xlsx"`);
    await workbook.xlsx.write(res);
    await writeAudit({ userId: req.user.id, action: 'EXPORT_EXCEL', entity: 'consolidated', details: req.query, ip: req.ip });
    res.end();
  } catch (err) {
    next(err);
  }
});

consolidatedRouter.get('/pdf', validateQuery(filtersSchema), async (req, res, next) => {
  try {
    const rows = await listAllEntriesForExport(req.user, req.query);
    if (!rows.length) throw httpError(404, 'NOT_FOUND', 'No entries match these filters');

    const pdfBuffer = await renderOverallPdf({
      cycleTitle: rows[0].cycle_title, cycleMonthYear: rows[0].cycle_month_year, rows,
    });

    await writeAudit({ userId: req.user.id, action: 'EXPORT_PDF_OVERALL', entity: 'consolidated', details: req.query, ip: req.ip });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="CUJ_Overall_Datesheet.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    next(err);
  }
});

consolidatedRouter.get('/zip', validateQuery(filtersSchema), async (req, res, next) => {
  try {
    const rows = await listAllEntriesForExport(req.user, req.query);
    if (!rows.length) throw httpError(404, 'NOT_FOUND', 'No entries match these filters');

    const groups = new Map();
    for (const r of rows) {
      const key = `${r.department_id}|${r.program_id}|${r.semester}|${r.exam_type}`;
      if (!groups.has(key)) {
        groups.set(key, {
          departmentName: r.department_name, departmentCode: r.department_code, programName: r.program_name,
          programCode: r.program_code, semester: r.semester, examType: r.exam_type,
          cycleTitle: r.cycle_title, cycleMonthYear: r.cycle_month_year, exam_cycle_id: req.query.cycle_id,
          rows: [],
        });
      }
      groups.get(key).rows.push(r);
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="CUJ_All_Datesheets.zip"');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', next);
    archive.pipe(res);

    for (const group of groups.values()) {
      const { refNo, issuedOn } = await withTransaction((conn) => getOrCreateRef(conn, {
        cycleId: req.query.cycle_id, programId: group.rows[0].program_id, semester: group.semester, examType: group.examType,
      }));
      const pdfBuffer = await renderDatesheetPdf({
        refNo, issuedOn, cycleTitle: group.cycleTitle, cycleMonthYear: group.cycleMonthYear,
        departmentName: group.departmentName, programName: group.programName, semester: group.semester,
        examType: group.examType, rows: group.rows,
      });
      const examLabel = group.examType === 'REAPPEAR' ? 'Reappear' : 'Regular';
      const fileName = `Datesheet_${group.departmentCode}_${group.programCode}_Sem${group.semester}_${examLabel}_${group.cycleMonthYear.replace(/[,\s]+/g, '-')}.pdf`;
      archive.append(Buffer.from(pdfBuffer), { name: `${group.departmentName}/${fileName}` });
    }

    await writeAudit({ userId: req.user.id, action: 'EXPORT_ZIP', entity: 'consolidated', details: req.query, ip: req.ip });
    await archive.finalize();
  } catch (err) {
    next(err);
  }
});
