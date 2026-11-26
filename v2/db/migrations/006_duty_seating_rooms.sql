-- 006_duty_seating_rooms.sql
-- Room-wise invigilation from the day's seating allotment.
--
-- duty_rooms         the seating allotment of one date + time slot: room / class name and the
--                    number of students seated there (uploaded from Excel or typed in)
-- duty_rosters       room_threshold / per_room_small / per_room_large: a room with up to
--                    room_threshold students gets per_room_small teachers, more gets per_room_large
--                    (defaults 35 / 1 / 2)
-- duty_assignments   room_id: the room an invigilator is posted to (NULL for reserves and for
--                    slots that have no seating allotment yet)
--
-- A slot with seating needs the sum of its rooms' teachers. A slot without seating falls back to
-- the students-per-invigilator formula from 005.
-- Each ALTER checks information_schema first, so a re-run after a partial failure is safe.

CREATE TABLE IF NOT EXISTS duty_rooms (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  roster_id INT UNSIGNED NOT NULL,
  exam_date DATE NOT NULL,
  time_slot_id INT UNSIGNED NOT NULL,
  room VARCHAR(60) NOT NULL,
  students SMALLINT UNSIGNED NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_room_slot (roster_id, exam_date, time_slot_id, room),
  CONSTRAINT fk_dr_roster FOREIGN KEY (roster_id) REFERENCES duty_rosters(id) ON DELETE CASCADE,
  CONSTRAINT fk_dr_slot FOREIGN KEY (time_slot_id) REFERENCES time_slots(id),
  CONSTRAINT chk_dr_students CHECK (students BETWEEN 1 AND 1000)
) ENGINE=InnoDB;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'duty_rosters' AND column_name = 'room_threshold');
SET @ddl = IF(@has_col = 0, 'ALTER TABLE duty_rosters ADD COLUMN room_threshold SMALLINT UNSIGNED NOT NULL DEFAULT 35 AFTER max_per_day, ADD COLUMN per_room_small TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER room_threshold, ADD COLUMN per_room_large TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER per_room_small', 'DO 0');
PREPARE add_room_settings FROM @ddl;
EXECUTE add_room_settings;
DEALLOCATE PREPARE add_room_settings;

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'duty_assignments' AND column_name = 'room_id');
SET @ddl = IF(@has_col = 0, 'ALTER TABLE duty_assignments ADD COLUMN room_id BIGINT UNSIGNED NULL AFTER time_slot_id, ADD KEY ix_duty_room (room_id), ADD CONSTRAINT fk_da_room FOREIGN KEY (room_id) REFERENCES duty_rooms(id) ON DELETE SET NULL', 'DO 0');
PREPARE add_room_id FROM @ddl;
EXECUTE add_room_id;
DEALLOCATE PREPARE add_room_id;
