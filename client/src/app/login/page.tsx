'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/auth/AuthContext';
import { useLogin } from '@/api/queries';
import { ApiError } from '@/api/types';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(user.must_change_password ? '/change-password' : '/');
    }
  }, [isLoading, user, router]);

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const res = await login.mutateAsync(values);
      toast.success(`Welcome, ${res.data.name}`);
      router.replace(res.data.must_change_password ? '/change-password' : '/');
    } catch (err) {
      if (err instanceof ApiError) setServerError(err.message);
      else setServerError('Login failed. Please try again.');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-md rounded bg-white p-8 shadow-subtle">
        <div className="mb-6 text-center">
          <p className="font-devanagari text-lg font-bold text-primary">जम्मू केंद्रीय विश्वविद्यालय</p>
          <h1 className="text-xl font-bold text-text">Central University of Jammu</h1>
          <p className="mt-1 text-sm text-muted">Exam Date Sheet Automation</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Field label="Email" error={errors.email?.message} htmlFor="email">
            <Input id="email" type="email" autoComplete="username" invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Password" error={errors.password?.message} htmlFor="password">
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                invalid={!!errors.password}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          {serverError ? <p className="text-sm text-danger" role="alert">{serverError}</p> : null}

          <Button type="submit" loading={login.isPending}>Log in</Button>
        </form>
      </div>
    </div>
  );
}
