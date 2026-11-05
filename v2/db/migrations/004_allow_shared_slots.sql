-- 004_allow_shared_slots.sql
-- Allow more than one paper in the same date + time slot for a program/semester/exam type
-- (choice-based papers, e.g. B.A.-B.Ed. Semester 1 where students pick one of several Core papers).
-- The same-slot check was removed from the PHP code; this drops the matching unique key.
-- Idempotent: skips the DROP if uq_slot was already removed by hand.
-- The unique course-code rule (uq_course) is unchanged.

SET @has_uq_slot = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'exam_entries' AND index_name = 'uq_slot');
SET @ddl = IF(@has_uq_slot > 0, 'ALTER TABLE exam_entries DROP INDEX uq_slot', 'DO 0');
PREPARE drop_uq_slot FROM @ddl;
EXECUTE drop_uq_slot;
DEALLOCATE PREPARE drop_uq_slot;
