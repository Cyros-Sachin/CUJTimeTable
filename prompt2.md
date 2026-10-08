# CUJ Exam Date Sheet Automation — Build Prompt (PHP + MySQL + Docker)

> **How to use:** give this whole file to an AI coding assistant (or follow it yourself). It is a complete build specification: product, rules, database, API, UI, PDF/Excel output, Docker setup and acceptance tests.
>
> **Your role:** you are a senior full-stack engineer. Build the complete, production-quality project described below. Deliver working code with **no errors, no placeholders, no TODOs and no omitted files**. Follow the spec literally; where it says "exactly", copy it. If something is ambiguous, choose the simplest safe option and list it under "Assumptions" at the end of your reply.

---

## PART 1 — PROJECT SPECIFICATION (identical for both stacks)

### 1.1 What we are building
**CUJ Exam Date Sheet Automation System** for Central University of Jammu (CUJ).

- Every department's coordinator enters exam details (course, date, timing, etc.) for *Regular* and *Re-appear* examinations, either one by one through a form or in bulk through an Excel/CSV upload.
- The system automatically generates the **official date sheet PDF** for every Program + Semester + Exam type, in the exact CUJ format (letterhead, reference number, title, table, Controller of Examinations signature block, "To, The Head" block).
- The **Exam Cell Incharge** sees a **consolidated sheet of all departments**, can filter it, and can export an **overall Excel sheet**, an **overall PDF**, and a **ZIP of all department PDFs**.
- Clashes are blocked at entry time. Nothing invalid reaches the database.

### 1.2 Roles (confirmed)
| Role | Who | Can do |
|---|---|---|
| `DEPT_COORDINATOR` | One or more per department | Add / edit / delete / bulk-upload entries **only for own department**; preview and download own department's PDFs; change own password |
| `EXAM_CELL` | Exam cell incharge | Everything a coordinator can do **for any department**, plus: consolidated sheet, Excel/overall PDF/ZIP export, lock/unlock exam cycles, manage master data (departments, programs, time slots, subject types, sessions, cycles), manage users, view audit log |

Only these two roles exist. There is no student login and no Controller approval workflow.
The server must enforce the role and department scope on **every** request. Never trust a `department_id` sent by a coordinator; always use the one from their account.

### 1.3 Decisions and assumptions
**Confirmed by the owner**
1. Logins: department coordinators + exam cell incharge only.
2. Clash = same Program + same Semester + same Exam type + same Date + same Time slot, **inside the same exam cycle**. It must be **blocked with an error** (HTTP 409), never just warned.
3. Outputs: **PDF** (per Program-Semester date sheet and an overall PDF) and **Excel consolidated sheet**.

**Assumed (implement as written; easy to change later)**
- Subject Type list (seeded, editable by Exam Cell): Core, Discipline Specific Elective, Generic Elective, Open Elective, Skill Enhancement, Ability Enhancement, Value Added, Project/Dissertation.
- **No. of Students is internal.** It is stored and shown in the app, the consolidated grid, and the Excel export. It is **not** printed on the official PDF (the sample sheet does not show it).
- An extra field **Examination (Exam Cycle)** is added, e.g. "End Semester Examination – May, 2026". It provides the PDF title and the allowed date window. It is chosen right after Academic Session.
- **Exam Type** (Regular / Re-appear) is selected by the tabs on the Date Sheet screen and is stored on every entry.
- The circled numbers on the sample date sheet photo are ignored. The printed table uses the four columns shown in the sample: Date (with weekday), Course Code, Course Name, Time.

### 1.4 Entry form fields (order follows the sketch)
| # | Field | Control | Rules |
|---|---|---|---|
| 1 | Program Name | Dropdown | Filtered by the selected department. Required |
| 2 | Department Name | Dropdown | Coordinator: auto-selected and **locked**. Exam cell: choose. Changing it reloads Programs |
| 3 | Semester | Dropdown | 1 to the program's `total_semesters`. Required |
| 4 | Subject Type | Dropdown | From `subject_types`. Required |
| 5 | Timing | Dropdown | From `time_slots` (e.g. `2:00PM-5:00PM`). Required |
| 6 | Date | Calendar picker | Must lie within the exam cycle's `start_date`..`end_date`. Weekday shown live beside the field. Display format `DD-MM-YYYY` |
| 7 | Course Code | Text | Trim, uppercase, regex `^[A-Z0-9][A-Z0-9\-_/ ]{2,29}$`. Examples: `MBIO1C004T`, `UMBIO1O006T`, `BCC3C102` |
| 8 | Course Name | Text | Trim, 2–200 chars. Example: `Genetics`, `C++` |
| 9 | No. of Students | Number | Integer 1–5000 |
| 10 | Academic Session | Dropdown | From `academic_sessions`, default = current (e.g. `2025-26`) |
| 11 | Examination | Dropdown (added) | Cycles of the selected session, status must be `OPEN` for coordinators |

Hidden/derived: `exam_type` (from the Regular / Re-appear tab), `created_by`, timestamps.

### 1.5 Business rules (all enforced **on the server**, mirrored in the UI)
1. **Clash block:** reject if another entry exists with the same `(exam_cycle_id, program_id, semester, exam_type, exam_date, time_slot_id)`. The database also has a UNIQUE key as the final guard. Map the duplicate-key error to the same 409 response. Error text: `Clash: <Program> Semester <n> (<Regular|Re-appear>) already has "<course>" on <DD-MM-YYYY> at <slot>.`
2. **Duplicate course:** the same `course_code` cannot appear twice for the same `(exam_cycle_id, program_id, semester, exam_type)`. Respond 409 `DUPLICATE_COURSE`.
3. **Date window:** `exam_date` must be within the cycle window, otherwise 422.
4. **Department/program match:** `program.department_id` must equal the entry's department, otherwise 422.
5. **Semester range:** `1 <= semester <= program.total_semesters`.
6. **Locked cycle:** if `exam_cycles.status = 'LOCKED'`, coordinators get 403 `CYCLE_LOCKED` on create/update/delete/upload. Exam cell may still edit.
7. **Edits** re-run all of the above, excluding the entry itself.
8. **Reference number** (`CUJ/Exam/Datesheet/<YYYY>/<seq>`, e.g. `CUJ/Exam/Datesheet/2026/3197`) is created the **first time** a PDF is generated for a `(cycle, program, semester, exam_type)` and then stays the same on every re-download. `<seq>` is a running counter per year starting from `REF_SEQ_START` (env, default 3000), allocated inside a transaction with `SELECT ... FOR UPDATE` so concurrent requests never get the same number. The **issue date** stored is the generation date and is also fixed after first generation.
9. **Sorting:** the date sheet rows are sorted by date, then time slot start.
10. All dates are stored as `DATE`; all times come from `time_slots`. Timezone is `Asia/Kolkata` everywhere (database, app, containers).
11. Every create / update / delete / upload / login / export writes an `audit_logs` row.

### 1.6 Database schema (MySQL 8.0, utf8mb4) — use this exactly in `db/schema.sql`
```sql
CREATE DATABASE IF NOT EXISTS cuj_datesheet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cuj_datesheet;
SET NAMES utf8mb4;

CREATE TABLE departments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20)  NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL UNIQUE,            -- printed in "To, The Head, <name>"
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE programs (
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

CREATE TABLE subject_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE time_slots (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(30) NOT NULL UNIQUE,            -- printed as is, e.g. 2:00PM-5:00PM
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE academic_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(20) NOT NULL UNIQUE,            -- 2025-26
  is_current TINYINT(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE exam_cycles (
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

CREATE TABLE users (
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

CREATE TABLE exam_entries (
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

CREATE TABLE datesheet_refs (
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

CREATE TABLE audit_logs (
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

CREATE TABLE settings (
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
```
Users are **not** seeded in SQL (passwords must be hashed by the app). The app's seed script creates, if no user exists: one `EXAM_CELL` user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (env) with `must_change_password = 1`, plus one demo coordinator for each seeded department when `SEED_DEMO_USERS=true`.

### 1.7 API contract (JSON, base path `/api`, same in both stacks)
Success: `200/201` with `{ "data": ... }`. Error: `{ "error": { "code": "CLASH", "message": "...", "fields": { "exam_date": "..." } } }`.
Status codes: 400 malformed, 401 not logged in, 403 not allowed, 404 not found, 409 clash/duplicate, 422 validation, 429 rate limit, 500 unexpected (generic message, details only in server log).

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | `{email,password}` → sets session cookie, returns user |
| POST | `/auth/logout` | any | clears session |
| GET | `/auth/me` | any | current user (+ department) |
| POST | `/auth/change-password` | any | `{current_password,new_password}`; min 10 chars, 1 letter + 1 digit |
| GET | `/meta` | any | departments, programs, subject types, time slots, sessions, cycles (coordinator gets only own department and its programs) |
| GET | `/dashboard/stats` | any | counts (entries, programs covered, upcoming exam dates), per-department submission status for exam cell |
| GET | `/entries` | any | list; query: `cycle_id, exam_type, department_id, program_id, semester, date_from, date_to, q, page, page_size(≤100), sort` |
| POST | `/entries` | any | create (all rules in 1.5) |
| PUT | `/entries/:id` | any | update |
| DELETE | `/entries/:id` | any | delete |
| POST | `/entries/check-clash` | any | dry run, same body as create, returns `{ok:true}` or the 409 error |
| GET | `/entries/template` | any | download Excel template (`?exam_type=REGULAR|REAPPEAR`) with dropdown validations and one sample row |
| POST | `/entries/bulk-upload` | any | multipart: `file` (.xlsx/.csv, ≤5 MB, ≤1000 rows), `exam_cycle_id`, `exam_type`, `dry_run=true|false` |
| GET | `/datesheets` | any | list of Program+Semester groups for a cycle and exam type: course count, first/last date, ref no (if issued), last updated |
| GET | `/datesheets/pdf` | any | `?cycle_id&program_id&semester&exam_type[&download=1]` → official PDF (inline preview or attachment) |
| GET | `/consolidated` | EXAM_CELL | all-department rows + day-wise summary, same filters as `/entries` |
| GET | `/consolidated/excel` | EXAM_CELL | overall Excel workbook |
| GET | `/consolidated/pdf` | EXAM_CELL | overall PDF (A4 landscape) |
| GET | `/consolidated/zip` | EXAM_CELL | ZIP of every Program-Semester PDF of the cycle (folder per department) |
| CRUD | `/admin/departments`, `/admin/programs`, `/admin/subject-types`, `/admin/time-slots`, `/admin/sessions`, `/admin/cycles` | EXAM_CELL | master data; `PATCH /admin/cycles/:id/status` with `{status}` locks/unlocks. Deactivate instead of delete when referenced |
| CRUD | `/admin/users` (+ `POST /admin/users/:id/reset-password`) | EXAM_CELL | create coordinators, activate/deactivate, reset password |
| GET | `/admin/audit-logs` | EXAM_CELL | paged audit log |
| GET | `/health` | public | `{status:"ok"}` after a DB ping (used by Docker healthchecks) |

**Bulk upload behaviour**
- Required header row (exact, case-insensitive): `Program, Semester, Subject Type, Date, Time Slot, Course Code, Course Name, No. of Students`. Department comes from the logged-in coordinator; the exam cell must pick the department in the upload dialog (`department_id` form field).
- `Date` accepts a real Excel date or text `DD-MM-YYYY`. `Program` matches name or code. `Time Slot` matches the label. `Subject Type` matches name.
- Validate **every row** with the same rules as single entry, plus clashes **inside the file** and against the database.
- **All-or-nothing:** if any row fails, nothing is saved. Respond 422 with `{error:{code:"UPLOAD_INVALID", rows:[{row:7, field:"exam_date", message:"..."}]}}` and the UI shows a scrollable error table with the Excel row numbers.
- `dry_run=true` returns `{valid:n, rows:[...parsed preview...]}` without saving. Real insert runs inside one DB transaction.

### 1.8 Official date sheet PDF (must replicate the sample)
A4 portrait, margins about 18 mm, serif body font, black text on white.
1. **Letterhead** (centre): optional logo from `settings.logo_path` at left; line 1 Hindi `जम्मू केंद्रीय विश्वविद्यालय` (large, bold); line 2 `Central University of Jammu` (large, bold); line 3 Hindi `राया-सूचानी (बागला)-181143, सांबा, जम्मू (जम्मू और कश्मीर)`; line 4 `Rahya-Suchani (Bagla), Samba-181143, Jammu`; thin horizontal rule.
2. Reference row: left `CUJ/Exam/Datesheet/2026/3197` (the stored `ref_no`), right issue date formatted `21 April, 2026`.
3. Title (centre, bold, underlined): `DATE SHEET FOR END SEMESTER EXAMINATION - May, 2026` = `"DATE SHEET FOR " + UPPER(cycle.title) + " - " + cycle.month_year`.
4. Department line (centre, bold, underlined, uppercase): `CENTRE FOR MOLECULAR BIOLOGY`.
5. Program line (centre, bold, underlined): `M.Sc. Biotechnology SEMESTER-II (REAPPEAR)`. Semester is a roman numeral. Add ` (REAPPEAR)` only for Re-appear sheets; Regular sheets have no tag.
6. Table with full black borders, 4 columns, header row bold and centred: **Date | Course Code | Courses Name | Time**
   - Date cell: `11-05-2026` and, on the second line, `(Monday)`.
   - Course Code cell: in parentheses, e.g. `(MBIO1C004T)`.
   - Course name centred; Time like `2:00PM-5:00PM`.
   - Rows sorted by date then slot. Table never splits a row across pages; repeat header on page break.
7. Signature block at the lower right: optional signature image (`settings.signature_path`), then `Controller of Examinations` (from settings, plus the controller name above it when set).
8. At the lower left: `To` then **`The Head,`** `<department name>` (e.g. `The Head, Centre for Molecular Biology`).
9. Hindi must render with correct conjuncts (test word: `विश्वविद्यालय`). If it renders as broken glyphs the build is **not** accepted.
10. File name: `Datesheet_<DEPTCODE>_<PROGRAMCODE>_Sem<n>_<Regular|Reappear>_<cycle-month-year>.pdf`.

**Overall PDF** (`/consolidated/pdf`): A4 landscape, same letterhead and title (without a department line), a table sorted by date → slot → department with columns `S.No | Date (Day) | Time | Department | Program | Sem | Type | Course Code | Course Name | Students`, plus a total row per date. Page numbers in the footer (`Page x of y`).

### 1.9 Consolidated Excel workbook
File name `CUJ_Consolidated_Datesheet_<cycle>.xlsx`. Dates are real Excel dates formatted `DD-MM-YYYY`. Header row bold on a dark-blue fill with white text, frozen, with autofilter, sensible column widths, thin borders.
1. **Consolidated**: `S.No, Date, Day, Time, Department, Program, Semester, Exam Type, Subject Type, Course Code, Course Name, No. of Students`, sorted by date → slot → department.
2. **Day-wise Summary**: `Date, Day, Time, No. of Papers, Total Students, Departments Involved`.
3. **One sheet per department** with its own rows (sheet names ≤31 chars, invalid characters removed).
Respect the same filters as the on-screen consolidated view.

### 1.10 UI / UX specification
**Design language:** clean, official, calm. Light theme.
- Colours: primary `#1E3A8A`, primary-soft `#E0E7FF`, accent `#B45309`, success `#15803D`, danger `#B91C1C`, page background `#F5F7FB`, surface `#FFFFFF`, border `#E2E8F0`, text `#0F172A`, muted `#64748B`.
- Fonts: Inter for UI (fallback system-ui), Noto Sans Devanagari for Hindi, serif only inside the PDF preview. Base 15 px, 8-px spacing grid, radius 10 px, subtle shadows.
- Chips: Regular = blue, Re-appear = amber, Locked = grey with a lock icon.
- Layout: left sidebar (logo, nav, user card) + top bar (page title, exam-cycle selector, user menu). Sidebar collapses to a drawer below 992 px. Everything works on 360 px wide screens; tables scroll horizontally inside their own container.
- Every screen has loading skeletons, empty states with a clear next action, inline field errors, toast messages for success/failure, confirm dialogs for delete, and keyboard-accessible controls with visible focus (WCAG AA contrast).

**Screens**
1. **Login** — centred card, university name in English and Hindi, email + password, show/hide password, error message, forced password change screen when `must_change_password`.
2. **Dashboard** — stat cards (entries, programs covered, next exam date, clashes blocked this week). Exam cell also sees a department status table (department, programs with entries, last updated, locked/open). Quick links: *Add entry*, *Upload table*, *Open date sheets*.
3. **Add / Edit Entry** — the 11 fields from 1.4 in a 2-column grid, in the sketch order. Live weekday label next to Date. Inline clash check on Date/Timing change (calls `/entries/check-clash`) with a red message. Buttons *Save*, *Save & add another*, *Reset*. A side panel lists the entries already added for the selected Program + Semester so the user sees what exists.
4. **Date Sheet** — header with segmented control **Regular | Re-appear**. Below it: filter row (department, program, semester), a table of the courses (date, day, time, code, name, subject type, students, edit/delete icons), a **Table upload** card (drag-and-drop, *Download template*, *Validate only*, *Upload*), and a **Preview PDF / Download PDF** button per Program-Semester group, showing the reference number once issued. The PDF preview opens in a modal with an embedded viewer.
5. **Consolidated** (exam cell only) — filters (cycle, exam type, department, program, semester, date range, search). Two views: **List** (sortable, paged) and **Calendar grid** (rows = dates with weekday, columns = time slots, each cell shows department + program + course chips; a day total of papers and students). Buttons: *Export Excel*, *Overall PDF*, *Download all PDFs (ZIP)*.
6. **Admin** (exam cell only) — tabs: Departments, Programs, Time Slots, Subject Types, Sessions & Cycles (with a lock switch), Users, Letterhead & Signature (uploads for logo and signature, controller name), Audit Log.

## PART 2 — STACK: PHP 8.3 + MySQL 8 + Docker

### 2.1 Technology (pin these)
- PHP **8.3** on Apache (`php:8.3-apache`), extensions `pdo_mysql, mysqli, gd, zip, mbstring, intl, bcmath, opcache`.
- MySQL **8.0**. Access only through **PDO** with `ATTR_EMULATE_PREPARES=false`, `ERRMODE_EXCEPTION`, `FETCH_ASSOC`, charset `utf8mb4`, and `SET time_zone='+05:30'` on connect.
- Composer packages (commit `composer.lock`): `mpdf/mpdf ^8.2` (PDF, supports Devanagari shaping) and `phpoffice/phpspreadsheet ^2.3` (Excel read/write). No framework: a small hand-written MVC-lite (router, controllers, services, view templates). No other runtime dependencies.
- UI: server-rendered PHP templates + **Bootstrap 5.3.3**, **Bootstrap Icons 1.11.3**, **Flatpickr 4.6.13** (calendar), vanilla ES-module JavaScript calling the `/api/*` JSON endpoints with `fetch`. Load them from jsDelivr with pinned versions; put the same files under `public/assets/vendor/` as a documented offline fallback.

### 2.2 Folder structure (create exactly)
```
cuj-datesheet-php/
├─ docker-compose.yml
├─ Dockerfile
├─ .env.example   .gitignore   .dockerignore   README.md
├─ composer.json  composer.lock
├─ docker/ entrypoint.sh  php.ini
├─ db/ schema.sql                      # section 1.6, mounted into MySQL init
├─ bin/ seed.php                       # waits for DB, creates users/settings, idempotent
├─ public/                             # Apache DocumentRoot
│  ├─ index.php  .htaccess             # front controller
│  └─ assets/ css/app.css  js/{api.js,entry-form.js,datesheet.js,consolidated.js,admin.js,ui.js}  img/
├─ src/
│  ├─ bootstrap.php  routes.php
│  ├─ Core/ Router.php Request.php Response.php Db.php Session.php Auth.php Csrf.php Validator.php HttpException.php View.php
│  ├─ Controllers/ AuthController.php MetaController.php DashboardController.php EntryController.php
│  │               UploadController.php DateSheetController.php ConsolidatedController.php AdminController.php PageController.php
│  └─ Services/ EntryService.php ClashService.php RefNumberService.php PdfService.php ExcelService.php
│                UploadService.php AuditService.php
├─ views/ layout.php login.php dashboard.php entry-form.php datesheet.php consolidated.php admin.php
│          pdf/datesheet.php pdf/overall.php partials/{sidebar,topbar,flash}.php
├─ resources/fonts/                    # Noto Sans Devanagari copied here at image build
└─ storage/ tmp pdf uploads sessions branding   # Docker volume, writable by www-data
```

### 2.3 Docker files (write exactly; adjust only if you find an error)
**Dockerfile**
```dockerfile
FROM php:8.3-apache
RUN apt-get update && apt-get install -y --no-install-recommends \
      libzip-dev libpng-dev libjpeg-dev libfreetype6-dev libonig-dev libicu-dev unzip git fonts-noto-core \
 && docker-php-ext-configure gd --with-freetype --with-jpeg \
 && docker-php-ext-install -j"$(nproc)" pdo_mysql mysqli gd zip mbstring intl bcmath opcache \
 && a2enmod rewrite headers \
 && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
 && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-app.ini
WORKDIR /var/www/html
COPY composer.json composer.lock* ./
RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts
COPY . .
RUN composer dump-autoload --optimize --no-dev \
 && mkdir -p resources/fonts storage/tmp storage/pdf storage/uploads storage/sessions storage/branding \
 && cp /usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf /usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf resources/fonts/ \
 && test -f resources/fonts/NotoSansDevanagari-Regular.ttf && test -f resources/fonts/NotoSansDevanagari-Bold.ttf \
 && chown -R www-data:www-data storage && chmod +x docker/entrypoint.sh
ENTRYPOINT ["/var/www/html/docker/entrypoint.sh"]
CMD ["apache2-foreground"]
```
The build must **fail loudly** if the Devanagari fonts are missing (the `test -f` lines). If the font path differs in the base image, find it with `fc-list | grep -i devanagari` and fix the path instead of removing the check.

**docker/entrypoint.sh**
```sh
#!/bin/sh
set -e
mkdir -p storage/tmp storage/pdf storage/uploads storage/sessions storage/branding
chown -R www-data:www-data storage
php bin/seed.php
exec "$@"
```
**docker/php.ini**
```ini
date.timezone = Asia/Kolkata
display_errors = Off
log_errors = On
error_log = /proc/self/fd/2
expose_php = Off
memory_limit = 256M
upload_max_filesize = 6M
post_max_size = 8M
max_execution_time = 120
session.save_path = /var/www/html/storage/sessions
session.use_strict_mode = 1
session.cookie_httponly = 1
session.cookie_samesite = Strict
session.gc_maxlifetime = 28800
opcache.enable = 1
```
**public/.htaccess**
```apache
Options -Indexes
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.php [L,QSA]
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "SAMEORIGIN"
Header always set Referrer-Policy "same-origin"
```
**docker-compose.yml**
```yaml
name: cuj-datesheet-php
services:
  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASSWORD}
      TZ: Asia/Kolkata
    command: ["--character-set-server=utf8mb4", "--collation-server=utf8mb4_unicode_ci", "--default-time-zone=+05:30"]
    volumes:
      - db_data:/var/lib/mysql
      - ./db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u root -p$$MYSQL_ROOT_PASSWORD --silent"]
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 20s
  app:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    environment:
      DB_HOST: db
      TZ: Asia/Kolkata
    ports:
      - "${APP_PORT:-8080}:80"
    volumes:
      - app_storage:/var/www/html/storage
  phpmyadmin:
    image: phpmyadmin:5
    profiles: ["tools"]
    environment:
      PMA_HOST: db
    ports:
      - "8081:80"
    depends_on:
      db:
        condition: service_healthy
volumes:
  db_data:
  app_storage:
```
**.env.example**
```
APP_PORT=8080
APP_ENV=production
APP_URL=http://localhost:8080
COOKIE_SECURE=false
DB_HOST=db
DB_PORT=3306
DB_NAME=cuj_datesheet
DB_USER=cuj_app
DB_PASSWORD=change_me_app_password
DB_ROOT_PASSWORD=change_me_root_password
ADMIN_NAME=Exam Cell Incharge
ADMIN_EMAIL=examcell@cuj.local
ADMIN_PASSWORD=ChangeMe#12345
SEED_DEMO_USERS=true
REF_SEQ_START=3000
```
`DB_NAME` must stay `cuj_datesheet` because `schema.sql` creates and selects that database (say so in the README).

### 2.4 Implementation instructions
**Bootstrap & routing**
- `public/index.php` loads `src/bootstrap.php` (autoload, session with the cookie flags above and `Secure` when `COOKIE_SECURE=true`, global `set_exception_handler` / `set_error_handler`, `Asia/Kolkata`), then dispatches via `Router` using `src/routes.php`.
- Page routes (HTML): `/` (redirect), `/login`, `/dashboard`, `/entries/new`, `/entries/{id}/edit`, `/datesheets`, `/consolidated` (EXAM_CELL), `/admin` (EXAM_CELL), `/logout`. Unauthenticated page request → 302 to `/login`; wrong role → 403 page.
- API routes: every endpoint of section 1.7 under `/api`. API responses always `Content-Type: application/json; charset=utf-8`, `JSON_UNESCAPED_UNICODE`. A global handler converts `HttpException(status, code, message, fields)` into the error format, logs unexpected exceptions with `error_log`, and returns a generic 500 message.
- **CSRF:** a random token in the session, printed in `<meta name="csrf-token">`; `api.js` sends it as `X-CSRF-Token` for POST/PUT/PATCH/DELETE (including login); the server checks with `hash_equals`. Regenerate the session id on login.
- **Auth:** `password_hash(PASSWORD_DEFAULT)` / `password_verify`; login throttle table or session+IP counter (10 attempts / 15 min), generic message `Invalid email or password`; inactive users cannot log in; when `must_change_password=1` every API except `/auth/*` and `/health` returns 403 `PASSWORD_CHANGE_REQUIRED`.
- **Validation:** a `Validator` class producing `fields` errors for every endpoint; all SQL uses prepared statements with **distinct** named placeholders (never reuse the same name twice).

**Clash and duplicate check (EntryService)** — run inside a transaction on create/update, and catch `PDOException` code `23000` to translate DB duplicate-key errors into 409 as the final guard:
```php
$st = $pdo->prepare(
 "SELECT e.id, e.course_name, ts.label FROM exam_entries e
  JOIN time_slots ts ON ts.id = e.time_slot_id
  WHERE e.exam_cycle_id = :cycle AND e.program_id = :prog AND e.semester = :sem
    AND e.exam_type = :type AND e.exam_date = :dt AND e.time_slot_id = :slot
    AND e.id <> :self LIMIT 1 FOR UPDATE");
$st->execute([...,'self' => $excludeId ?? 0]);
```
**Reference number (RefNumberService)**
```php
$pdo->beginTransaction();
// 1. SELECT * FROM datesheet_refs WHERE exam_cycle_id=? AND program_id=? AND semester=? AND exam_type=? FOR UPDATE  -> return if found
// 2. $year = (int) date('Y'); SELECT COALESCE(MAX(ref_seq),0) FROM datesheet_refs WHERE ref_year=:y FOR UPDATE
// 3. $seq = max($max + 1, (int) getenv('REF_SEQ_START')); $refNo = "CUJ/Exam/Datesheet/$year/$seq";
// 4. INSERT with issued_on = CURDATE(); commit. On duplicate key (23000) roll back and retry once.
```
**PDF (PdfService, mPDF)**
```php
$d = (new \Mpdf\Config\ConfigVariables())->getDefaults();
$f = (new \Mpdf\Config\FontVariables())->getDefaults();
$mpdf = new \Mpdf\Mpdf([
  'mode' => 'utf-8', 'format' => 'A4',               // 'A4-L' for the overall PDF
  'margin_left' => 18, 'margin_right' => 18, 'margin_top' => 16, 'margin_bottom' => 16,
  'tempDir' => $root.'/storage/tmp',
  'fontDir' => array_merge($d['fontDir'], [$root.'/resources/fonts']),
  'fontdata' => $f['fontdata'] + ['notosansdevanagari' => [
      'R' => 'NotoSansDevanagari-Regular.ttf', 'B' => 'NotoSansDevanagari-Bold.ttf', 'useOTL' => 0xFF]],
  'default_font' => 'dejavuserif',
]);
```
Hindi text goes inside `<span style="font-family:notosansdevanagari">…</span>`. Build the HTML from `views/pdf/datesheet.php` with inline CSS only (mPDF has limited CSS: use tables for layout, `border-collapse: collapse`, `page-break-inside: avoid` on rows, `<thead>` for repeated headers). Send `Cache-Control: no-store`, `Content-Type: application/pdf`, and `Content-Disposition: inline|attachment; filename="…"`. Clean the output buffer before streaming.

**Excel (ExcelService, PhpSpreadsheet)**
- Write dates with `Date::PHPToExcel($dateTime)` and number format `dd-mm-yyyy`; style, freeze, autofilter as in 1.9; sanitize sheet names (`[]:*?/\` removed, ≤31 chars, unique).
- Template download: sheet `Entries` with the header row, one sample row, data-validation dropdowns for Program, Subject Type, Time Slot and Semester fed from a hidden sheet `Lists`.
- Stream with correct headers after `while (ob_get_level()) ob_end_clean();`.
**Upload (UploadService)**
- Check extension (`xlsx|csv`), size ≤ 5 MB, real MIME via `finfo`, and for `.xlsx` the ZIP signature `PK`. Use `IOFactory::createReaderForFile` with `setReadDataOnly(true)`; for CSV auto-detect `,` / `;` and strip the UTF-8 BOM. Reject more than 1000 data rows. Skip fully empty rows. Convert Excel serial dates with `Date::excelToDateTimeObject`; parse text dates strictly with `DateTime::createFromFormat('!d-m-Y')` and verify `getLastErrors()` is clean. Never store the uploaded file permanently (delete the temp file in a `finally`).

**Front-end behaviour (vanilla JS)**
- `api.js`: `fetch` wrapper that adds the CSRF header, parses the JSON error format, throws typed errors, and redirects to `/login` on 401.
- `entry-form.js`: loads `/api/meta` once; Department change reloads Programs; Program change rebuilds the Semester list; Flatpickr restricted to the selected cycle's window with `dateFormat: "d-m-Y"` and a live weekday label; debounced clash check; disables Save while submitting; maps `fields` errors under each control.
- `datesheet.js`: Regular/Re-appear tabs (URL keeps `?type=`), table, upload card with dry-run results, PDF preview modal using `<iframe>` with the inline PDF URL.
- `consolidated.js`: filters, list view, calendar-grid view, export buttons (plain links with the current filters in the query string).
- Escape all dynamic text (`textContent`, never raw `innerHTML` with data).

### 2.5 Build order for you (the AI builder)
1. `docker-compose.yml`, `Dockerfile`, `docker/*`, `.env.example`, `db/schema.sql`, `composer.json`.
2. Core classes, auth, meta, health. 3. Entry CRUD + clash/duplicate rules + audit. 4. Upload + template. 5. PDF + reference numbers. 6. Consolidated + Excel + overall PDF + ZIP. 7. Admin screens. 8. UI templates, CSS, JS. 9. README. 10. Self-review against Part 3.

### 2.6 Output format
First print the complete file tree. Then print **every file in full**, each preceded by a heading with its path and in a fenced code block with the right language. Do not abbreviate, do not write "rest remains the same". After the files, print the exact commands to run:
```
cp .env.example .env
docker compose up --build -d
# open http://localhost:8080  (login with ADMIN_EMAIL / ADMIN_PASSWORD from .env)
```


## PART 3 — ACCEPTANCE TESTS AND DEFINITION OF DONE

### 3.1 Sample data used in tests (from the real CUJ sheet)
Cycle `End Semester Examination – May, 2026`, Department `Centre for Molecular Biology`, Program `M.Sc. Biotechnology`, Semester 2, Exam type **Re-appear**, slot `2:00PM-5:00PM`:

| Date | Code | Course |
|---|---|---|
| 11-05-2026 (Monday) | MBIO1C004T | Genetics |
| 13-05-2026 (Wednesday) | MBIO1C006T | Genetic Engineering |
| 15-05-2026 (Friday) | MBIO1C005T | Bioinformatics |
| 18-05-2026 (Monday) | UMBIO1O006T | Enzyme Technology |
| 20-05-2026 (Wednesday) | UMBIO1O016T | Microbial Technology |

### 3.2 Must-pass checks
1. `docker compose up --build` on a clean machine starts all services with **no manual step**, and `GET /api/health` returns ok. Re-running `docker compose up` does not duplicate seed data. `docker compose down -v` followed by `up` rebuilds the database from scratch.
2. Login as the seeded exam cell user, change the forced password, create a coordinator for *Centre for Molecular Biology*.
3. Login as that coordinator: the Department field is locked, only its programs appear, and `/api/consolidated` returns 403.
4. Enter the five sample rows. The generated PDF matches section 1.8 (Hindi renders correctly, `(REAPPEAR)` tag, weekday under each date, codes in parentheses, signature block, "To, The Head" block). Download it twice: the **reference number and issue date are identical** both times.
5. Try to add a **sixth** row for the same program, semester, type, date `11-05-2026` and slot `2:00PM-5:00PM` → blocked with 409 and the exact clash message. A different slot on the same date is accepted.
6. Try a duplicate course code → 409 `DUPLICATE_COURSE`. Try a date of `01-06-2026` → 422 (outside the cycle window). Try semester 5 on a 4-semester program → 422.
7. Upload a file with 10 good rows and 1 clashing row → nothing saved, the UI lists the failing Excel row number. Fix the file → upload succeeds. Dry run saves nothing.
8. Lock the cycle as exam cell → the coordinator gets 403 `CYCLE_LOCKED` on create, edit, delete and upload; the exam cell can still edit.
9. As coordinator, call another department's entry id (`PUT /api/entries/<id>`) → 403/404. Send a forged `department_id` in the body → ignored.
10. Consolidated view shows both departments; Excel opens without a repair warning, has real dates, three kinds of sheets (Consolidated, Day-wise Summary, one per department); the ZIP contains one PDF per Program-Semester-Type; the overall PDF is landscape with page numbers.
11. SQL injection strings (`' OR 1=1 --`), `<script>` in Course Name, a 5 MB+ upload, a `.exe` renamed to `.xlsx` → all rejected safely, and output is HTML-escaped.
12. Mobile width 360 px: no horizontal page scroll, forms usable, tables scroll inside their container.

### 3.3 Definition of done
- No placeholder text, no `TODO`, no unimplemented endpoint, no unused dead code.
- The app starts with zero console errors and zero server errors during checks 1–12.
- Every endpoint in 1.7 exists and behaves as specified.
- Secrets only in `.env` (never committed); `.env.example` is complete; `.gitignore` and `.dockerignore` exist.
- `README.md` contains: prerequisites, 3-step quick start, default login, env variable table, how to back up/restore the database (`mysqldump` command), how to change ports, how to rebuild, troubleshooting (port busy, DB not ready, Hindi font missing).
- Passwords hashed (bcrypt cost ≥ 10 or Argon2), login rate-limited (e.g. 10 attempts / 15 min / IP), secure session cookie flags, security headers, prepared statements everywhere, server-side validation for every input, uploaded files never executed and stored outside the web root.
- Before replying with the final answer, **mentally run checks 1–12 against the code you wrote and fix every defect you find.**