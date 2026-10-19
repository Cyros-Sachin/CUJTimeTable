-- 001_reference_data.sql
-- Snapshot of departments, programs (with their semester counts), users, time slots and
-- academic sessions taken from the live database on 2026-10-19.
-- Idempotent: every row is inserted only if its natural key (code / email / label) is missing.
-- Existing rows are NEVER overwritten. Rows are linked by code, not by numeric id.
-- Applied automatically at container start by bin/migrate.php (tracked in `schema_migrations`).

-- Departments ----------------------------------------------------------------
INSERT IGNORE INTO departments (code, name, is_active) VALUES
 ('CMB', 'Centre for Molecular Biology', 0),
 ('CSIT', 'Department of Computer Science and Information Technology', 1),
 ('PHY', 'Department of Physics & Astronomical Sciences', 1),
 ('CHE', 'Department of Chemistry & Chemical Sciences', 1),
 ('BOT', 'Department of Botany', 1),
 ('ZOOL', 'Department of Zoology', 1),
 ('CSE', 'Department of Computer Science & Engineering', 1),
 ('ECE', 'Department of Electronics & Communication Engineering', 1),
 ('EVS', 'Department of Environmental Sciences', 1),
 ('MATH', 'Department of Mathematics', 1),
 ('ECO', 'Department of Economics', 1),
 ('ENG', 'Department of English', 1),
 ('HND', 'Department of Hindi & Other Indian Languages', 1),
 ('EDU', 'Department of Educational Studies', 1),
 ('TTM', 'Department of Tourism & Travel Management', 1),
 ('MSCM', 'Department of Marketing & Supply Chain Management', 1),
 ('MCNM', 'Department of Mass Communication & New Media', 1),
 ('PPPA', 'Department of Public Policy & Public Administration', 1),
 ('SW', 'Department of Social Work', 1),
 ('NSS', 'Department of National Security Studies', 1),
 ('HRM', 'Department of Human Resource Management', 1),
 ('MOLB', 'Centre for Molecular Biotechnology', 1),
 ('CCRC', 'Centre for Comparative Religion & Civilizations', 1);

-- Programs (total_semesters = number of semesters offered) --------------------
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, 'MSC-BT', 'M.Sc. Biotechnology', 4, 1 FROM departments WHERE code='CMB';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, 'BTECH-CS', 'B.Tech Computer Science', 8, 1 FROM departments WHERE code='CSIT';

-- Time slots ----------------------------------------------------------------
INSERT IGNORE INTO time_slots (label, start_time, end_time, is_active) VALUES
 ('10:00AM-1:00PM', '10:00:00', '13:00:00', 1),
 ('2:00PM-5:00PM', '14:00:00', '17:00:00', 1),
 ('10:30AM-12:30PM', '10:30:00', '12:30:00', 1);

-- Academic sessions: only make the snapshot's current session current if it is newly added
SET @new_sess = (SELECT COUNT(*)=0 FROM academic_sessions WHERE label='2026-27');
INSERT IGNORE INTO academic_sessions (label, is_current) VALUES ('2026-27', 0);
UPDATE academic_sessions SET is_current = (label='2026-27') WHERE @new_sess = 1;
