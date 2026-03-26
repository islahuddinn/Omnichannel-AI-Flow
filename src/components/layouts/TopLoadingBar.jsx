'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import useLoadingStore from '@/store/useLoadingStore';
import './TopLoadingBar.css';

function TopLoadingBarContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const { isLoading: storeLoading, startLoading, finishLoading } = useLoadingStore();
  const timersRef = useRef([]);
  const prevPathnameRef = useRef(pathname);
  const originalPushRef = useRef(null);
  const originalReplaceRef = useRef(null);

  // Clear all timers helper
  const clearAllTimers = () => {
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current = [];
  };

  // Start loading animation
  const startLoadingBar = () => {
    clearAllTimers();
    setIsVisible(true);
    setProgress(0);
    startLoading();
    
    // Start progressive loading
    timersRef.current.push(setTimeout(() => setProgress(30), 100));
    timersRef.current.push(setTimeout(() => setProgress(60), 300));
    timersRef.current.push(setTimeout(() => setProgress(80), 500));
    timersRef.current.push(setTimeout(() => setProgress(90), 700));
  };

  // Intercept router.push and router.replace
  useEffect(() => {
    if (!router) return;

    // Store original methods
    if (!originalPushRef.current) {
      originalPushRef.current = router.push;
      originalReplaceRef.current = router.replace;
    }

    // Override push
    router.push = function(href, options) {
      const currentPath = window.location.pathname + window.location.search;
      const targetPath = typeof href === 'string' ? href : href.pathname || '';
      
      if (targetPath && targetPath !== currentPath && !targetPath.startsWith('http')) {
        startLoadingBar();
      }
      
      return originalPushRef.current.call(this, href, options);
    };

    // Override replace
    router.replace = function(href, options) {
      const currentPath = window.location.pathname + window.location.search;
      const targetPath = typeof href === 'string' ? href : href.pathname || '';
      
      if (targetPath && targetPath !== currentPath && !targetPath.startsWith('http')) {
        startLoadingBar();
      }
      
      return originalReplaceRef.current.call(this, href, options);
    };

    return () => {
      // Restore original methods on cleanup
      if (originalPushRef.current) {
        router.push = originalPushRef.current;
      }
      if (originalReplaceRef.current) {
        router.replace = originalReplaceRef.current;
      }
    };
  }, [router]);

  // Listen for navigation clicks globally
  useEffect(() => {
    const handleClick = (e) => {
      const target = e.target.closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      
      const currentPath = window.location.pathname + window.location.search;
      const isExternal = target.target === '_blank';
      
      if (!isExternal && href !== currentPath && href !== '#') {
        startLoadingBar();
      }
    };

    document.addEventListener('click', handleClick, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      clearAllTimers();
    };
  }, []);

  // Handle route change completion
  useEffect(() => {
    // Check if pathname actually changed
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      
      if (isVisible) {
        clearAllTimers();
        setProgress(100);
        
        const timer = setTimeout(() => {
          setIsVisible(false);
          setProgress(0);
        }, 300);
        
        timersRef.current.push(timer);
      }
      
      if (storeLoading) {
        finishLoading();
      }
    }
  }, [pathname, searchParams, isVisible, storeLoading, finishLoading]);

  if (!isVisible) return null;

  return (
    <div className="top-loading-bar">
      <div 
        className="top-loading-bar-progress" 
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default function TopLoadingBar() {
  return (
    <Suspense fallback={null}>
      <TopLoadingBarContent />
    </Suspense>
  );
}

