'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { subjectTypesApi } from '@/api/queries';
import type { SubjectType } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';

interface FormValues { name: string }

export default function SubjectTypesAdminPage() {
  const list = subjectTypesApi.useList();
  const create = subjectTypesApi.useCreate();
  const update = subjectTypesApi.useUpdate();
  const remove = subjectTypesApi.useDelete();

  const [editing, setEditing] = useState<SubjectType | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SubjectType | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  function openCreate() { setEditing(null); reset({ name: '' }); setModalOpen(true); }
  function openEdit(s: SubjectType) { setEditing(s); reset({ name: s.name }); setModalOpen(true); }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) await update.mutateAsync({ id: editing.id, body: values });
      else await create.mutateAsync(values);
      toast.success(editing ? 'Subject type updated' : 'Subject type created');
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not save subject type');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await remove.mutateAsync(deleteTarget.id);
      toast.success('Subject type removed');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Could not delete subject type');
    }
  }

  const columns: Column<SubjectType>[] = [
    { key: 'name', header: 'Name', render: (s) => s.name },
    {
      key: 'actions', header: '', render: (s) => (
        <div className="flex gap-2">
          <button type="button" onClick={() => openEdit(s)} className="text-muted hover:text-primary" aria-label="Edit"><Pencil size={16} /></button>
          <button type="button" onClick={() => setDeleteTarget(s)} className="text-muted hover:text-danger" aria-label="Delete"><Trash2 size={16} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}><Plus size={16} className="mr-1" /> Add subject type</Button>
      </div>
      {list.isLoading ? <Skeleton className="h-64 w-full" /> : (
        <DataTable columns={columns} rows={list.data || []} rowKey={(s) => s.id} emptyMessage="No subject types yet." />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit subject type' : 'Add subject type'}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Name" error={errors.name?.message} htmlFor="st-name">
            <Input id="st-name" invalid={!!errors.name} {...register('name', { required: 'Required' })} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>Save</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove subject type"
        message={`"${deleteTarget?.name}" will be deactivated if used by entries, or deleted otherwise.`}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
