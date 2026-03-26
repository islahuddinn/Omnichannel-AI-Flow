// src/components/shared/ExportButton.jsx
'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export default function ExportButton({ onClick, isLoading, children = 'Export' }) {
  return (
    <Button onClick={onClick} disabled={isLoading} variant="outline">
      <Download className="mr-2 h-4 w-4" />
      {isLoading ? 'Exporting...' : children}
    </Button>
  );
}