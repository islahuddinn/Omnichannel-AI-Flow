// src/app/company-admin/admin/analytics/exports/page.js
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calendar, Clock } from 'lucide-react';
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { formatDistanceToNow } from 'date-fns';

export default function ExportsPage() {
  const { data: exports, isLoading } = useQuery({
    queryKey: ['exports-history'],
    queryFn: () => apiClient.get('/analytics/exports-history'),
    enabled: false // Implement this endpoint if needed
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Export History
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          View and download previously generated exports
        </p>
      </div>

      {/* Coming Soon Message */}
      <Card>
        <CardContent className="py-12 text-center">
          <Download className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Export History</h3>
          <p className="text-gray-600 dark:text-gray-400">
            Your export history will appear here once you generate reports from the Reports page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}