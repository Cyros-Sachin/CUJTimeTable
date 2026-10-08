'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { timeSlotsApi } from '@/api/queries';
import type { TimeSlot } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';

interface FormValues { label: string; start_time: string; end_time: string }

export default function TimeSlotsAdminPage() {
  const list = timeSlotsApi.useList();
  const create = timeSlotsApi.useCreate();
  const update = timeSlotsApi.useUpdate();
  const remove = timeSlotsApi.useDelete();

  const [editing, setEditing] = useState<TimeSlot | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimeSlot | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  function openCreate() { setEditing(null); reset({ label: '', start_time: '10:00', end_time: '13:00' }); setModalOpen(true); }
  function openEdit(t: TimeSlot) { setEditing(t); reset({ label: t.label, start_time: t.start_time.slice(0, 5), end_time: t.end_time.slice(0, 5) }); setModalOpen(true); }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body: values });
      else await create.mutateAsync(values);
      toast.success(editing ? 'Time slot updated' : 'Time slot created');
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save time slot');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success('Time slot removed');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete time slot');
    }
  }

  const columns: Column<TimeSlot>[] = [
    { key: 'label', header: 'Label', render: (t) => t.label },
    { key: 'start', header: 'Start', render: (t) => t.start_time },
    { key: 'end', header: 'End', render: (t) => t.end_time },
    {
      key: 'actions', header: '', render: (t) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => openEdit(t)} className="text-muted hover:text-primary" aria-label="Edit"><Pencil size={16} /></button>
          <button type="button" onClick={() => setDeleteTarget(t)} className="text-muted hover:text-danger" aria-label="Delete"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus size={16} className="mr-1" /> Add time slot</Button>
      </div>
      {list.isLoading ? <Skeleton className="h-64 w-full" /> : (
        <DataTable columns={columns} rows={list.data || []} rowKey={(t) => t.id} emptyMessage="No time slots yet." />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit time slot' : 'Add time slot'}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Label" error={errors.label?.message} htmlFor="t-label" hint="e.g. 2:00PM-5:00PM">
            <Input id="t-label" invalid={!!errors.label} {...register('label', { required: 'Required' })} />
          </Field>
          <Field label="Start time" error={errors.start_time?.message} htmlFor="t-start">
            <Input id="t-start" type="time" invalid={!!errors.start_time} {...register('start_time', { required: 'Required' })} />
          </Field>
          <Field label="End time" error={errors.end_time?.message} htmlFor="t-end">
            <Input id="t-end" type="time" invalid={!!errors.end_time} {...register('end_time', { required: 'Required' })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove time slot"
        message={`"${deleteTarget?.label}" will be deactivated if used by entries, or deleted otherwise.`}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
