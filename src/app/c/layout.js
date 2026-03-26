// src/app/c/layout.js
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import SharedLayout from '@/components/layouts/SharedLayout';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function SharedLayoutWrapper({ children }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);

  // Proactively refresh token to prevent session expiry
  useTokenRefresh();

  useEffect(() => {
    // Wait for store to hydrate from localStorage
    const timer = setTimeout(() => {
      setIsChecking(false);
      // Middleware will handle authentication and redirects
    }, 100);

    return () => clearTimeout(timer);
  }, [user, isLoading, router]);

  // Show loading while checking or while auth is loading
  if (isLoading || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // If user is authenticated and has correct role, show layout
  // Otherwise, middleware will handle redirect
  if (user && ['agent', 'company_admin'].includes(user.role)) {
  return <SharedLayout role={user.role}>{children}</SharedLayout>;
  }

  // Show loading while middleware redirects
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <LoadingSpinner size="lg" />
    </div>
  );
}