// src/components/shared/NavigationLink.jsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useLoadingStore from '@/store/useLoadingStore';

export default function NavigationLink({ 
  href, 
  children, 
  replace = false,
  scroll = true,
  prefetch = true,
  ...props 
}) {
  const router = useRouter();
  const { startLoading } = useLoadingStore();

  const handleClick = (e) => {
    // If it's an external link or has target="_blank", let it proceed normally
    if (props.target === '_blank' || href.startsWith('http')) {
      return;
    }

    // Check if it's a different route
    const currentPath = window.location.pathname + window.location.search;
    const targetPath = href;
    
    if (currentPath !== targetPath) {
      e.preventDefault();
      startLoading();
      
      // Small delay to ensure loading bar renders before navigation
      setTimeout(() => {
        if (replace) {
          router.replace(href, { scroll });
        } else {
          router.push(href, { scroll });
        }
      }, 10);
    }
  };

  return (
    <Link 
      href={href} 
      onClick={handleClick}
      prefetch={prefetch}
      {...props}
    >
      {children}
    </Link>
  );
}
