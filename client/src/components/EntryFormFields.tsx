'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/auth/AuthContext';
import {
  useMeta, useCreateEntry, useUpdateEntry, useCheckClash, useEntries,
} from '@/api/queries';
import { ApiError } from '@/api/types';
import type { ExamEntry, ExamType } from '@/api/types';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Button } from './ui/Button';
import { Tabs } from './ui/Tabs';
import { DatePicker } from './ui/DatePicker';
import { Skeleton } from './ui/Skeleton';
import { ddmmyyyy, examTypeLabel } from '@/lib/format';

const courseCodeRegex = /^[A-Z0-9][A-Z0-9\-_/ ]{2,29}$/;

const schema = z.object({
  department_id: z.coerce.number().int().positive({ message: 'Select a department' }),
  program_id: z.coerce.number().int().positive({ message: 'Select a program' }),
  semester: z.coerce.number().int().min(1, 'Select a semester'),
  subject_type_id: z.coerce.number().int().positive({ message: 'Select a subject type' }),
  time_slot_id: z.coerce.number().int().positive({ message: 'Select a timing' }),
  exam_date: z.string().min(1, 'Select a date'),
  course_code: z.string().trim().min(3).max(30).regex(courseCodeRegex, 'Invalid course code format'),
  course_name: z.string().trim().min(2, 'Min 2 characters').max(200),
  student_count: z.coerce.number().int().min(1, 'Min 1').max(5000, 'Max 5000'),
  academic_session_id: z.coerce.number().int().positive({ message: 'Select a session' }),
  exam_cycle_id: z.coerce.number().int().positive({ message: 'Select the examination' }),
});
type FormValues = z.infer<typeof schema>;

// react-hook-form's `register` on a <select>/<input> always hands back the raw
// DOM string value through `watch()` — zod's `z.coerce.number()` only kicks in
// at submit-time validation, not for live watched values. Every numeric field
// here is used for live lookups against numeric API ids (program_id === id),
// so it must be coerced to a real number (or undefined) at the form-state level.
const asNumber = { setValueAs: (v: string) => (v === '' || v === undefined ? undefined : Number(v)) };

export function EntryFormFields({ entry }: { entry?: ExamEntry }) {
  const router = useRouter();
  const { user } = useAuth();
  const { data: meta, isLoading: metaLoading } = useMeta();
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();
  const checkClash = useCheckClash();

  const [examType, setExamType] = useState<ExamType>(entry?.exam_type || 'REGULAR');
  const [clashMessage, setClashMessage] = useState<string | null>(null);

  const isCoordinator = user?.role === 'DEPT_COORDINATOR';
  const isEdit = !!entry;

  const { register, handleSubmit, watch, setValue, setError, reset, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: entry ? {
      department_id: entry.department_id,
      program_id: entry.program_id,
      semester: entry.semester,
      subject_type_id: entry.subject_type_id,
      time_slot_id: entry.time_slot_id,
      exam_date: entry.exam_date,
      course_code: entry.course_code,
      course_name: entry.course_name,
      student_count: entry.student_count,
      exam_cycle_id: entry.exam_cycle_id,
    } : {
      department_id: isCoordinator ? user?.department?.id : undefined,
    },
  });

  useEffect(() => {
    if (isCoordinator && user?.department && !entry) {
      setValue('department_id', user.department.id);
    }
  }, [isCoordinator, user, entry, setValue]);

  const departmentId = watch('department_id');
  const programId = watch('program_id');
  const cycleId = watch('exam_cycle_id');
  const sessionId = watch('academic_session_id');
  const examDate = watch('exam_date');
  const timeSlotId = watch('time_slot_id');

  const currentSessionId = useMemo(() => {
    if (sessionId) return sessionId;
    return meta?.sessions.find((s) => s.is_current)?.id;
  }, [sessionId, meta]);

  useEffect(() => {
    if (!entry && currentSessionId && !watch('academic_session_id')) {
      setValue('academic_session_id', currentSessionId);
    }
  }, [currentSessionId, entry, setValue, watch]);

  const programs = useMemo(() => (meta?.programs || []).filter((p) => p.department_id === departmentId), [meta, departmentId]);
  const selectedProgram = programs.find((p) => p.id === programId);
  const cycles = useMemo(() => {
    const all = (meta?.cycles || []).filter((c) => c.academic_session_id === currentSessionId);
    return isCoordinator ? all.filter((c) => c.status === 'OPEN' || c.id === entry?.exam_cycle_id) : all;
  }, [meta, currentSessionId, isCoordinator, entry]);
  const selectedCycle = (meta?.cycles || []).find((c) => c.id === cycleId);

  const sidePanel = useEntries({
    cycle_id: cycleId, exam_type: examType, program_id: programId, semester: watch('semester'), page_size: 50,
  });

  // Debounced inline clash check whenever the slot-defining fields change.
  useEffect(() => {
    setClashMessage(null);
    if (!departmentId || !programId || !cycleId || !timeSlotId || !examDate || !watch('semester')) return;
    const handle = setTimeout(async () => {
      try {
        await checkClash.mutateAsync({
          exam_cycle_id: cycleId, department_id: departmentId, program_id: programId, semester: watch('semester'),
          exam_type: examType, subject_type_id: watch('subject_type_id') || 1, time_slot_id: timeSlotId,
          exam_date: examDate, course_code: watch('course_code') || 'TEMP0000', course_name: watch('course_name') || 'TEMP',
          student_count: watch('student_count') || 1, exclude_id: entry?.id,
        });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'CLASH') setClashMessage(err.message);
      }
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, programId, cycleId, timeSlotId, examDate, examType]);

  async function submit(values: FormValues, addAnother: boolean) {
    const payload = { ...values, exam_type: examType };
    try {
      if (isEdit && entry) {
        await updateEntry.mutateAsync({ id: entry.id, body: payload });
        toast.success('Entry updated');
        router.push('/datesheets');
      } else {
        await createEntry.mutateAsync(payload);
        toast.success('Entry saved');
        if (addAnother) {
          reset({
            department_id: values.department_id,
            program_id: values.program_id,
            semester: values.semester,
            subject_type_id: values.subject_type_id,
            time_slot_id: values.time_slot_id,
            academic_session_id: values.academic_session_id,
            exam_cycle_id: values.exam_cycle_id,
            exam_date: '',
            course_code: '',
            course_name: '',
            student_count: '' as unknown as number,
          });
        } else {
          router.push('/datesheets');
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) {
          for (const [field, message] of Object.entries(err.fields)) {
            if (field in schema.shape) setError(field as keyof FormValues, { message });
          }
        }
        toast.error(err.message);
      }
    }
  }

  if (metaLoading || !meta) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
      <form onSubmit={handleSubmit((v) => submit(v, false))} noValidate className="rounded border border-border bg-white p-5 shadow-subtle">
        <div className="mb-4">
          <Tabs value={examType} onChange={setExamType} options={[{ value: 'REGULAR', label: 'Regular' }, { value: 'REAPPEAR', label: 'Re-appear' }]} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Program Name" error={errors.program_id?.message} htmlFor="program_id">
            <Select id="program_id" invalid={!!errors.program_id} {...register('program_id', asNumber)} disabled={!departmentId}>
              <option value="">Select program…</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>

          <Field label="Department Name" error={errors.department_id?.message} htmlFor="department_id">
            {isCoordinator ? (
              <Input value={user?.department?.name || ''} disabled />
            ) : (
              <Select id="department_id" invalid={!!errors.department_id} {...register('department_id', asNumber)}>
                <option value="">Select department…</option>
                {meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}
          </Field>

          <Field label="Semester" error={errors.semester?.message} htmlFor="semester">
            <Select id="semester" invalid={!!errors.semester} {...register('semester', asNumber)} disabled={!selectedProgram}>
              <option value="">Select semester…</option>
              {Array.from({ length: selectedProgram?.total_semesters || 0 }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>

          <Field label="Subject Type" error={errors.subject_type_id?.message} htmlFor="subject_type_id">
            <Select id="subject_type_id" invalid={!!errors.subject_type_id} {...register('subject_type_id', asNumber)}>
              <option value="">Select subject type…</option>
              {meta.subject_types.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>

          <Field label="Timing" error={errors.time_slot_id?.message} htmlFor="time_slot_id">
            <Select id="time_slot_id" invalid={!!errors.time_slot_id} {...register('time_slot_id', asNumber)}>
              <option value="">Select timing…</option>
              {meta.time_slots.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Field>

          <Field label="Date" error={errors.exam_date?.message} htmlFor="exam_date">
            <Controller
              control={control}
              name="exam_date"
              render={({ field }) => (
                <DatePicker
                  id="exam_date"
                  value={field.value}
                  onChange={field.onChange}
                  fromIso={selectedCycle?.start_date}
                  toIso={selectedCycle?.end_date}
                  invalid={!!errors.exam_date}
                />
              )}
            />
          </Field>

          <Field label="Course Code" error={errors.course_code?.message} htmlFor="course_code" hint="e.g. MBIO1C004T">
            <Input id="course_code" invalid={!!errors.course_code} {...register('course_code')} style={{ textTransform: 'uppercase' }} />
          </Field>

          <Field label="Course Name" error={errors.course_name?.message} htmlFor="course_name">
            <Input id="course_name" invalid={!!errors.course_name} {...register('course_name')} />
          </Field>

          <Field label="No. of Students" error={errors.student_count?.message} htmlFor="student_count">
            <Input id="student_count" type="number" min={1} max={5000} invalid={!!errors.student_count} {...register('student_count', asNumber)} />
          </Field>

          <Field label="Academic Session" error={errors.academic_session_id?.message} htmlFor="academic_session_id">
            <Select id="academic_session_id" invalid={!!errors.academic_session_id} {...register('academic_session_id', asNumber)}>
              <option value="">Select session…</option>
              {meta.sessions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>

          <Field label="Examination" error={errors.exam_cycle_id?.message} htmlFor="exam_cycle_id">
            <Select id="exam_cycle_id" invalid={!!errors.exam_cycle_id} {...register('exam_cycle_id', asNumber)} disabled={!currentSessionId}>
              <option value="">Select examination…</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>{c.title} – {c.month_year}{c.status === 'LOCKED' ? ' (Locked)' : ''}</option>
              ))}
            </Select>
          </Field>
        </div>

        {clashMessage ? (
          <p className="mt-4 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger" role="alert">{clashMessage}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="submit" loading={createEntry.isPending || updateEntry.isPending}>Save</Button>
          {!isEdit ? (
            <Button type="button" variant="secondary" loading={createEntry.isPending} onClick={handleSubmit((v) => submit(v, true))}>
              Save & add another
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => reset()}>Reset</Button>
        </div>
      </form>

      <aside className="rounded border border-border bg-white p-4 shadow-subtle">
        <h3 className="mb-3 text-sm font-semibold text-text">
          Already added {selectedProgram ? `· ${selectedProgram.name}` : ''} {watch('semester') ? `Sem ${watch('semester')}` : ''}
        </h3>
        {!programId || !watch('semester') || !cycleId ? (
          <p className="text-sm text-muted">Pick a program, semester and examination to see existing entries.</p>
        ) : sidePanel.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : sidePanel.data?.data.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {sidePanel.data.data.map((e) => (
              <li key={e.id} className="rounded border border-border px-2 py-1.5">
                <p className="font-medium text-text">{e.course_code} — {e.course_name}</p>
                <p className="text-xs text-muted">{ddmmyyyy(e.exam_date)} · {e.time_slot_label} · {examTypeLabel(e.exam_type)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No entries yet for this selection.</p>
        )}
      </aside>
    </div>
  );
}
