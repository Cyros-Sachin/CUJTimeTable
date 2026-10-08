'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { User } from '@/api/types';
import { useMe } from '@/api/queries';

interface AuthContextValue {
  user: User | undefined;
  isLoading: boolean;
  isError: boolean;
}

const AuthContext = createContext<AuthContextValue>({ user: undefined, isLoading: true, isError: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();
  return (
    <AuthContext.Provider value={{ user: data, isLoading, isError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
