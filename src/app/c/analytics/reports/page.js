// src/app/company-admin/admin/analytics/reports/page.js
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
// import { DatePickerWithRange } from '@/components/ui/date-range-picker'; // TODO: Create date-range-picker component
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date()
  });

  const reports = [
    {
      id: 'conversations',
      title: 'Conversation Report',
      description: 'Detailed breakdown of all conversations',
      icon: FileText
    },
    {
      id: 'messages',
      title: 'Message Volume Report',
      description: 'Message statistics by channel and time',
      icon: FileText
    },
    {
      id: 'agents',
      title: 'Agent Performance Report',
      description: 'Individual agent metrics and KPIs',
      icon: FileText
    }
  ];

  const handleDownload = async (reportType) => {
    try {
      const response = await apiClient.post('/analytics/export', {
        type: reportType,
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        format: 'csv'
      });

      // Create download link
      const blob = new Blob([response.data.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.data.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Report downloaded successfully');
    } catch (error) {
      toast.error('Failed to download report');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Reports
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Generate and download detailed reports
          </p>
        </div>
        {/* TODO: Add date range picker component */}
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {dateRange.from.toLocaleDateString()} - {dateRange.to.toLocaleDateString()}
        </div>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {reports.map((report) => (
          <Card key={report.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <report.icon className="h-8 w-8 text-indigo-600" />
                <CardTitle>{report.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {report.description}
              </p>
              <Button
                onClick={() => handleDownload(report.id)}
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}