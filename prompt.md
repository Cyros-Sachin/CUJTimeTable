# CUJ Exam Date Sheet Automation — Build Prompt (React + Node.js + MySQL + Docker)

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

## PART 2 — STACK: React + Node.js + MySQL 8 + Docker

### 2.1 Technology (pin major versions, commit lock files)
**Server** (`server/`, Node **20 LTS**, ES modules, plain JavaScript): `express ^4.19`, `mysql2 ^3.11` (promise pool), `zod ^3.23`, `jsonwebtoken ^9`, `bcryptjs ^2.4` (pure JS, no native build), `cookie-parser`, `helmet ^7`, `express-rate-limit ^7`, `multer ^1.4.5-lts.1` (memory storage), `exceljs ^4.4` (Excel read/write incl. CSV), `puppeteer-core ^23` with system Chromium (PDF), `archiver ^7` (ZIP), `pino` + `pino-http`.
**Client** (`client/`, **React 18 + TypeScript (strict) + Vite 5**): `react-router-dom ^6`, `@tanstack/react-query ^5`, `react-hook-form ^7` + `zod` + `@hookform/resolvers`, `tailwindcss ^3.4`, `lucide-react`, `react-hot-toast`, `react-day-picker ^8` (calendar), `date-fns ^3`, `clsx`.
**Infra**: MySQL 8.0, Docker Compose with three services `db`, `api`, `web` (nginx serves the built SPA and proxies `/api` to the API).
`npm run build` in the client must be `tsc --noEmit && vite build` and must pass with **zero** type errors.

### 2.2 Folder structure (create exactly)
```
cuj-datesheet-node/
├─ docker-compose.yml  .env.example  .gitignore  .dockerignore  README.md
├─ db/ schema.sql                                   # section 1.6
├─ server/
│  ├─ Dockerfile  package.json  package-lock.json
│  └─ src/
│     ├─ server.js  app.js  config.js  db.js  logger.js
│     ├─ middleware/ auth.js csrf.js rbac.js validate.js errors.js limits.js upload.js
│     ├─ routes/ index.js auth.js meta.js dashboard.js entries.js datesheets.js consolidated.js admin.js
│     ├─ services/ entryService.js clashService.js refService.js pdfService.js excelService.js
│     │            uploadService.js auditService.js seedService.js
│     ├─ templates/ datesheetHtml.js overallHtml.js    # functions returning HTML strings for PDFs
│     └─ utils/ httpError.js dates.js roman.js
├─ client/
│  ├─ Dockerfile  nginx.conf  package.json  package-lock.json  index.html
│  ├─ vite.config.ts  tsconfig.json  tailwind.config.js  postcss.config.js
│  └─ src/
│     ├─ main.tsx  App.tsx  index.css
│     ├─ api/ client.ts  types.ts  queries.ts
│     ├─ auth/ AuthContext.tsx  RequireAuth.tsx
│     ├─ components/ layout/{AppShell,Sidebar,Topbar}.tsx
│     │   ui/{Button,Field,Input,Select,DatePicker,Modal,ConfirmDialog,Chip,Tabs,Skeleton,EmptyState,DataTable,Pagination}.tsx
│     │   PdfPreviewModal.tsx  UploadCard.tsx  CalendarGrid.tsx  CycleSelect.tsx
│     ├─ pages/ Login.tsx ChangePassword.tsx Dashboard.tsx EntryForm.tsx DateSheet.tsx Consolidated.tsx NotFound.tsx
│     │   admin/{AdminLayout,Departments,Programs,TimeSlots,SubjectTypes,SessionsCycles,Users,Branding,AuditLog}.tsx
│     └─ lib/ format.ts constants.ts
```

### 2.3 Docker files (write exactly; fix only genuine errors)
**docker-compose.yml**
```yaml
name: cuj-datesheet-node
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
  api:
    build: ./server
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    environment:
      DB_HOST: db
      PORT: "4000"
      TZ: Asia/Kolkata
    volumes:
      - api_storage:/app/storage
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s
  web:
    build: ./client
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "${APP_PORT:-8080}:80"
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
  api_storage:
```
**server/Dockerfile**
```dockerfile
FROM node:20-bookworm-slim
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-noto-core fonts-liberation tini ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && fc-list | grep -qi "Noto Sans Devanagari" && fc-list | grep -qi "Liberation Serif"
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
RUN mkdir -p /app/storage/branding /app/storage/tmp && chown -R node:node /app
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
```
The `fc-list | grep` checks make the build **fail** if the Hindi or serif fonts are missing.

**client/Dockerfile**
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY . .
RUN npm run build
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```
**client/nginx.conf**
```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  client_max_body_size 6m;
  add_header X-Content-Type-Options nosniff always;
  add_header X-Frame-Options SAMEORIGIN always;
  location /api/ {
    proxy_pass http://api:4000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;
  }
  location /assets/ { expires 7d; add_header Cache-Control "public, immutable"; try_files $uri =404; }
  location / { try_files $uri /index.html; }
}
```
**.env.example**
```
APP_PORT=8080
NODE_ENV=production
COOKIE_SECURE=false
DB_HOST=db
DB_PORT=3306
DB_NAME=cuj_datesheet
DB_USER=cuj_app
DB_PASSWORD=change_me_app_password
DB_ROOT_PASSWORD=change_me_root_password
JWT_SECRET=
ADMIN_NAME=Exam Cell Incharge
ADMIN_EMAIL=examcell@cuj.local
ADMIN_PASSWORD=ChangeMe#12345
SEED_DEMO_USERS=true
REF_SEQ_START=3000
```
If `JWT_SECRET` is empty, the server generates 48 random bytes on first start and stores them in `settings` (`k='jwt_secret'`) so it works with zero setup and survives restarts. `DB_NAME` must stay `cuj_datesheet`.
**client/vite.config.ts**: React plugin, `server.proxy['/api'] = 'http://localhost:4000'` for local development only.

### 2.4 Server implementation instructions
**Startup (`server.js`)**: load config → create pool → retry the DB connection up to 30 times (2 s apart) → run `seedService` (idempotent: admin user, demo coordinators, JWT secret) → start Express → graceful shutdown on `SIGTERM` (close server, pool, Chromium).
**Pool (`db.js`)**: `mysql2/promise`, `charset:'utf8mb4'`, `timezone:'+05:30'`, `dateStrings:true` (DATE columns come back as `'YYYY-MM-DD'` strings — **never** convert dates through JS `Date` in local time), `namedPlaceholders:true`, `connectionLimit:10`. Run `SET time_zone='+05:30'` on each new connection. Provide a `withTransaction(fn)` helper.
**App (`app.js`)**: `trust proxy = 1`, `helmet` (CSP allowing only self, inline styles are not needed because Tailwind is compiled), `express.json({limit:'200kb'})`, `cookie-parser`, `pino-http`, mount `/api`, JSON 404 for unknown `/api/*`, central error handler (zod errors → 422 `fields`; `httpError` → its status; MySQL `ER_DUP_ENTRY` → 409; anything else → logged, generic 500).
**Auth**: `bcryptjs` cost 11; JWT (HS256, 8 h) in the cookie `cuj_token` (`httpOnly`, `sameSite:'strict'`, `secure: COOKIE_SECURE==='true'`). The `auth` middleware verifies the token and **reloads the user from the DB on every request** (so deactivation and role changes apply immediately). `csrf` middleware: for POST/PUT/PATCH/DELETE require header `X-Requested-With: cuj-web`, otherwise 403. Login limiter: 10 attempts / 15 min / IP. Users with `must_change_password=1` are blocked (403 `PASSWORD_CHANGE_REQUIRED`) everywhere except `/auth/*` and `/health`.
**RBAC**: `requireRole('EXAM_CELL')`; `scopeDepartment(req)` returns `req.user.department_id` for coordinators and the requested one for the exam cell. Entry reads/writes always filter by this scope. Accessing another department's entry returns 404.
**Validation**: one zod schema per endpoint (strings trimmed, course code uppercased and regex-checked as in 1.4); schemas live next to the route; failed validation → 422 with `fields`.

**Clash check (`clashService.js`)** — inside `withTransaction`, using the same connection:
```js
const [rows] = await conn.execute(
  `SELECT e.id, e.course_name, ts.label FROM exam_entries e
   JOIN time_slots ts ON ts.id = e.time_slot_id
   WHERE e.exam_cycle_id = :cycle AND e.program_id = :prog AND e.semester = :sem
     AND e.exam_type = :type AND e.exam_date = :date AND e.time_slot_id = :slot
     AND e.id <> :self LIMIT 1 FOR UPDATE`,
  { cycle, prog, sem, type, date, slot, self: excludeId ?? 0 });
if (rows.length) throw httpError(409, 'CLASH', `Clash: ${programName} Semester ${sem} (${typeLabel}) already has "${rows[0].course_name}" on ${ddmmyyyy(date)} at ${rows[0].label}.`);
```
Then the duplicate-course check (`DUPLICATE_COURSE`), then INSERT/UPDATE. Also map `err.code === 'ER_DUP_ENTRY'` to 409, deciding between `CLASH` and `DUPLICATE_COURSE` by `err.sqlMessage` containing `uq_slot` or `uq_course`.

**Reference number (`refService.js`)**: in a transaction: `SELECT … FROM datesheet_refs WHERE (cycle,program,semester,type) FOR UPDATE`; if found return it; else read `COALESCE(MAX(ref_seq),0)` for the current year `FOR UPDATE`, `seq = Math.max(max+1, Number(REF_SEQ_START))`, build `CUJ/Exam/Datesheet/${year}/${seq}`, insert with `issued_on = CURDATE()`; on `ER_DUP_ENTRY` retry once.

**PDF (`pdfService.js`, Puppeteer + system Chromium)**
- Keep **one shared browser** (lazy launch, auto-relaunch on `disconnected`), `executablePath: process.env.PUPPETEER_EXECUTABLE_PATH`, `userDataDir:'/tmp/chromium-profile'`, args `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu`. Limit to 2 concurrent pages with a small semaphore; always close the page in `finally`.
- `templates/datesheetHtml.js` returns a full HTML document: inline CSS, `font-family:"Liberation Serif","Times New Roman",serif` for English and `"Noto Sans Devanagari"` for Hindi spans, exact layout of section 1.8; all dynamic values HTML-escaped; logo/signature embedded as `data:` URIs read from `storage/branding`.
- `page.setContent(html,{waitUntil:'load'})`, then `page.pdf({ format:'A4', printBackground:true, margin:{top:'16mm',right:'18mm',bottom:'16mm',left:'18mm'} })`; overall PDF uses `landscape:true` and `displayHeaderFooter:true` with a footer template showing `<span class="pageNumber"></span> / <span class="totalPages"></span>`.
- Table CSS: `border-collapse:collapse; td,th{border:1px solid #000}`, `tr{page-break-inside:avoid}`, `thead{display:table-header-group}`.
- Respond with `Content-Type: application/pdf`, `Content-Disposition` inline or attachment (`?download=1`), `Cache-Control: no-store`.

**Excel (`excelService.js`, exceljs)**: build the workbook of section 1.9; write real `Date` values created with `new Date(Date.UTC(y, m-1, d))` and `numFmt:'dd-mm-yyyy'`; stream with `workbook.xlsx.write(res)`. Template: header + sample row + list validations (`ws.getCell(...).dataValidation = {type:'list', formulae:['Lists!$A$2:$A$50']}` for rows 2–1001) fed by a hidden `Lists` sheet.
**Upload (`uploadService.js`)**: `multer` memory storage, limit 5 MB, one file; accept only `.xlsx` (check `PK` signature) or `.csv`; use `workbook.xlsx.load(buffer)` / `workbook.csv.read(stream)`. Cell value handling: `Date` objects from exceljs are UTC — read them with `getUTCFullYear/Month/Date`; formula cells use `.result`; rich text uses joined `.richText[].text`; numbers for the student count are coerced and verified to be integers. Max 1000 rows, skip empty rows. Validate all rows (same rules as 1.5 + clashes inside the file), then insert everything in **one transaction** or nothing.

### 2.5 Client implementation instructions
- **Tailwind config** exposes the colours of 1.10 as `primary`, `accent`, `success`, `danger`, `surface`, `border`, `muted`; font family `Inter` with the Noto Sans Devanagari fallback loaded with `<link>` in `index.html` (Google Fonts, `display=swap`).
- **api/client.ts**: `fetch` wrapper (`credentials:'same-origin'`, header `X-Requested-With: cuj-web`, JSON parse, typed `ApiError {status, code, message, fields}`); a 401 clears the auth state and navigates to `/login`. `types.ts` mirrors every API shape. `queries.ts` holds React Query hooks (stable keys such as `['entries', filters]`) and mutations that invalidate the right keys.
- **Routing**: `/login`, `/change-password`, `/` (Dashboard), `/entries/new`, `/entries/:id/edit`, `/datesheets`, `/consolidated` and `/admin/*` (exam cell only, guarded by `RequireAuth role="EXAM_CELL"`), `*` NotFound. The selected exam cycle and exam type live in the URL query so pages can be bookmarked and refreshed.
- **EntryForm**: react-hook-form + zod; Department locked for coordinators; Program list depends on Department; Semester list depends on Program; the calendar (`react-day-picker`, `fromDate/toDate` = cycle window, display `dd-MM-yyyy`) shows the weekday live; debounced clash check; server `fields` errors are pushed with `setError`; *Save & add another* keeps Program/Semester/Type/Timing and clears Date/Course fields.
- **DateSheet**: segmented control Regular | Re-appear, filter row, `DataTable` with edit/delete (confirm dialog), `UploadCard` (drag & drop, template link, *Validate only* then *Upload*, scrollable per-row error table), per-group *Preview PDF* (modal with `<iframe src="/api/datesheets/pdf?...">`) and *Download PDF* buttons, reference number chip when issued.
- **Consolidated**: filters, List/Calendar toggle, `CalendarGrid` (rows = dates + weekday, columns = time slots, chips per course, day totals), export buttons as anchors to the API URLs with the current filters.
- **Admin**: one tabbed layout with CRUD tables and modal forms; the cycles tab has a Lock/Unlock switch; Branding tab uploads logo/signature (PNG/JPG ≤ 1 MB) via `/api/admin/branding` (add this endpoint) and edits the controller name.
- Accessibility and responsiveness exactly as in 1.10. Provide skeletons, empty states and toast messages everywhere. No `any` in TypeScript except in a documented API-boundary helper.

### 2.6 Build order for you (the AI builder)
1. `docker-compose.yml`, both Dockerfiles, `nginx.conf`, `.env.example`, `db/schema.sql`, package.json files.
2. Server core (config, db, errors, auth, RBAC, health, seed). 3. Meta + entries + clash rules + audit. 4. Upload + template. 5. PDF + ref numbers. 6. Consolidated, Excel, overall PDF, ZIP. 7. Admin endpoints (including branding). 8. Client shell, auth, API layer. 9. Pages in this order: Login → EntryForm → DateSheet → Dashboard → Consolidated → Admin. 10. README. 11. Self-review against Part 3.

### 2.7 Output format
First print the complete file tree. Then print **every file in full** (including `package.json` files with exact dependency versions, `tsconfig.json`, Tailwind/PostCSS configs), each preceded by its path and in a fenced code block with the right language. Do not abbreviate and never write "rest remains the same". After the files print the exact commands:
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