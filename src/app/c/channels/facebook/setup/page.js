// src/app/company-admin/admin/channels/facebook/setup/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FacebookSetupForm from '@/components/forms/FacebookSetupForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function FacebookSetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const setupMutation = useMutation({
    mutationFn: async (data) => {
      // Create channel
      const channelResponse = await apiClient.post('/channels', {
        type: data.type,
        name: data.name,
        identifier: data.identifier,
        departmentIds: data.departmentIds,
        credentials: data.credentials
      });

      const channelId = channelResponse.data._id;

      // Save AI prompts if provided
      if (data.aiPrompts && channelId) {
        const prompts = [];

        if (data.aiPrompts.customerPrompt) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'facebook-customer-prompt',
            prompt: data.aiPrompts.customerPrompt,
            name: 'Facebook Customer Prompt',
            description: 'AI prompt for customer conversations on Facebook'
          });
        }

        if (data.aiPrompts.handymanPrompt) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'facebook-handyman-prompt',
            prompt: data.aiPrompts.handymanPrompt,
            name: 'Facebook Handyman Prompt',
            description: 'AI prompt for handyman conversations on Facebook'
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
      toast.success('Facebook channel and AI prompts configured successfully');
      router.push('/c/channels');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to configure Facebook');
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
            Facebook Messenger Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Connect your Facebook Page
          </p>
        </div>
      </div>

      <div className="max-w-3xl">
        <FacebookSetupForm
          onSubmit={(data) => setupMutation.mutate({
            type: 'facebook',
            ...data
          })}
          isLoading={setupMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}