// src/app/global-error.js
'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error('Global Error:', error);
  }, [error]);

  return (
    <html className={inter.className}>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="max-w-md w-full p-8 bg-white dark:bg-gray-800 rounded-lg shadow-2xl">
            <div className="text-center">
              <div className="text-6xl mb-4">🚨</div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Critical Error
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                A critical error occurred. The application needs to restart.
              </p>
              <button
                onClick={reset}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
              >
                Restart Application
              </button>
              <p className="mt-4 text-sm text-gray-500">
                If the problem persists, please clear your browser cache.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}