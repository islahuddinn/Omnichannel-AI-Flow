// src/components/chat/UnreadBadge.jsx

'use client';

import { Badge } from '@/components/ui/badge';

export default function UnreadBadge({ count }) {
  if (!count || count === 0) return null;

  return (
    <Badge className="bg-primary text-primary-foreground text-xs font-semibold">
      {count > 99 ? '99+' : count}
    </Badge>
  );
}