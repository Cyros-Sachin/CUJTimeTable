'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileSpreadsheet, FileText, FolderArchive } from 'lucide-react';
import { useMeta, useConsolidated, consolidatedExportUrl } from '@/api/queries';
import type { ExamType } from '@/api/types';
import { Tabs } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { CycleSelect } from '@/components/CycleSelect';
import { CalendarGrid } from '@/components/CalendarGrid';
import { ddmmyyyy, isoToWeekday, examTypeLabel } from '@/lib/format';
import type { ExamEntry } from '@/api/types';
import { RequireAuth } from '@/auth/RequireAuth';

function useQueryState() {
  const router = useRouter();
  const params = useSearchParams();
  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k); else next.set(k, String(v));
    }
    router.replace(`/consolidated?${next.toString()}`);
  };
  return { params, set };
}

export default function ConsolidatedPage() {
  return (
    <RequireAuth role="EXAM_CELL">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <ConsolidatedPageInner />
      </Suspense>
    </RequireAuth>
  );
}

function ConsolidatedPageInner() {
  const { data: meta, isLoading: metaLoading } = useMeta();
  const { params, set } = useQueryState();
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const cycleId = params.get('cycle_id') ? Number(params.get('cycle_id')) : meta?.cycles[0]?.id;
  const examType = (params.get('exam_type') as ExamType) || undefined;
  const departmentId = params.get('department_id') ? Number(params.get('department_id')) : undefined;
  const programId = params.get('program_id') ? Number(params.get('program_id')) : undefined;
  const semester = params.get('semester') ? Number(params.get('semester')) : undefined;
  const dateFrom = params.get('date_from') || undefined;
  const dateTo = params.get('date_to') || undefined;
  const q = params.get('q') || undefined;
  const page = params.get('page') ? Number(params.get('page')) : 1;

  const filters = { cycle_id: cycleId, exam_type: examType, department_id: departmentId, program_id: programId, semester, date_from: dateFrom, date_to: dateTo, q, page, page_size: 20 };
  const consolidated = useConsolidated(filters);

  const programs = useMemo(() => (meta?.programs || []).filter((p) => !departmentId || p.department_id === departmentId), [meta, departmentId]);

  const columns: Column<ExamEntry>[] = [
    { key: 'date', header: 'Date', render: (e) => `${ddmmyyyy(e.exam_date)} (${isoToWeekday(e.exam_date)})` },
    { key: 'time', header: 'Time', render: (e) => e.time_slot_label },
    { key: 'dept', header: 'Department', render: (e) => e.department_name },
    { key: 'program', header: 'Program', render: (e) => e.program_name },
    { key: 'sem', header: 'Sem', render: (e) => e.semester },
    { key: 'type', header: 'Type', render: (e) => examTypeLabel(e.exam_type) },
    { key: 'code', header: 'Code', render: (e) => e.course_code },
    { key: 'name', header: 'Course Name', render: (e) => e.course_name },
    { key: 'students', header: 'Students', render: (e) => e.student_count },
  ];

  if (metaLoading || !meta) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-64">
          <CycleSelect cycles={meta.cycles} value={cycleId} onChange={(id) => set({ cycle_id: id, page: undefined })} />
        </div>
        <div className="flex gap-2">
          <a href={consolidatedExportUrl('excel', filters)}><Button variant="secondary"><FileSpreadsheet size={16} className="mr-1" /> Export Excel</Button></a>
          <a href={consolidatedExportUrl('pdf', filters)}><Button variant="secondary"><FileText size={16} className="mr-1" /> Overall PDF</Button></a>
          <a href={consolidatedExportUrl('zip', filters)}><Button variant="secondary"><FolderArchive size={16} className="mr-1" /> Download all PDFs</Button></a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Exam Type" htmlFor="c-type">
          <Select id="c-type" value={examType ?? ''} onChange={(e) => set({ exam_type: e.target.value || undefined, page: undefined })}>
            <option value="">All</option>
            <option value="REGULAR">Regular</option>
            <option value="REAPPEAR">Re-appear</option>
          </Select>
        </Field>
        <Field label="Department" htmlFor="c-dept">
          <Select id="c-dept" value={departmentId ?? ''} onChange={(e) => set({ department_id: e.target.value || undefined, program_id: undefined, page: undefined })}>
            <option value="">All</option>
            {meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Program" htmlFor="c-prog">
          <Select id="c-prog" value={programId ?? ''} onChange={(e) => set({ program_id: e.target.value || undefined, page: undefined })}>
            <option value="">All</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Semester" htmlFor="c-sem">
          <Select id="c-sem" value={semester ?? ''} onChange={(e) => set({ semester: e.target.value || undefined, page: undefined })}>
            <option value="">All</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="From" htmlFor="c-from">
          <Input id="c-from" type="date" value={dateFrom ?? ''} onChange={(e) => set({ date_from: e.target.value || undefined, page: undefined })} />
        </Field>
        <Field label="To" htmlFor="c-to">
          <Input id="c-to" type="date" value={dateTo ?? ''} onChange={(e) => set({ date_to: e.target.value || undefined, page: undefined })} />
        </Field>
        <div className="col-span-2 sm:col-span-3 lg:col-span-6">
          <Field label="Search" htmlFor="c-q">
            <Input id="c-q" placeholder="Course code or name…" defaultValue={q ?? ''} onBlur={(e) => set({ q: e.target.value || undefined, page: undefined })} />
          </Field>
        </div>
      </div>

      <Tabs value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar grid' }]} />

      {consolidated.isLoading ? <Skeleton className="h-64 w-full" /> : view === 'list' ? (
        <>
          <DataTable columns={columns} rows={consolidated.data?.data || []} rowKey={(e) => e.id} emptyMessage="No entries match these filters." />
          <Pagination page={page} pageSize={20} total={consolidated.data?.meta.total || 0} onPageChange={(p) => set({ page: p })} />
        </>
      ) : (
        <CalendarGrid entries={consolidated.data?.data || []} />
      )}

      {consolidated.data?.day_wise_summary?.length ? (
        <div className="rounded border border-border bg-white p-4 shadow-subtle">
          <h3 className="mb-3 text-sm font-semibold text-text">Day-wise summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Date</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Papers</th><th className="px-3 py-2">Students</th><th className="px-3 py-2">Departments</th>
                </tr>
              </thead>
              <tbody>
                {consolidated.data.day_wise_summary.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{ddmmyyyy(row.exam_date)} ({row.weekday})</td>
                    <td className="px-3 py-2">{row.time_slot_label}</td>
                    <td className="px-3 py-2">{row.paper_count}</td>
                    <td className="px-3 py-2">{row.total_students}</td>
                    <td className="px-3 py-2">{row.departments.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
