CREATE DATABASE IF NOT EXISTS cuj_datesheet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cuj_datesheet;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20)  NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL UNIQUE,            -- printed in "To, The Head, <name>"
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS programs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  department_id INT UNSIGNED NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(200) NOT NULL,                   -- e.g. M.Sc. Biotechnology
  total_semesters TINYINT UNSIGNED NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_prog_dept_name (department_id, name),
  UNIQUE KEY uq_prog_code (code),
  CONSTRAINT fk_prog_dept FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subject_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS time_slots (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(30) NOT NULL UNIQUE,            -- printed as is, e.g. 2:00PM-5:00PM
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(20) NOT NULL UNIQUE,            -- 2025-26
  is_current TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exam_cycles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  academic_session_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,                  -- End Semester Examination
  month_year VARCHAR(30) NOT NULL,              -- May, 2026
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('OPEN','LOCKED') NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cycle (academic_session_id, title, month_year),
  CONSTRAINT fk_cycle_sess FOREIGN KEY (academic_session_id) REFERENCES academic_sessions(id),
  CONSTRAINT chk_cycle_dates CHECK (end_date >= start_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('DEPT_COORDINATOR','EXAM_CELL') NOT NULL,
  department_id INT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_dept FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT chk_user_role_dept CHECK (
    (role = 'EXAM_CELL' AND department_id IS NULL) OR
    (role = 'DEPT_COORDINATOR' AND department_id IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS exam_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_cycle_id INT UNSIGNED NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  program_id INT UNSIGNED NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  exam_type ENUM('REGULAR','REAPPEAR') NOT NULL,
  subject_type_id INT UNSIGNED NOT NULL,
  time_slot_id INT UNSIGNED NOT NULL,
  exam_date DATE NOT NULL,
  course_code VARCHAR(30) NOT NULL,
  course_name VARCHAR(200) NOT NULL,
  student_count INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  updated_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_slot (exam_cycle_id, program_id, semester, exam_type, exam_date, time_slot_id),
  UNIQUE KEY uq_course (exam_cycle_id, program_id, semester, exam_type, course_code),
  KEY ix_cycle_date (exam_cycle_id, exam_date, time_slot_id),
  KEY ix_dept (department_id),
  CONSTRAINT fk_e_cycle FOREIGN KEY (exam_cycle_id) REFERENCES exam_cycles(id),
  CONSTRAINT fk_e_dept  FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_e_prog  FOREIGN KEY (program_id) REFERENCES programs(id),
  CONSTRAINT fk_e_stype FOREIGN KEY (subject_type_id) REFERENCES subject_types(id),
  CONSTRAINT fk_e_slot  FOREIGN KEY (time_slot_id) REFERENCES time_slots(id),
  CONSTRAINT fk_e_cby   FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_e_uby   FOREIGN KEY (updated_by) REFERENCES users(id),
  CONSTRAINT chk_e_students CHECK (student_count BETWEEN 1 AND 5000)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS datesheet_refs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_cycle_id INT UNSIGNED NOT NULL,
  program_id INT UNSIGNED NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  exam_type ENUM('REGULAR','REAPPEAR') NOT NULL,
  ref_year SMALLINT UNSIGNED NOT NULL,
  ref_seq INT UNSIGNED NOT NULL,
  ref_no VARCHAR(60) NOT NULL UNIQUE,
  issued_on DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ref_target (exam_cycle_id, program_id, semester, exam_type),
  UNIQUE KEY uq_ref_seq (ref_year, ref_seq),
  CONSTRAINT fk_r_cycle FOREIGN KEY (exam_cycle_id) REFERENCES exam_cycles(id),
  CONSTRAINT fk_r_prog  FOREIGN KEY (program_id) REFERENCES programs(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(50) NOT NULL,
  entity VARCHAR(50) NULL,
  entity_id VARCHAR(50) NULL,
  details JSON NULL,
  ip VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_audit_user (user_id),
  KEY ix_audit_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(60) PRIMARY KEY,
  v TEXT NULL
) ENGINE=InnoDB;

-- Seed data (idempotent) -----------------------------------------------------
INSERT IGNORE INTO subject_types (name) VALUES
 ('Core'),('Discipline Specific Elective'),('Generic Elective'),('Open Elective'),
 ('Skill Enhancement'),('Ability Enhancement'),('Value Added'),('Project/Dissertation');
INSERT IGNORE INTO time_slots (label,start_time,end_time) VALUES
 ('10:00AM-1:00PM','10:00:00','13:00:00'),('2:00PM-5:00PM','14:00:00','17:00:00');
INSERT IGNORE INTO academic_sessions (label,is_current) VALUES ('2025-26',1);
INSERT IGNORE INTO departments (code,name) VALUES
 ('CMB','Centre for Molecular Biology'),
 ('CSIT','Department of Computer Science and Information Technology');
INSERT IGNORE INTO programs (department_id,code,name,total_semesters)
 SELECT id,'MSC-BT','M.Sc. Biotechnology',4 FROM departments WHERE code='CMB';
INSERT IGNORE INTO programs (department_id,code,name,total_semesters)
 SELECT id,'BTECH-CS','B.Tech Computer Science',8 FROM departments WHERE code='CSIT';
INSERT IGNORE INTO exam_cycles (academic_session_id,title,month_year,start_date,end_date)
 SELECT id,'End Semester Examination','May, 2026','2026-05-01','2026-05-31'
 FROM academic_sessions WHERE label='2025-26';
INSERT IGNORE INTO settings (k,v) VALUES
 ('controller_title','Controller of Examinations'),('controller_name',''),
 ('signature_path',''),('logo_path','');
