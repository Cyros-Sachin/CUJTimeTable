'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Plus, KeyRound } from 'lucide-react';
import { useAdminUsers, useCreateUser, useUpdateUser, useResetPassword, useMeta } from '@/api/queries';
import type { AdminUser } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Chip } from '@/components/ui/Chip';
import { ddmmyyyy } from '@/lib/format';

interface FormValues { name: string; email: string; department_id: number }

export default function UsersAdminPage() {
  const list = useAdminUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const resetPassword = useResetPassword();
  const { data: meta } = useMeta();

  const [modalOpen, setModalOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  async function onSubmit(values: FormValues) {
    try {
      const res = await create.mutateAsync({ ...values, department_id: Number(values.department_id) });
      toast.success('Coordinator created');
      setTempPassword({ email: res.data.email, password: res.data.temp_password });
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Could not create user');
    }
  }

  async function toggleActive(user: AdminUser) {
    try {
      await update.mutateAsync({ id: user.id, body: { is_active: !user.is_active } });
      toast.success(user.is_active ? 'User deactivated' : 'User activated');
    } catch (err: any) {
      toast.error(err?.message || 'Could not update user');
    }
  }

  async function doReset(user: AdminUser) {
    try {
      const res = await resetPassword.mutateAsync(user.id);
      setTempPassword({ email: user.email, password: res.data.temp_password });
    } catch (err: any) {
      toast.error(err?.message || 'Could not reset password');
    }
  }

  const columns: Column<AdminUser>[] = [
    { key: 'name', header: 'Name', render: (u) => u.name },
    { key: 'email', header: 'Email', render: (u) => u.email },
    { key: 'role', header: 'Role', render: (u) => u.role === 'EXAM_CELL' ? 'Exam Cell' : 'Coordinator' },
    { key: 'dept', header: 'Department', render: (u) => u.department_name || '—' },
    { key: 'status', header: 'Status', render: (u) => (u.is_active ? <Chip kind="open">Active</Chip> : <Chip kind="neutral">Inactive</Chip>) },
    { key: 'last_login', header: 'Last login', render: (u) => u.last_login_at ? ddmmyyyy(u.last_login_at.slice(0, 10)) : '—' },
    {
      key: 'actions', header: '', render: (u) => u.role === 'DEPT_COORDINATOR' ? (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => toggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</Button>
          <Button variant="secondary" onClick={() => doReset(u)}><KeyRound size={14} className="mr-1" /> Reset password</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => { reset({ name: '', email: '', department_id: undefined as any }); setModalOpen(true); }}>
          <Plus size={16} className="mr-1" /> Add coordinator
        </Button>
      </div>
      {list.isLoading ? <Skeleton className="h-64 w-full" /> : (
        <DataTable columns={columns} rows={list.data || []} rowKey={(u) => u.id} emptyMessage="No users yet." />
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add department coordinator">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Name" error={errors.name?.message} htmlFor="u-name">
            <Input id="u-name" invalid={!!errors.name} {...register('name', { required: 'Required' })} />
          </Field>
          <Field label="Email" error={errors.email?.message} htmlFor="u-email">
            <Input id="u-email" type="email" invalid={!!errors.email} {...register('email', { required: 'Required' })} />
          </Field>
          <Field label="Department" error={errors.department_id?.message} htmlFor="u-dept">
            <Select id="u-dept" invalid={!!errors.department_id} {...register('department_id', { required: 'Required' })}>
              <option value="">Select department…</option>
              {meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!tempPassword} onClose={() => setTempPassword(null)} title="Temporary password">
        <p className="text-sm text-text">
          Share this temporary password with <strong>{tempPassword?.email}</strong>. They will be required to change it on first login.
        </p>
        <p className="mt-3 rounded border border-border bg-page px-3 py-2 font-mono text-sm">{tempPassword?.password}</p>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setTempPassword(null)}>Done</Button>
        </div>
      </Modal>
    </div>
  );
}
