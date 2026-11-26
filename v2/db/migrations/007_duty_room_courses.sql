-- 007_duty_room_courses.sql
-- Which papers are written in each room of the seating allotment, so duty letters can name the
-- course an invigilator supervises. Comma-separated course codes (e.g. "UCSE0O001T, IPHY1C02");
-- names are looked up from exam_entries of that date + session. Optional: NULL = not given.
-- Guarded by information_schema, so a re-run is safe.

SET @has_col = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'duty_rooms' AND column_name = 'course_codes');
SET @ddl = IF(@has_col = 0, 'ALTER TABLE duty_rooms ADD COLUMN course_codes VARCHAR(1000) NULL AFTER students', 'DO 0');
PREPARE add_course_codes FROM @ddl;
EXECUTE add_course_codes;
DEALLOCATE PREPARE add_course_codes;
