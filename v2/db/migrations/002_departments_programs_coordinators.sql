-- 002_departments_programs_coordinators.sql
-- Departments, programs and department coordinators from db/Departments_Template.xlsx,
-- db/Programs_Template.xlsx and db/Coordinators_Template.xlsx (2026-10-21).
-- Spreadsheet department names are mapped onto the department codes from 001 (spellings in the
-- sheets differ, e.g. "and" vs "&"). "Centre for Molecular Biology" maps to the active MOLB.
-- Idempotent: rows whose code / email already exists are skipped, nothing is overwritten.
-- Coordinators get an unusable password hash: use "Reset password" in Admin > Coordinators to
-- email each one a temporary password (they must change it on first login).



-- Programs (code = university programme code, total_semesters = semesters offered)
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '3', 'B.Voc (Banking and Financial Services)', 6, 1 FROM departments WHERE code='CC';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '1', 'B.Voc (Retail Management)', 6, 1 FROM departments WHERE code='CC';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '2', 'B.Voc (Tourism Management)', 6, 1 FROM departments WHERE code='CC';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '90', 'Bachelor of Arts(Hons)(Defence and Strategic Studies)', 6, 1 FROM departments WHERE code='NSS';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '95', 'Bachelor of Arts(Hons)(English Literature)', 6, 1 FROM departments WHERE code='ENG';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '93', 'Bachelor of Arts(Hons)(Hindi)', 6, 1 FROM departments WHERE code='HND';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '92', 'Bachelor of Arts(Hons)(Journalism and Mass Communication)', 6, 1 FROM departments WHERE code='MCNM';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '89', 'Bachelor of Arts(Hons)(Public Policy and Public Administration)', 6, 1 FROM departments WHERE code='PPPA';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '94', 'Bachelor of Arts(Hons)(Religious Studies)', 6, 1 FROM departments WHERE code='CCRC';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '91', 'Bachelor of Arts(Hons)(Social Work)', 6, 1 FROM departments WHERE code='SW';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '96', 'Bachelor of Education (B.A.-B.Ed.)', 8, 1 FROM departments WHERE code='EDU';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '97', 'Bachelor of Education (B.Sc.-B.Ed.)', 8, 1 FROM departments WHERE code='EDU';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '68', 'Bachelor of Technology - Computer Science and Engineering (Cyber Security)', 8, 1 FROM departments WHERE code='CSE';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '67', 'Bachelor of Technology - Computer Science and Engineering', 8, 1 FROM departments WHERE code='CSE';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '70', 'Bachelor of Technology - Electronics and Communication Engineering (Avionics)', 8, 1 FROM departments WHERE code='ECE';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '69', 'Bachelor of Technology - Electronics and Communication Engineering', 8, 1 FROM departments WHERE code='ECE';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '79', 'Bachelor of Technology (Mathematics and Computing)', 8, 1 FROM departments WHERE code='CSE';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '53', 'Integrated B.A-B.Ed', 8, 1 FROM departments WHERE code='EDU';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '40', 'Integrated B.Sc (Hons) M.Sc in Botany', 10, 1 FROM departments WHERE code='BOT';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '41', 'Integrated B.Sc (Hons)- M.Sc in Chemistry', 10, 1 FROM departments WHERE code='CHE';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '42', 'Integrated B.Sc (Hons)- M.Sc in Physics', 10, 1 FROM departments WHERE code='PHY';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '43', 'Integrated B.Sc (Hons)- M.Sc in Zoology', 10, 1 FROM departments WHERE code='ZOOL';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '71', 'Integrated B.Sc. (Hons) - M.Sc. Economics', 10, 1 FROM departments WHERE code='ECO';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '77', 'Integrated B.Sc.(Hons.)-M.Sc. - Environmental Sciences', 10, 1 FROM departments WHERE code='EVS';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '75', 'Integrated B.Sc.(Hons.)-M.Sc. - Mathematics', 10, 1 FROM departments WHERE code='MATH';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '87', 'Integrated B.Sc.-M.Sc.(Biotechnology)', 10, 1 FROM departments WHERE code='MOLB';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '88', 'Integrated Programmes(Integrated BBA-MBA)', 10, 1 FROM departments WHERE code='HRM';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '22', 'M.Tech. (Computer Science and Technology)', 4, 1 FROM departments WHERE code='CSIT';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '72', 'Master of Arts(Comparative Religion and Civilization)', 4, 1 FROM departments WHERE code='CCRC';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '84', 'Master of Arts(Defence and Strategic Studies)', 4, 1 FROM departments WHERE code='NSS';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '8', 'Master of Arts(Economics)', 4, 1 FROM departments WHERE code='ECO';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '14', 'Master of Arts(English)', 4, 1 FROM departments WHERE code='ENG';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '20', 'Master of Arts(Hindi)', 4, 1 FROM departments WHERE code='HND';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '17', 'Master of Arts(Mass Communication and New Media)', 4, 1 FROM departments WHERE code='MCNM';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '18', 'Master of Arts(National Security Studies)', 4, 1 FROM departments WHERE code='NSS';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '15', 'Master of Arts(Public Policy and Public Administration)', 4, 1 FROM departments WHERE code='PPPA';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '16', 'Master of Arts(Social Work)', 4, 1 FROM departments WHERE code='SW';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '13', 'Master of Business Administration', 4, 1 FROM departments WHERE code='HRM';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '12', 'Master of Business Administration (Marketing Management)', 4, 1 FROM departments WHERE code='MSCM';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '10', 'Master of Business Administration (Tourism and Travel Management)', 4, 1 FROM departments WHERE code='TTM';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '19', 'Master of Education(M.Ed.)', 4, 1 FROM departments WHERE code='EDU';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '78', 'Master of Science (Semiconductor Technology and Applications)', 4, 1 FROM departments WHERE code='ECE';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '83', 'Master of Science (Zoology)', 4, 1 FROM departments WHERE code='ZOOL';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '57', 'Master of Science(Biotechnology)', 4, 1 FROM departments WHERE code='MOLB';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '80', 'Master of Science(Botany)', 4, 1 FROM departments WHERE code='BOT';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '81', 'Master of Science(Chemistry)', 4, 1 FROM departments WHERE code='CHE';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '9', 'Master of Science(Environmental Sciences)', 4, 1 FROM departments WHERE code='EVS';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '21', 'Master of Science(Material Science & Technology)', 4, 1 FROM departments WHERE code='MST';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '24', 'Master of Science(Mathematics)', 4, 1 FROM departments WHERE code='MATH';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '82', 'Master of Science(Physics)', 4, 1 FROM departments WHERE code='PHY';
INSERT IGNORE INTO programs (department_id, code, name, total_semesters, is_active)
 SELECT id, '85', 'Master of Technology(Electronics and Communication Engineering)', 4, 1 FROM departments WHERE code='ECE';

-- Department coordinators --------------------------------------------------
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Dhanananajay Kumar', 'dhanananajay.zool@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='ZOOL';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Sushil Kamble', 'sushil.pppa@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='PPPA';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Akshay Kumar', 'akshay.che@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='CHE';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Sanjay Kumar', 'sanjay.math@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='MATH';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'R Sudhakar', 'rsudhakar.nss@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='NSS';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Sachin Kumar Gupta', 'sachin.ece@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='ECE';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Samantha Vaishnavi', 'samanthavaishnavi@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='BOT';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Ratnesh Kumar', 'ratnesh.hnd@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='HND';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Neena Gupta', 'neena.eng@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='ENG';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Umesh Kumar', 'umesh.mcnm@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='MCNM';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Susanta Nag', 'susanta.eco@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='ECO';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Bharti Gupta', 'bharti.ttm@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='TTM';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Dinesh Kumar', 'dinesh.evs@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='EVS';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Arvind Rituraj', 'arvind.ccrc@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='CCRC';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Samantha Vaishnavi', 'samantha.bot@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='BOT';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Pradeep Kumar Singh', 'pradeep.cse@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='CSIT';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Amit Sahu', 'amit.molb@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='MOLB';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Yad Ram', 'yad.edu@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='EDU';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Anju Thapa', 'anju.mscm@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='MSCM';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Vinay Kumar', 'vinay.phy@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='PHY';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Nancy Mengi', 'nancymengi@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='SW';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Asif Ali', 'asif.hrm@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='HRM';
INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
 SELECT 'Naresh Kumar', 'naresh.mscm@cujammu.ac.in', '!', 'DEPT_COORDINATOR', id, 1 FROM departments WHERE code='MSCM';
