// src/app/company-admin/admin/channels/sms/setup/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SMSSetupForm from '@/components/forms/SMSSetupForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function SMSSetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const setupMutation = useMutation({
    mutationFn: async (data) => {
      const channelResponse = await apiClient.post('/channels', {
        type: data.type,
        name: data.name,
        identifier: data.identifier,
        departmentIds: data.departmentIds,
        credentials: data.credentials
      });

      if (data.aiPrompts && channelResponse.data?._id) {
        const channelId = channelResponse.data._id;
        const prompts = [];

        if (data.aiPrompts.customerPrompt) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'sms-customer-prompt',
            prompt: data.aiPrompts.customerPrompt,
            name: 'SMS Customer Prompt'
          });
        }

        if (data.aiPrompts.handymanPrompt) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'sms-handyman-prompt',
            prompt: data.aiPrompts.handymanPrompt,
            name: 'SMS Handyman Prompt'
          });
        }

        if (prompts.length > 0) {
          await apiClient.post('/ai-prompts/batch', { prompts });
        }
      }

      return channelResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['channels']);
      toast.success('SMS channel and AI prompts configured successfully');
      router.push('/c/channels');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to configure SMS');
    }
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            SMS Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Connect your SMS provider
          </p>
        </div>
      </div>

      <div className="max-w-3xl">
        <SMSSetupForm
          onSubmit={(data) => setupMutation.mutate({
            type: 'sms',
            ...data
          })}
          isLoading={setupMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}