// src/app/error.js
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { AlertTriangle, Home, RefreshCw, Bug, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function Error({ error, reset }) {
  const router = useRouter();

  useEffect(() => {
    // Report error to Sentry
    Sentry.captureException(error);
    console.error('Application Error:', error);
  }, [error]);

  // Determine error type and message
  const getErrorInfo = () => {
    // Network errors
    if (error?.message?.includes('fetch')) {
      return {
        title: 'Network Error',
        description: 'Unable to connect to the server. Please check your internet connection.',
        icon: '🌐',
        type: 'network'
      };
    }

    // API errors
    if (error?.message?.includes('401') || error?.message?.includes('unauthorized')) {
      return {
        title: 'Authentication Error',
        description: 'Your session has expired. Please log in again.',
        icon: '🔐',
        type: 'auth'
      };
    }

    if (error?.message?.includes('403') || error?.message?.includes('forbidden')) {
      return {
        title: 'Access Denied',
        description: "You don't have permission to access this resource.",
        icon: '🚫',
        type: 'permission'
      };
    }

    if (error?.message?.includes('404') || error?.message?.includes('not found')) {
      return {
        title: 'Not Found',
        description: 'The requested resource could not be found.',
        icon: '🔍',
        type: 'notfound'
      };
    }

    if (error?.message?.includes('500') || error?.message?.includes('server')) {
      return {
        title: 'Server Error',
        description: 'An error occurred on the server. Our team has been notified.',
        icon: '🖥️',
        type: 'server'
      };
    }

    // Database errors
    if (error?.message?.includes('database') || error?.message?.includes('mongodb')) {
      return {
        title: 'Database Error',
        description: 'Unable to connect to the database. Please try again later.',
        icon: '🗄️',
        type: 'database'
      };
    }

    // Validation errors
    if (error?.message?.includes('validation') || error?.message?.includes('invalid')) {
      return {
        title: 'Validation Error',
        description: 'The provided data is invalid. Please check your input.',
        icon: '📝',
        type: 'validation'
      };
    }

    // Default error
    return {
      title: 'Something went wrong',
      description: 'An unexpected error occurred. Please try again.',
      icon: '⚠️',
      type: 'unknown'
    };
  };

  const errorInfo = getErrorInfo();
  const isDevelopment = process.env.NODE_ENV === 'development';

  const handleGoHome = () => {
    router.push('/');
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleReset = () => {
    reset();
  };

  // Special handling for auth errors
  if (errorInfo.type === 'auth') {
    router.push('/auth/login');
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-2xl">
        <Card className="shadow-2xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="mx-auto mb-4 text-6xl animate-pulse">
              {errorInfo.icon}
            </div>
            <CardTitle className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {errorInfo.title}
            </CardTitle>
            <CardDescription className="text-lg mt-2 text-gray-600 dark:text-gray-400">
              {errorInfo.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error details for development mode */}
            {isDevelopment && error?.message && (
              <Alert variant="destructive" className="font-mono text-sm">
                <Bug className="h-4 w-4" />
                <AlertTitle>Error Details (Development Mode)</AlertTitle>
                <AlertDescription className="mt-2 break-all">
                  {error.message}
                </AlertDescription>
                {error?.stack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs hover:underline">
                      View Stack Trace
                    </summary>
                    <pre className="mt-2 text-xs overflow-auto max-h-40 bg-black/10 dark:bg-white/10 p-2 rounded">
                      {error.stack}
                    </pre>
                  </details>
                )}
              </Alert>
            )}

            {/* Helpful tips based on error type */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                What you can try:
              </h3>
              <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
                {errorInfo.type === 'network' && (
                  <>
                    <li>• Check your internet connection</li>
                    <li>• Try disabling browser extensions</li>
                    <li>• Clear your browser cache</li>
                  </>
                )}
                {errorInfo.type === 'permission' && (
                  <>
                    <li>• Verify you have the necessary permissions</li>
                    <li>• Contact your administrator</li>
                    <li>• Try logging out and back in</li>
                  </>
                )}
                {errorInfo.type === 'server' && (
                  <>
                    <li>• Wait a few moments and try again</li>
                    <li>• Check our status page for updates</li>
                    <li>• Contact support if the issue persists</li>
                  </>
                )}
                {errorInfo.type === 'database' && (
                  <>
                    <li>• The issue is likely temporary</li>
                    <li>• Try again in a few moments</li>
                    <li>• Contact support if the issue persists</li>
                  </>
                )}
                {errorInfo.type === 'validation' && (
                  <>
                    <li>• Check all required fields are filled</li>
                    <li>• Ensure data formats are correct</li>
                    <li>• Review any error messages on the form</li>
                  </>
                )}
                {errorInfo.type === 'unknown' && (
                  <>
                    <li>• Refresh the page</li>
                    <li>• Clear your browser cache</li>
                    <li>• Try again later</li>
                  </>
                )}
              </ul>
            </div>

            {/* Error ID for support reference */}
            <div className="text-center text-xs text-gray-500 dark:text-gray-400">
              Error ID: {Date.now().toString(36).toUpperCase()}
              <br />
              Timestamp: {new Date().toLocaleString()}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6">
            <Button
              onClick={handleGoBack}
              variant="outline"
              className="flex-1"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go Back
            </Button>
            <Button
              onClick={handleReset}
              variant="default"
              className="flex-1"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Try Again
            </Button>
            <Button
              onClick={handleGoHome}
              variant="secondary"
              className="flex-1"
            >
              <Home className="mr-2 h-4 w-4" />
              Go Home
            </Button>
          </CardFooter>
        </Card>

        {/* Additional help section */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Need help? {' '}
            <a 
              href="/support" 
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              Contact Support
            </a>
            {' '} or {' '}
            <a 
              href="/docs" 
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              Check Documentation
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}