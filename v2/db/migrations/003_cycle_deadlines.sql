-- 003_cycle_deadlines.sql
-- Submission deadline per exam cycle + per-department re-open grants.
--
-- After exam_cycles.submission_deadline has passed (i.e. from the next day on), department
-- coordinators can no longer add, edit, delete or upload entries in that cycle, unless the
-- Exam Cell re-opens the cycle for their department (a row in cycle_department_unlocks).
-- A grant with unlocked_until = NULL stays open until revoked; otherwise it lapses after that date.
--
-- The CREATE comes first and is idempotent, so a re-run after a failed ALTER is safe.

CREATE TABLE IF NOT EXISTS cycle_department_unlocks (
  exam_cycle_id INT UNSIGNED NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  unlocked_until DATE NULL,
  granted_by INT UNSIGNED NOT NULL,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exam_cycle_id, department_id),
  CONSTRAINT fk_cdu_cycle FOREIGN KEY (exam_cycle_id) REFERENCES exam_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_cdu_dept  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  CONSTRAINT fk_cdu_user  FOREIGN KEY (granted_by) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE exam_cycles ADD COLUMN submission_deadline DATE NULL AFTER end_date;
