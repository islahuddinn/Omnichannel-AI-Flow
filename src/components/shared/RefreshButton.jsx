// src/components/shared/RefreshButton.jsx
'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function RefreshButton({ onClick, isLoading }) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={isLoading}
    >
      <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
    </Button>
  );
}