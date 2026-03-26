// src/app/company-admin/admin/settings/business-hours/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BusinessHoursForm from '@/components/forms/BusinessHoursForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function BusinessHoursPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put('/companies/current/business-hours', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['company-settings']);
      toast.success('Business hours updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update business hours');
    }
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Business Hours
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure your operating hours and timezone
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <BusinessHoursForm
          onSubmit={(data) => updateMutation.mutate(data)}
          isLoading={updateMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}