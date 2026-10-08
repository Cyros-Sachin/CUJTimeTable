import { Router } from 'express';
import { pool } from '../db.js';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', async (req, res, next) => {
  try {
    const isCoordinator = req.user.role === 'DEPT_COORDINATOR';
    const deptWhere = isCoordinator ? 'WHERE department_id = :deptId' : '';
    const params = isCoordinator ? { deptId: req.user.departmentId } : {};

    const [[entryCount]] = await pool.query(`SELECT COUNT(*) AS count FROM exam_entries ${deptWhere}`, params);
    const [[programCount]] = await pool.query(
      `SELECT COUNT(DISTINCT program_id) AS count FROM exam_entries ${deptWhere}`,
      params,
    );
    const [[nextExam]] = await pool.query(
      `SELECT MIN(exam_date) AS next_date FROM exam_entries ${deptWhere ? `${deptWhere} AND exam_date >= CURDATE()` : 'WHERE exam_date >= CURDATE()'}`,
      params,
    );
    const [[clashesBlocked]] = await pool.query(
      `SELECT COUNT(*) AS count FROM audit_logs
       WHERE action = 'ENTRY_CLASH_BLOCKED' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       ${isCoordinator ? 'AND user_id IN (SELECT id FROM users WHERE department_id = :deptId)' : ''}`,
      params,
    );

    const data = {
      entries: Number(entryCount.count),
      programs_covered: Number(programCount.count),
      next_exam_date: nextExam.next_date,
      clashes_blocked_week: Number(clashesBlocked.count),
    };

    if (!isCoordinator) {
      const [deptStatus] = await pool.query(`
        SELECT d.id, d.name, d.code,
               COUNT(DISTINCT CONCAT(e.program_id, '-', e.semester, '-', e.exam_type)) AS groups_with_entries,
               MAX(e.updated_at) AS last_updated
        FROM departments d
        LEFT JOIN exam_entries e ON e.department_id = d.id
        WHERE d.is_active = 1
        GROUP BY d.id, d.name, d.code
        ORDER BY d.name
      `);
      data.department_status = deptStatus;
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});
