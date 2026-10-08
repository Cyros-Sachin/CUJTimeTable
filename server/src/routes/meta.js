import { Router } from 'express';
import { pool } from '../db.js';

export const metaRouter = Router();

metaRouter.get('/', async (req, res, next) => {
  try {
    const isCoordinator = req.user.role === 'DEPT_COORDINATOR';
    const deptFilter = isCoordinator ? 'WHERE id = :deptId AND is_active = 1' : 'WHERE is_active = 1';
    const programFilter = isCoordinator ? 'WHERE department_id = :deptId AND is_active = 1' : 'WHERE is_active = 1';
    const params = isCoordinator ? { deptId: req.user.departmentId } : {};

    const [departments, programs, subjectTypes, timeSlots, sessions, cycles] = await Promise.all([
      pool.query(`SELECT id, code, name FROM departments ${deptFilter} ORDER BY name`, params),
      pool.query(`SELECT id, code, name, department_id, total_semesters FROM programs ${programFilter} ORDER BY name`, params),
      pool.query('SELECT id, name FROM subject_types WHERE is_active = 1 ORDER BY id'),
      pool.query('SELECT id, label, start_time, end_time FROM time_slots WHERE is_active = 1 ORDER BY start_time'),
      pool.query('SELECT id, label, is_current FROM academic_sessions ORDER BY label DESC'),
      pool.query(
        `SELECT id, academic_session_id, title, month_year, start_date, end_date, status FROM exam_cycles ORDER BY start_date DESC`,
      ),
    ]);

    res.json({
      data: {
        departments: departments[0],
        programs: programs[0],
        subject_types: subjectTypes[0],
        time_slots: timeSlots[0],
        sessions: sessions[0],
        cycles: cycles[0],
      },
    });
  } catch (err) {
    next(err);
  }
});
