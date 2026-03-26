'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw, Signal } from 'lucide-react';

export default function OfflineOverlay() {
  const [isOffline, setIsOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const reconnectTimerRef = useRef(null);

  // Clear reconnect timer on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  const handleOnline = useCallback(() => {
    setIsOffline(false);
    if (wasOffline) {
      setShowReconnected(true);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => setShowReconnected(false), 3000);
    }
    setWasOffline(false);
    setIsRetrying(false);
  }, [wasOffline]);

  const handleOffline = useCallback(() => {
    setIsOffline(true);
    setWasOffline(true);
  }, []);

  useEffect(() => {
    // Set initial state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOffline(true);
      setWasOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      // Try to reach a lightweight endpoint to verify real connectivity
      await fetch('/api/health', { method: 'HEAD', cache: 'no-store' }).catch(() => {});
      // Even if the fetch fails, check navigator.onLine as a fallback
      if (navigator.onLine) {
        handleOnline();
      } else {
        setIsRetrying(false);
      }
    } catch {
      setIsRetrying(false);
    }
  };

  return (
    <>
      {/* Offline overlay - blocks entire app */}
      <AnimatePresence>
        {isOffline && (
          <>
            {/* Full-screen semi-transparent backdrop that blocks all interaction */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[99998]"
              aria-hidden="true"
            />

            {/* Toast-style notification pinned to bottom-left */}
            <motion.div
              initial={{ x: -100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -100, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-6 left-6 z-[99999] w-[380px] max-w-[calc(100vw-3rem)]"
              role="alert"
              aria-live="assertive"
            >
              <div className="bg-card rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Red accent bar */}
                <div className="h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />

                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Animated icon */}
                    <div className="shrink-0">
                      <div className="h-11 w-11 rounded-full bg-red-50 dark:bg-red-950/50 flex items-center justify-center">
                        <motion.div
                          animate={{ scale: [1, 1.15, 1] }}
                          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                        >
                          <WifiOff className="h-5 w-5 text-red-500" />
                        </motion.div>
                      </div>
                    </div>

                    {/* Message */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">
                        No Internet Connection
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Please check your network connection. The app will resume automatically once you&apos;re back online.
                      </p>

                      {/* Retry button */}
                      <button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="mt-3 inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                        {isRetrying ? 'Checking...' : 'Try Again'}
                      </button>
                    </div>
                  </div>

                  {/* Pulsing dot indicator */}
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Waiting for connection...
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Reconnected toast */}
      <AnimatePresence>
        {showReconnected && !isOffline && (
          <motion.div
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-6 left-6 z-[99999] w-[340px] max-w-[calc(100vw-3rem)]"
            role="status"
            aria-live="polite"
          >
            <div className="bg-card rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-500" />
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-green-50 dark:bg-green-950/50 flex items-center justify-center shrink-0">
                    <Signal className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Back Online
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Your connection has been restored.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
