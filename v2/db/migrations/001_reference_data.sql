-- 001_reference_data.sql
-- Snapshot of departments, programs (with their semester counts), users, time slots and
-- academic sessions taken from the live database on 2026-10-19.
-- Idempotent: every row is inserted only if its natural key (code / email / label) is missing.
-- Existing rows are NEVER overwritten. Rows are linked by code, not by numeric id.
-- Applied automatically at container start by bin/migrate.php (tracked in `schema_migrations`).

-- Departments ----------------------------------------------------------------
INSERT IGNORE INTO departments (code, name, is_active) VALUES
    ('CCRC', 'Centre for Comparitive Religion and Civilization', 1),
    ('CMB', 'Centre for Molecular Biology', 1),
    ('CC', 'Community College', 1),
    ('ECE', 'Department Electronics and Communication Engineering', 1),
    ('BOT', 'Department of Botany', 1),
    ('CHE', 'Department of Chemistry and Chemical Sciences', 1),
    ('CSE', 'Department of Computer Science and Engineering', 1),
    ('CSIT', 'Department of Computer Science and Information Technology', 1),
    ('ECO', 'Department of Economics', 1),
    ('EDU', 'Department of Educational Studies', 1),
    ('ENG', 'Department of English', 1),
    ('EVS', 'Department of Environmental Sciences', 1),
    ('HND', 'Department of Hindi & Other Indian Languages', 1),
    ('HRM', 'Department of Human Resource Management & Organizational Behaviour', 1),
    ('MSCM', 'Department of Marketing and Supply Chain Management', 1),
    ('MCNM', 'Department of Mass Communication and New Media', 1),
    ('MST', 'Department of Material Science & Technology', 1),
    ('MATH', 'Department of Mathematics', 1),
    ('NSS', 'Department of National Security Studies', 1),
    ('PHY', 'Department of Physics and Astronomical Sciences', 1),
    ('PPPA', 'Department of Public Policy and Public Administration', 1),
    ('SW', 'Department of Social work', 1),
    ('TTM', 'Department of Tourism and Travel Management', 1),
    ('ZOOL', 'Department of Zoology', 1);
    
-- Time slots ----------------------------------------------------------------
INSERT IGNORE INTO time_slots (label, start_time, end_time, is_active) VALUES
 ('10:00AM-1:00PM', '10:00:00', '13:00:00', 1),
 ('2:00PM-5:00PM', '14:00:00', '17:00:00', 1),
 ('10:30AM-12:30PM', '10:30:00', '12:30:00', 1);

-- Academic sessions: only make the snapshot's current session current if it is newly added
SET @new_sess = (SELECT COUNT(*)=0 FROM academic_sessions WHERE label='2026-27');
INSERT IGNORE INTO academic_sessions (label, is_current) VALUES ('2026-27', 0);
UPDATE academic_sessions SET is_current = (label='2026-27') WHERE @new_sess = 1;
