'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { programsApi, useMeta } from '@/api/queries';
import type { Program } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';

interface FormValues { department_id: number; code: string; name: string; total_semesters: number }

export default function ProgramsAdminPage() {
  const list = programsApi.useList();
  const create = programsApi.useCreate();
  const update = programsApi.useUpdate();
  const remove = programsApi.useDelete();
  const { data: meta } = useMeta();

  const [editing, setEditing] = useState<Program | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Program | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  function openCreate() { setEditing(null); reset({ department_id: undefined as any, code: '', name: '', total_semesters: 4 }); setModalOpen(true); }
  function openEdit(p: Program) { setEditing(p); reset({ department_id: p.department_id, code: p.code, name: p.name, total_semesters: p.total_semesters }); setModalOpen(true); }

  async function onSubmit(values: FormValues) {
    try {
      const body = { ...values, department_id: Number(values.department_id), total_semesters: Number(values.total_semesters) };
      if (editing) await update.mutateAsync({ id: editing.id, body });
      else await create.mutateAsync(body);
      toast.success(editing ? 'Program updated' : 'Program created');
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save program');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success('Program removed');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete program');
    }
  }

  const columns: Column<Program>[] = [
    { key: 'code', header: 'Code', render: (p) => p.code },
    { key: 'name', header: 'Name', render: (p) => p.name },
    { key: 'dept', header: 'Department', render: (p) => p.department_name },
    { key: 'sem', header: 'Semesters', render: (p) => p.total_semesters },
    {
      key: 'actions', header: '', render: (p) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => openEdit(p)} className="text-muted hover:text-primary" aria-label="Edit"><Pencil size={16} /></button>
          <button type="button" onClick={() => setDeleteTarget(p)} className="text-muted hover:text-danger" aria-label="Delete"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus size={16} className="mr-1" /> Add program</Button>
      </div>
      {list.isLoading ? <Skeleton className="h-64 w-full" /> : (
        <DataTable columns={columns} rows={list.data || []} rowKey={(p) => p.id} emptyMessage="No programs yet." />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit program' : 'Add program'}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Department" error={errors.department_id?.message} htmlFor="p-dept">
            <Select id="p-dept" invalid={!!errors.department_id} {...register('department_id', { required: 'Required' })}>
              <option value="">Select department…</option>
              {meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Code" error={errors.code?.message} htmlFor="p-code">
            <Input id="p-code" invalid={!!errors.code} {...register('code', { required: 'Required' })} />
          </Field>
          <Field label="Name" error={errors.name?.message} htmlFor="p-name">
            <Input id="p-name" invalid={!!errors.name} {...register('name', { required: 'Required' })} />
          </Field>
          <Field label="Total semesters" error={errors.total_semesters?.message} htmlFor="p-sem">
            <Input id="p-sem" type="number" min={1} max={20} invalid={!!errors.total_semesters} {...register('total_semesters', { required: 'Required' })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove program"
        message={`"${deleteTarget?.name}" will be deactivated if it has exam entries, or deleted otherwise.`}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
