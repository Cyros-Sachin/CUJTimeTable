'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Lock, Unlock } from 'lucide-react';
import { sessionsApi, cyclesApi, useSetCycleStatus } from '@/api/queries';
import type { AcademicSession, ExamCycle } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Chip';
import { ddmmyyyy } from '@/lib/format';

interface SessionForm { label: string; is_current: boolean }
interface CycleForm { academic_session_id: number; title: string; month_year: string; start_date: string; end_date: string }

export default function SessionsCyclesAdminPage() {
  const sessions = sessionsApi.useList();
  const createSession = sessionsApi.useCreate();
  const cycles = cyclesApi.useList();
  const createCycle = cyclesApi.useCreate();
  const setStatus = useSetCycleStatus();

  const [sessionModal, setSessionModal] = useState(false);
  const [cycleModal, setCycleModal] = useState(false);

  const sessionForm = useForm<SessionForm>({ defaultValues: { label: '', is_current: false } });
  const cycleForm = useForm<CycleForm>({ defaultValues: { title: 'End Semester Examination', month_year: '', start_date: '', end_date: '' } });

  async function onCreateSession(values: SessionForm) {
    try {
      await createSession.mutateAsync({ ...values, is_current: !!values.is_current } as any);
      toast.success('Session created');
      setSessionModal(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save session');
    }
  }

  async function onCreateCycle(values: CycleForm) {
    try {
      await createCycle.mutateAsync({ ...values, academic_session_id: Number(values.academic_session_id) } as any);
      toast.success('Exam cycle created');
      setCycleModal(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save cycle');
    }
  }

  async function toggleStatus(cycle: ExamCycle) {
    try {
      await setStatus.mutateAsync({ id: cycle.id, status: cycle.status === 'OPEN' ? 'LOCKED' : 'OPEN' });
      toast.success(cycle.status === 'OPEN' ? 'Cycle locked' : 'Cycle unlocked');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update cycle status');
    }
  }

  const sessionColumns: Column<AcademicSession>[] = [
    { key: 'label', header: 'Session', render: (s) => s.label },
    { key: 'current', header: 'Current', render: (s) => (s.is_current ? <Chip kind="open">Current</Chip> : null) },
  ];

  const cycleColumns: Column<ExamCycle>[] = [
    { key: 'title', header: 'Title', render: (c) => `${c.title} – ${c.month_year}` },
    { key: 'session', header: 'Session', render: (c) => c.session_label || '' },
    { key: 'window', header: 'Window', render: (c) => `${ddmmyyyy(c.start_date)} – ${ddmmyyyy(c.end_date)}` },
    { key: 'status', header: 'Status', render: (c) => (c.status === 'LOCKED' ? <Chip kind="locked">Locked</Chip> : <Chip kind="open">Open</Chip>) },
    {
      key: 'actions', header: '', render: (c) => (
        <Button variant="secondary" onClick={() => toggleStatus(c)} loading={setStatus.isPending}>
          {c.status === 'OPEN' ? <><Lock size={14} className="mr-1" /> Lock</> : <><Unlock size={14} className="mr-1" /> Unlock</>}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Academic sessions</h2>
          <Button onClick={() => { sessionForm.reset({ label: '', is_current: false }); setSessionModal(true); }}>
            <Plus size={16} className="mr-1" /> Add session
          </Button>
        </div>
        {sessions.isLoading ? <Skeleton className="h-32 w-full" /> : (
          <DataTable columns={sessionColumns} rows={sessions.data || []} rowKey={(s) => s.id} emptyMessage="No sessions yet." />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Exam cycles</h2>
          <Button onClick={() => { cycleForm.reset({ title: 'End Semester Examination', month_year: '', start_date: '', end_date: '' }); setCycleModal(true); }}>
            <Plus size={16} className="mr-1" /> Add cycle
          </Button>
        </div>
        {cycles.isLoading ? <Skeleton className="h-32 w-full" /> : (
          <DataTable columns={cycleColumns} rows={cycles.data || []} rowKey={(c) => c.id} emptyMessage="No exam cycles yet." />
        )}
      </section>

      <Modal open={sessionModal} onClose={() => setSessionModal(false)} title="Add academic session">
        <form onSubmit={sessionForm.handleSubmit(onCreateSession)} noValidate className="flex flex-col gap-4">
          <Field label="Label" error={sessionForm.formState.errors.label?.message} htmlFor="s-label" hint="e.g. 2026-27">
            <Input id="s-label" {...sessionForm.register('label', { required: 'Required' })} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" {...sessionForm.register('is_current')} /> Make this the current session
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSessionModal(false)}>Cancel</Button>
            <Button type="submit" loading={createSession.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <Modal open={cycleModal} onClose={() => setCycleModal(false)} title="Add exam cycle">
        <form onSubmit={cycleForm.handleSubmit(onCreateCycle)} noValidate className="flex flex-col gap-4">
          <Field label="Academic session" error={cycleForm.formState.errors.academic_session_id?.message} htmlFor="c-session">
            <Select id="c-session" {...cycleForm.register('academic_session_id', { required: 'Required' })}>
              <option value="">Select session…</option>
              {sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Title" error={cycleForm.formState.errors.title?.message} htmlFor="c-title">
            <Input id="c-title" {...cycleForm.register('title', { required: 'Required' })} />
          </Field>
          <Field label="Month, Year" error={cycleForm.formState.errors.month_year?.message} htmlFor="c-my" hint="e.g. May, 2026">
            <Input id="c-my" {...cycleForm.register('month_year', { required: 'Required' })} />
          </Field>
          <Field label="Start date" error={cycleForm.formState.errors.start_date?.message} htmlFor="c-start">
            <Input id="c-start" type="date" {...cycleForm.register('start_date', { required: 'Required' })} />
          </Field>
          <Field label="End date" error={cycleForm.formState.errors.end_date?.message} htmlFor="c-end">
            <Input id="c-end" type="date" {...cycleForm.register('end_date', { required: 'Required' })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCycleModal(false)}>Cancel</Button>
            <Button type="submit" loading={createCycle.isPending}>Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
