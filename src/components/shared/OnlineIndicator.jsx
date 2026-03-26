// src/components/shared/OnlineIndicator.jsx
'use client';

import { cn } from '@/lib/utils';

export default function OnlineIndicator({ status, className = '' }) {
  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-gray-400',
    away: 'bg-yellow-500',
    busy: 'bg-red-500'
  };

  return (
    <span
      className={cn(
        'w-3 h-3 rounded-full border-2 border-white',
        statusColors[status] || statusColors.offline,
        className
      )}
    />
  );
}