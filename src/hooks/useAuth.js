// src/hooks/useAuth.js
'use client';

import useUserStore from '@/store/useUserStore';

export function useAuth() {
  const user = useUserStore((state) => state.user);
  const isLoading = useUserStore((state) => state.isLoading);
  const login = useUserStore((state) => state.login);
  const logout = useUserStore((state) => state.logout);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout
  };
}