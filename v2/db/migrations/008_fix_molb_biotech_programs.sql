-- 008_fix_molb_biotech_programs.sql
-- 002 inserted the two Biotechnology programmes "FROM departments WHERE code='MOLB'", but the
-- Centre for Molecular Biology is seeded by 001 as code 'CMB', so neither row was ever created.
-- This adds them under CMB:
--   87  Integrated B.Sc.-M.Sc.(Biotechnology)  - only if programme code 87 does not exist yet
--   57  Master of Science(Biotechnology)       - only if code 57 does not exist AND the department has
--                                                no M.Sc. Biotechnology programme under another code
--                                                (e.g. one added by hand as "M.Sc. Biotechnology")
-- Idempotent: INSERT IGNORE + NOT EXISTS guards, nothing existing is changed.

INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT d.id, '87', 'Integrated B.Sc.-M.Sc.(Biotechnology)', 10, 1 FROM departments d
 WHERE d.code = 'CMB' AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.code = '87');

INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT d.id, '57', 'Master of Science(Biotechnology)', 4, 1 FROM departments d
 WHERE d.code = 'CMB' AND NOT EXISTS (
   SELECT 1 FROM programs p WHERE p.code = '57'
      OR (p.department_id = d.id AND p.name LIKE '%Sc%Biotech%' AND p.name NOT LIKE 'Integrated%'));
