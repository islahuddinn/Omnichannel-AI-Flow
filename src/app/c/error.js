// src/app/c/error.js
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, RefreshCw, ArrowLeft, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function CError({ error, reset }) {
  const router = useRouter();

  useEffect(() => {
    Sentry.captureException(error);
    console.error('[App Error]', error);

    // Auto-redirect on auth errors
    if (
      error?.message?.includes('401') ||
      error?.message?.toLowerCase()?.includes('unauthorized')
    ) {
      toast.error('Session expired', { description: 'Please log in again.' });
      router.push('/auth/login');
    }
  }, [error, router]);

  const getErrorInfo = () => {
    const msg = error?.message?.toLowerCase() || '';

    if (msg.includes('fetch') || msg.includes('network') || msg.includes('aborterror')) {
      return {
        title: 'Connection Problem',
        description: 'Unable to reach the server. Check your internet connection and try again.',
      };
    }
    if (msg.includes('403') || msg.includes('forbidden')) {
      return {
        title: 'Access Denied',
        description: "You don't have permission to view this page.",
      };
    }
    if (msg.includes('404') || msg.includes('not found')) {
      return {
        title: 'Not Found',
        description: 'The page or resource you requested could not be found.',
      };
    }
    if (msg.includes('500') || msg.includes('server')) {
      return {
        title: 'Server Error',
        description: 'Something went wrong on our end. Please try again in a moment.',
      };
    }
    return {
      title: 'Something went wrong',
      description: 'An unexpected error occurred. Please try again.',
    };
  };

  const info = getErrorInfo();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">{info.title}</h2>
          <p className="text-sm text-muted-foreground">{info.description}</p>
        </div>

        {process.env.NODE_ENV === 'development' && error?.message && (
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-left">
            <p className="text-xs font-mono text-muted-foreground break-all">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button size="sm" onClick={() => reset()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push('/c/dashboard')}>
            <Home className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
