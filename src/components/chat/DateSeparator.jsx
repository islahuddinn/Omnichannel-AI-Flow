// src/components/chat/DateSeparator.jsx

'use client';

import { format, isToday, isYesterday } from 'date-fns';

export default function DateSeparator({ date }) {
  const getDateLabel = (date) => {
    if (isToday(date)) {
      return 'Today';
    }
    if (isYesterday(date)) {
      return 'Yesterday';
    }
    
    const now = new Date();
    const daysAgo = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (daysAgo < 7) {
      return format(date, 'EEEE'); // Monday, Tuesday, etc.
    }
    
    if (daysAgo < 365) {
      return format(date, 'MMM d'); // Jan 15
    }
    
    return format(date, 'MMM d, yyyy'); // Jan 15, 2025
  };
  
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2">
        {getDateLabel(date)}
      </span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}