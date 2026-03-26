
// src/components/chat/MergeIndicator.jsx
'use client';

import { Link } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function MergeIndicator({ count }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded text-xs font-semibold text-blue-700 dark:text-blue-400">
            <Link className="h-3 w-3" />
            {count}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Merged with {count} other conversation{count > 1 ? 's' : ''}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}