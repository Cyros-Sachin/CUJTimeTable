'use client';

import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Eye, Download, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import {
  useMeta, useEntries, useDatesheetGroups, useDeleteEntry, datesheetPdfUrl,
} from '@/api/queries';
import type { ExamType } from '@/api/types';
import { Tabs } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Select';
import { Field } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Chip } from '@/components/ui/Chip';
import { CycleSelect } from '@/components/CycleSelect';
import { UploadCard } from '@/components/UploadCard';
import { PdfPreviewModal } from '@/components/PdfPreviewModal';
import { ddmmyyyy, isoToWeekday, examTypeLabel } from '@/lib/format';
import type { ExamEntry, DatesheetGroup } from '@/api/types';

function useQueryState() {
  const router = useRouter();
  const params = useSearchParams();
  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k); else next.set(k, String(v));
    }
    router.replace(`/datesheets?${next.toString()}`);
  };
  return { params, set };
}

export default function DateSheetPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DateSheetPageInner />
    </Suspense>
  );
}

function DateSheetPageInner() {
  const { user } = useAuth();
  const { data: meta, isLoading: metaLoading } = useMeta();
  const { params, set } = useQueryState();
  const navRouter = useRouter();

  const cycleId = params.get('cycle_id') ? Number(params.get('cycle_id')) : meta?.cycles[0]?.id;
  const examType = (params.get('exam_type') as ExamType) || 'REGULAR';
  const departmentId = params.get('department_id') ? Number(params.get('department_id')) : (user?.role === 'DEPT_COORDINATOR' ? user.department?.id : undefined);
  const programId = params.get('program_id') ? Number(params.get('program_id')) : undefined;
  const semester = params.get('semester') ? Number(params.get('semester')) : undefined;

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [previewGroup, setPreviewGroup] = useState<DatesheetGroup | null>(null);

  const programs = useMemo(() => (meta?.programs || []).filter((p) => !departmentId || p.department_id === departmentId), [meta, departmentId]);

  const entries = useEntries({ cycle_id: cycleId, exam_type: examType, department_id: departmentId, program_id: programId, semester, page_size: 100 });
  const groups = useDatesheetGroups({ cycle_id: cycleId, exam_type: examType, department_id: departmentId });
  const deleteEntry = useDeleteEntry();

  async function confirmDelete() {
    if (deleteId == null) return;
    try {
      await deleteEntry.mutateAsync(deleteId);
      toast.success('Entry deleted');
      setDeleteId(null);
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete entry');
    }
  }

  const columns: Column<ExamEntry>[] = [
    { key: 'date', header: 'Date', render: (e) => <>{ddmmyyyy(e.exam_date)}<br /><span className="text-xs text-muted">({isoToWeekday(e.exam_date)})</span></> },
    { key: 'time', header: 'Time', render: (e) => e.time_slot_label },
    { key: 'code', header: 'Code', render: (e) => e.course_code },
    { key: 'name', header: 'Course Name', render: (e) => e.course_name },
    { key: 'stype', header: 'Subject Type', render: (e) => e.subject_type_name },
    { key: 'students', header: 'Students', render: (e) => e.student_count },
    {
      key: 'actions', header: '', render: (e) => (
        <div className="flex gap-2">
          <button type="button" aria-label="Edit" onClick={() => navRouter.push(`/entries/${e.id}/edit`)} className="text-muted hover:text-primary"><Pencil size={16} /></button>
          <button type="button" aria-label="Delete" onClick={() => setDeleteId(e.id)} className="text-muted hover:text-danger"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  if (metaLoading || !meta) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={examType} onChange={(v) => set({ exam_type: v })} options={[{ value: 'REGULAR', label: 'Regular' }, { value: 'REAPPEAR', label: 'Re-appear' }]} />
        <div className="w-64">
          <CycleSelect cycles={meta.cycles} value={cycleId} onChange={(id) => set({ cycle_id: id })} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {user?.role === 'EXAM_CELL' ? (
          <Field label="Department" htmlFor="f-dept">
            <Select id="f-dept" value={departmentId ?? ''} onChange={(e) => set({ department_id: e.target.value || undefined, program_id: undefined })}>
              <option value="">All departments</option>
              {meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        ) : null}
        <Field label="Program" htmlFor="f-prog">
          <Select id="f-prog" value={programId ?? ''} onChange={(e) => set({ program_id: e.target.value || undefined })}>
            <option value="">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Semester" htmlFor="f-sem">
          <Select id="f-sem" value={semester ?? ''} onChange={(e) => set({ semester: e.target.value || undefined })}>
            <option value="">All semesters</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
      </div>

      {entries.isLoading ? <Skeleton className="h-64 w-full" /> : (
        <DataTable columns={columns} rows={entries.data?.data || []} rowKey={(e) => e.id} emptyMessage="No entries yet for this selection." />
      )}

      <UploadCard cycleId={cycleId} examType={examType} departmentId={user?.role === 'EXAM_CELL' ? departmentId : undefined} />

      <div className="rounded border border-border bg-white p-4 shadow-subtle">
        <h3 className="mb-3 text-sm font-semibold text-text">Date sheets by program & semester</h3>
        {groups.isLoading ? <Skeleton className="h-32 w-full" /> : !groups.data?.length ? (
          <EmptyState title="No date sheets yet" description="Add entries above to generate a date sheet." />
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.data.map((g) => (
              <li key={`${g.department_id}-${g.program_id}-${g.semester}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-text">{g.program_name} — Semester {g.semester} {g.department_code ? `(${g.department_code})` : ''}</p>
                  <p className="text-xs text-muted">
                    {g.course_count} course(s) · {ddmmyyyy(g.first_date)} – {ddmmyyyy(g.last_date)}
                    {g.ref_no ? <> · <Chip kind={examType === 'REGULAR' ? 'regular' : 'reappear'}>{g.ref_no}</Chip></> : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setPreviewGroup(g)}><Eye size={16} className="mr-1" /> Preview PDF</Button>
                  <a href={datesheetPdfUrl({ cycle_id: cycleId!, program_id: g.program_id, semester: g.semester, exam_type: examType, download: true })}>
                    <Button variant="secondary"><Download size={16} className="mr-1" /> Download</Button>
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteId != null}
        title="Delete entry"
        message="This will permanently remove the entry. This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleteEntry.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />

      {previewGroup && cycleId ? (
        <PdfPreviewModal
          open={!!previewGroup}
          onClose={() => setPreviewGroup(null)}
          title={`${previewGroup.program_name} — Semester ${previewGroup.semester} (${examTypeLabel(examType)})`}
          previewUrl={datesheetPdfUrl({ cycle_id: cycleId, program_id: previewGroup.program_id, semester: previewGroup.semester, exam_type: examType })}
          downloadUrl={datesheetPdfUrl({ cycle_id: cycleId, program_id: previewGroup.program_id, semester: previewGroup.semester, exam_type: examType, download: true })}
        />
      ) : null}
    </div>
  );
}
