// src/app/company-admin/admin/settings/notifications/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationSettingsForm from '@/components/forms/NotificationSettingsForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function NotificationsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put('/companies/current/notifications', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['company-settings']);
      toast.success('Notification settings updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update notifications');
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
            Notification Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage how you receive notifications
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <NotificationSettingsForm
          onSubmit={(data) => updateMutation.mutate(data)}
          isLoading={updateMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}