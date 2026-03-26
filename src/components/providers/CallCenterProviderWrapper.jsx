'use client';

import { usePathname } from 'next/navigation';
import { CallCenterProvider } from '@/components/call-center/CallCenterProvider';

export default function CallCenterProviderWrapper({ children }) {
  const pathname = usePathname();
  
  // ✅ Don't initialize call center on public/auth pages
  const isPublicPage = pathname?.startsWith('/auth/') || 
                      pathname === '/auth/login' ||
                      pathname === '/auth/forgot-password' ||
                      pathname === '/auth/reset-password' ||
                      pathname === '/auth/verify-otp' ||
                      pathname === '/webchat';
  
  // On public pages, just render children without CallCenterProvider
  if (isPublicPage) {
    return <>{children}</>;
  }
  
  return (
    <CallCenterProvider>
      {children}
    </CallCenterProvider>
  );
}
