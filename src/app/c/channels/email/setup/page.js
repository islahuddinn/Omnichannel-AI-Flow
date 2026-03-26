// src/app/company-admin/admin/channels/email/setup/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmailSetupForm from '@/components/forms/EmailSetupForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function EmailSetupPage() {
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
            moduleIdDescription: 'email-customer-prompt',
            prompt: data.aiPrompts.customerPrompt,
            name: 'Email Customer Prompt',
            description: 'AI prompt for customer conversations on Email'
          });
        }

        if (data.aiPrompts.handymanPrompt) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'email-handyman-prompt',
            prompt: data.aiPrompts.handymanPrompt,
            name: 'Email Handyman Prompt',
            description: 'AI prompt for handyman conversations on Email'
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
      toast.success('Email channel and AI prompts configured successfully');
      router.push('/c/channels');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to configure Email');
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
            Email Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Connect your email account via SMTP/IMAP
          </p>
        </div>
      </div>

      <div className="max-w-3xl">
        <EmailSetupForm
          onSubmit={(data) => setupMutation.mutate({
            type: 'email',
            ...data
          })}
          isLoading={setupMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}