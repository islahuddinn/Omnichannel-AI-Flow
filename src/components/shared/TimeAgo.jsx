// src/components/shared/TimeAgo.jsx
'use client';

import { formatDistanceToNow } from 'date-fns';

export default function TimeAgo({ date }) {
  if (!date) return null;

  return (
    <span className="text-xs text-gray-500">
      {formatDistanceToNow(new Date(date), { addSuffix: true })}
    </span>
  );
}