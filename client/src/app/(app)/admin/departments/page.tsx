'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { departmentsApi } from '@/api/queries';
import type { Department } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Chip';

interface FormValues { code: string; name: string }

export default function DepartmentsAdminPage() {
  const list = departmentsApi.useList();
  const create = departmentsApi.useCreate();
  const update = departmentsApi.useUpdate();
  const remove = departmentsApi.useDelete();

  const [editing, setEditing] = useState<Department | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  function openCreate() { setEditing(null); reset({ code: '', name: '' }); setModalOpen(true); }
  function openEdit(d: Department) { setEditing(d); reset({ code: d.code, name: d.name }); setModalOpen(true); }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body: values });
      else await create.mutateAsync(values);
      toast.success(editing ? 'Department updated' : 'Department created');
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save department');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success('Department removed');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete department');
    }
  }

  const columns: Column<Department>[] = [
    { key: 'code', header: 'Code', render: (d) => d.code },
    { key: 'name', header: 'Name', render: (d) => d.name },
    { key: 'status', header: 'Status', render: (d) => (d.is_active === false ? <Chip kind="neutral">Inactive</Chip> : <Chip kind="open">Active</Chip>) },
    {
      key: 'actions', header: '', render: (d) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => openEdit(d)} className="text-muted hover:text-primary" aria-label="Edit"><Pencil size={16} /></button>
          <button type="button" onClick={() => setDeleteTarget(d)} className="text-muted hover:text-danger" aria-label="Delete"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus size={16} className="mr-1" /> Add department</Button>
      </div>
      {list.isLoading ? <Skeleton className="h-64 w-full" /> : (
        <DataTable columns={columns} rows={list.data || []} rowKey={(d) => d.id} emptyMessage="No departments yet." />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit department' : 'Add department'}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Code" error={errors.code?.message} htmlFor="d-code">
            <Input id="d-code" invalid={!!errors.code} {...register('code', { required: 'Required' })} />
          </Field>
          <Field label="Name" error={errors.name?.message} htmlFor="d-name">
            <Input id="d-name" invalid={!!errors.name} {...register('name', { required: 'Required' })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove department"
        message={`"${deleteTarget?.name}" will be deactivated if it has programs, or deleted otherwise.`}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
