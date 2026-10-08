export type Role = 'DEPT_COORDINATOR' | 'EXAM_CELL';
export type ExamType = 'REGULAR' | 'REAPPEAR';
export type CycleStatus = 'OPEN' | 'LOCKED';

export interface Department {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
}

export interface Program {
  id: number;
  code: string;
  name: string;
  department_id: number;
  department_name?: string;
  total_semesters: number;
  is_active?: boolean;
}

export interface SubjectType {
  id: number;
  name: string;
  is_active?: boolean;
}

export interface TimeSlot {
  id: number;
  label: string;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

export interface AcademicSession {
  id: number;
  label: string;
  is_current: boolean;
}

export interface ExamCycle {
  id: number;
  academic_session_id: number;
  session_label?: string;
  title: string;
  month_year: string;
  start_date: string;
  end_date: string;
  status: CycleStatus;
}

export interface MetaResponse {
  departments: Department[];
  programs: Program[];
  subject_types: SubjectType[];
  time_slots: TimeSlot[];
  sessions: AcademicSession[];
  cycles: ExamCycle[];
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  department: { id: number; name: string; code: string } | null;
  must_change_password: boolean;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  department_id: number | null;
  department_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface ExamEntry {
  id: number;
  exam_cycle_id: number;
  department_id: number;
  department_name: string;
  department_code: string;
  program_id: number;
  program_name: string;
  program_code: string;
  semester: number;
  exam_type: ExamType;
  subject_type_id: number;
  subject_type_name: string;
  time_slot_id: number;
  time_slot_label: string;
  exam_date: string;
  course_code: string;
  course_name: string;
  student_count: number;
  cycle_title: string;
  cycle_month_year: string;
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
  exam_cycle_id: number;
  department_id?: number;
  program_id: number;
  semester: number;
  exam_type: ExamType;
  subject_type_id: number;
  time_slot_id: number;
  exam_date: string;
  course_code: string;
  course_name: string;
  student_count: number;
}

export interface Paged<T> {
  data: T[];
  meta: { total: number; page: number; page_size: number };
}

export interface DashboardStats {
  entries: number;
  programs_covered: number;
  next_exam_date: string | null;
  clashes_blocked_week: number;
  department_status?: Array<{
    id: number; name: string; code: string; groups_with_entries: number; last_updated: string | null;
  }>;
}

export interface DatesheetGroup {
  department_id: number;
  department_name: string;
  department_code: string;
  program_id: number;
  program_name: string;
  program_code: string;
  total_semesters: number;
  semester: number;
  course_count: number;
  first_date: string;
  last_date: string;
  last_updated: string;
  ref_no: string | null;
  issued_on: string | null;
}

export interface DayWiseSummaryRow {
  exam_date: string;
  weekday: string;
  time_slot_label: string;
  paper_count: number;
  total_students: number;
  departments: string[];
}

export interface AuditLogRow {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: unknown;
  ip: string | null;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  rows?: Array<{ row: number; field: string; message: string }>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>, rows?: Array<{ row: number; field: string; message: string }>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.rows = rows;
  }
}
