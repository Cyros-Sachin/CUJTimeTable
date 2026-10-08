'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/auth/AuthContext';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}
