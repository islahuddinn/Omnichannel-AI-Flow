// src/app/company-admin/admin/channels/sms/edit/[channelId]/page.js
'use client';

import { useRouter, useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SMSSetupForm from '@/components/forms/SMSSetupForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function SMSEditPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const channelId = params.channelId;

  const { data: channelData, isLoading, error } = useQuery({
    queryKey: ['channel', channelId],
    queryFn: () => apiClient.get(`/channels/${channelId}`),
    enabled: !!channelId,
  });

  // Fetch AI prompts
  const { data: promptsData } = useQuery({
    queryKey: ['ai-prompts', channelId],
    queryFn: () => apiClient.get(`/ai-prompts/batch?moduleId=${channelId}`),
    enabled: !!channelId,
    staleTime: 0,
    cacheTime: 0,
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      try {
      // Update channel
      const channelResponse = await apiClient.put(`/channels/${channelId}`, {
        type: data.type,
        name: data.name,
        identifier: data.identifier,
        departmentIds: data.departmentIds,
        credentials: data.credentials
      });

      // Update AI prompts
      if (data.aiPrompts) {
        const prompts = [];

        if (data.aiPrompts.customerPrompt !== undefined) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'sms-customer-prompt',
            prompt: data.aiPrompts.customerPrompt,
            name: 'SMS Customer Prompt',
            description: 'AI prompt for customer conversations on SMS'
          });
        }

        if (data.aiPrompts.handymanPrompt !== undefined) {
          prompts.push({
            moduleId: channelId,
            moduleIdDescription: 'sms-handyman-prompt',
            prompt: data.aiPrompts.handymanPrompt,
            name: 'SMS Handyman Prompt',
            description: 'AI prompt for handyman conversations on SMS'
          });
        }

        if (prompts.length > 0) {
          await apiClient.post('/ai-prompts/batch', { prompts });
        }
      }

      return channelResponse;
      } catch (error) {
        console.error('Update mutation error:', error);
        throw error;
      }
    },
    onSuccess: async () => {
      try {
      await queryClient.invalidateQueries(['channels']);
      await queryClient.invalidateQueries(['channel', channelId]);
      await queryClient.invalidateQueries(['ai-prompts', channelId]);
      await queryClient.refetchQueries(['ai-prompts', channelId]);
      toast.success('SMS channel and AI prompts updated successfully');
        setTimeout(() => {
          router.push('/c/channels');
        }, 500);
      } catch (error) {
        console.error('Error in onSuccess:', error);
      }
    },
    onError: (error) => {
      console.error('Update mutation error:', error);
      toast.error(error.response?.data?.error || 'Failed to update SMS channel');
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !channelData?.data) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-gray-500">Channel not found or failed to load</p>
          <Button onClick={() => router.back()} className="mt-4">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const channel = channelData.data;
  const prompts = promptsData?.data || [];

  // Extract customer and handyman prompts
  const customerPrompt = prompts.find(p => p.moduleIdDescription === 'sms-customer-prompt');
  const handymanPrompt = prompts.find(p => p.moduleIdDescription === 'sms-handyman-prompt');

  // ✅ Safe data preparation
  const initialFormData = {
    name: channel.name || '',
    identifier: channel.identifier || '',
    departmentIds: channel.departmentIds?.map(dept => dept._id) || [channel.departmentId].filter(Boolean) || [],
    credentials: {
      apiKey: channel.credentials?.apiKey || '',
      senderId: channel.credentials?.senderId || '',
    },
    aiPrompts: {
      customerPrompt: customerPrompt?.prompt || '',
      handymanPrompt: handymanPrompt?.prompt || ''
    }
  };

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
            Edit SMS Channel
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Update your SMS provider settings
          </p>
        </div>
      </div>

      <div className="max-w-3xl">
        <SMSSetupForm
          initialData={initialFormData}
          onSubmit={async (data) => {
            try {
              await updateMutation.mutateAsync({
            type: 'sms',
            ...data
              });
            } catch (error) {
              // Error is handled by onError callback
              console.error('Form submission error:', error);
            }
          }}
          isLoading={updateMutation.isPending}
          onCancel={() => router.back()}
          isEdit={true}
        />
      </div>
    </div>
  );
}