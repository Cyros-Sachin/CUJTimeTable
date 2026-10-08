'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import type { Role } from '@/api/types';
import { Skeleton } from '@/components/ui/Skeleton';

export function RequireAuth({ children, role }: { children: ReactNode; role?: Role }) {
  const { user, isLoading, isError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !user) {
      router.replace('/login');
      return;
    }
    if (user.must_change_password) {
      router.replace('/change-password');
      return;
    }
    if (role && user.role !== role) {
      router.replace('/');
    }
  }, [isLoading, isError, user, role, router]);

  if (isLoading || !user || user.must_change_password || (role && user.role !== role)) {
    return (
      <div className="p-8">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
