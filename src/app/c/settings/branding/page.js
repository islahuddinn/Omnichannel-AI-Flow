// src/app/company-admin/admin/settings/branding/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandingSettings from '@/components/panels/company-admin/BrandingSettings';
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';

export default function BrandingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: settings, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get('/companies/current')
  });

  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put('/companies/current/branding', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['company-settings']);
      toast.success('Branding settings updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update branding');
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Failed to load branding settings</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {error?.message || 'Unable to fetch settings. Please try again.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

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
            Branding Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Customize your company&apos;s visual identity
          </p>
        </div>
      </div>

      {/* Settings Component */}
      <div className="max-w-4xl">
        <BrandingSettings
          initialData={settings?.data?.branding}
          onSave={(data) => updateMutation.mutate(data)}
          isLoading={updateMutation.isPending}
        />
      </div>
    </div>
  );
}