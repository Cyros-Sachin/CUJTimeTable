-- 005_invigilation_duties.sql
-- Invigilation duty assignment.
--
-- staff                 the duty pool (teaching / non-teaching staff, no login needed)
-- duty_rosters          one roster per exam cycle: rotation settings + DRAFT / PUBLISHED status
-- duty_slot_overrides   Exam Cell override of the invigilators needed for one date + time slot
-- duty_assignments      who is on duty in which date + time slot (INVIGILATOR or RESERVE)
-- staff_unavailability  leave / other engagements, for a date range and one slot or the whole day
--
-- The required invigilators per slot are computed live from exam_entries:
--   max(min_per_slot, ceil(total students in the slot / students_per_invigilator))
-- unless duty_slot_overrides has a row for that slot.
-- Every statement is idempotent (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS staff (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(30) NOT NULL,
  name VARCHAR(120) NOT NULL,
  department_id INT UNSIGNED NULL,
  designation VARCHAR(100) NULL,
  email VARCHAR(160) NULL,
  phone VARCHAR(20) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_code (employee_code),
  KEY ix_staff_dept (department_id),
  CONSTRAINT fk_staff_dept FOREIGN KEY (department_id) REFERENCES departments(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duty_rosters (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_cycle_id INT UNSIGNED NOT NULL,
  students_per_invigilator SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  min_per_slot SMALLINT UNSIGNED NOT NULL DEFAULT 2,
  reserve_per_slot SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  max_per_day TINYINT UNSIGNED NOT NULL DEFAULT 1,
  exclude_own_department TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
  generated_at DATETIME NULL,
  generated_by INT UNSIGNED NULL,
  published_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_roster_cycle (exam_cycle_id),
  CONSTRAINT fk_roster_cycle FOREIGN KEY (exam_cycle_id) REFERENCES exam_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_roster_gen_by FOREIGN KEY (generated_by) REFERENCES users(id),
  CONSTRAINT chk_roster_spi CHECK (students_per_invigilator BETWEEN 1 AND 1000),
  CONSTRAINT chk_roster_min CHECK (min_per_slot <= 500),
  CONSTRAINT chk_roster_reserve CHECK (reserve_per_slot <= 100),
  CONSTRAINT chk_roster_day CHECK (max_per_day BETWEEN 1 AND 10)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duty_slot_overrides (
  roster_id INT UNSIGNED NOT NULL,
  exam_date DATE NOT NULL,
  time_slot_id INT UNSIGNED NOT NULL,
  required SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (roster_id, exam_date, time_slot_id),
  CONSTRAINT fk_dso_roster FOREIGN KEY (roster_id) REFERENCES duty_rosters(id) ON DELETE CASCADE,
  CONSTRAINT fk_dso_slot FOREIGN KEY (time_slot_id) REFERENCES time_slots(id),
  CONSTRAINT chk_dso_required CHECK (required <= 500)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS duty_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  roster_id INT UNSIGNED NOT NULL,
  exam_date DATE NOT NULL,
  time_slot_id INT UNSIGNED NOT NULL,
  staff_id INT UNSIGNED NOT NULL,
  role ENUM('INVIGILATOR','RESERVE') NOT NULL DEFAULT 'INVIGILATOR',
  is_manual TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_duty_staff_slot (roster_id, exam_date, time_slot_id, staff_id),
  KEY ix_duty_slot (roster_id, exam_date, time_slot_id),
  KEY ix_duty_staff (staff_id),
  CONSTRAINT fk_da_roster FOREIGN KEY (roster_id) REFERENCES duty_rosters(id) ON DELETE CASCADE,
  CONSTRAINT fk_da_slot FOREIGN KEY (time_slot_id) REFERENCES time_slots(id),
  CONSTRAINT fk_da_staff FOREIGN KEY (staff_id) REFERENCES staff(id),
  CONSTRAINT fk_da_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_unavailability (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_id INT UNSIGNED NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  time_slot_id INT UNSIGNED NULL,
  reason VARCHAR(200) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_su_staff_dates (staff_id, date_from, date_to),
  CONSTRAINT fk_su_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_su_slot FOREIGN KEY (time_slot_id) REFERENCES time_slots(id),
  CONSTRAINT fk_su_user FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_su_dates CHECK (date_to >= date_from)
) ENGINE=InnoDB;
