// src/app/company-admin/admin/channels/whatsapp/setup/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WhatsAppSetupForm from '@/components/forms/WhatsAppSetupForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function WhatsAppSetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const setupMutation = useMutation({
    mutationFn: async (data) => {
      // First create the channel
      const channelResponse = await apiClient.post('/channels', {
        type: data.type,
        name: data.name,
        identifier: data.identifier,
        departmentIds: data.departmentIds,
        credentials: data.credentials
      });

      // If AI prompts exist, save them
      if (data.aiPrompts && channelResponse.data?._id) {
        const channelId = channelResponse.data._id;
        const prompts = [];

        if (data.aiPrompts.customerPrompt) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'whatsapp-customer-prompt',
            prompt: data.aiPrompts.customerPrompt,
            name: 'WhatsApp Customer Prompt',
            description: 'AI prompt for customer conversations on WhatsApp'
          });
        }

        if (data.aiPrompts.handymanPrompt) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'whatsapp-handyman-prompt',
            prompt: data.aiPrompts.handymanPrompt,
            name: 'WhatsApp Handyman Prompt',
            description: 'AI prompt for handyman conversations on WhatsApp'
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
      toast.success('WhatsApp channel and AI prompts configured successfully');
      router.push('/c/channels');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to configure WhatsApp');
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
            WhatsApp Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Connect your WhatsApp Business account
          </p>
        </div>
      </div>

      <div className="max-w-3xl">
        <WhatsAppSetupForm
          onSubmit={(data) => setupMutation.mutate({
            type: 'whatsapp',
            ...data
          })}
          isLoading={setupMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}