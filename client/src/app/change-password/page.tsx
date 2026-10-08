'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { useAuth } from '@/auth/AuthContext';
import { useChangePassword } from '@/api/queries';
import { ApiError } from '@/api/types';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useQueryClient } from '@tanstack/react-query';

const schema = z.object({
  current_password: z.string().min(1, 'Required'),
  new_password: z.string()
    .min(10, 'At least 10 characters')
    .regex(/[A-Za-z]/, 'Must contain a letter')
    .regex(/[0-9]/, 'Must contain a digit'),
  confirm_password: z.string(),
}).refine((v) => v.new_password === v.confirm_password, { message: 'Passwords do not match', path: ['confirm_password'] });

type FormValues = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const changePassword = useChangePassword();
  const qc = useQueryClient();

  const { register, handleSubmit, formState: { errors }, setError } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  async function onSubmit(values: FormValues) {
    try {
      await changePassword.mutateAsync({ current_password: values.current_password, new_password: values.new_password });
      toast.success('Password changed. You can continue now.');
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.replace('/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields?.current_password) setError('current_password', { message: err.fields.current_password });
        else toast.error(err.message);
      }
    }
  }

  if (isLoading || !user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-md rounded bg-white p-8 shadow-subtle">
        <h1 className="mb-1 text-xl font-bold text-text">Set a new password</h1>
        <p className="mb-6 text-sm text-muted">
          {user.must_change_password ? 'For security, you must change your password before continuing.' : 'Update your password below.'}
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Current password" error={errors.current_password?.message} htmlFor="current_password">
            <Input id="current_password" type="password" autoComplete="current-password" invalid={!!errors.current_password} {...register('current_password')} />
          </Field>
          <Field label="New password" error={errors.new_password?.message} hint="At least 10 characters with a letter and a digit." htmlFor="new_password">
            <Input id="new_password" type="password" autoComplete="new-password" invalid={!!errors.new_password} {...register('new_password')} />
          </Field>
          <Field label="Confirm new password" error={errors.confirm_password?.message} htmlFor="confirm_password">
            <Input id="confirm_password" type="password" autoComplete="new-password" invalid={!!errors.confirm_password} {...register('confirm_password')} />
          </Field>
          <Button type="submit" loading={changePassword.isPending}>Save password</Button>
        </form>
      </div>
    </div>
  );
}
