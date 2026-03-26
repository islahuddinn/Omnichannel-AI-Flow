// src/app/company-admin/admin/channels/instagram/setup/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import InstagramSetupForm from '@/components/forms/InstagramSetupForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function InstagramSetupPage() {
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
            moduleIdDescription: 'instagram-customer-prompt',
            prompt: data.aiPrompts.customerPrompt,
            name: 'Instagram Customer Prompt',
            description: 'AI prompt for customer conversations on Instagram'
          });
        }

        if (data.aiPrompts.handymanPrompt) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'instagram-handyman-prompt',
            prompt: data.aiPrompts.handymanPrompt,
            name: 'Instagram Handyman Prompt',
            description: 'AI prompt for handyman conversations on Instagram'
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
      toast.success('Instagram channel and AI prompts configured successfully');
      router.push('/c/channels');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to configure Instagram');
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
            Instagram Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Connect your Instagram Business account
          </p>
        </div>
      </div>

      <div className="max-w-3xl">
        <InstagramSetupForm
          onSubmit={(data) => setupMutation.mutate({
            type: 'instagram',
            ...data
          })}
          isLoading={setupMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}