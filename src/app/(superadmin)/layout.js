// src/app/(superadmin)/layout.js
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useUserStore from '@/store/useUserStore';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import SuperAdminLayout from '@/components/layouts/SuperAdminLayout';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function SuperAdminRouteLayout({ children }) {
  const router = useRouter();
  const { user, isAuthenticated } = useUserStore();
  const [isChecking, setIsChecking] = useState(true);

  // Proactively refresh token to prevent session expiry
  useTokenRefresh();

  useEffect(() => {
    // Wait for store to hydrate from localStorage
    const timer = setTimeout(() => {
      setIsChecking(false);
      
      // Only redirect if we're sure user is not authenticated
      // Middleware will handle the actual protection
      if (!isAuthenticated || (user && user.role !== 'super_admin')) {
        // Don't redirect here - let middleware handle it
        // This prevents redirect loops on refresh
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isAuthenticated, user, router]);

  // Show loading while checking
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // If user is authenticated and is super admin, show layout
  // Otherwise, middleware will handle redirect
  if (isAuthenticated && user?.role === 'super_admin') {
    return <SuperAdminLayout>{children}</SuperAdminLayout>;
  }

  // Show loading while middleware redirects
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-950">
      <LoadingSpinner size="lg" />
    </div>
  );
}