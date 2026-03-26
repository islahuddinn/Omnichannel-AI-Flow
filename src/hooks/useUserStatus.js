// src/hooks/useUserStatus.js
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { useEmployeeStatusStore } from '@/store/useEmployeeStatusStore';

/**
 * Hook for updating user status (call or chat)
 * Provides reusable mutations for status updates
 */
export function useUserStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { setCallStatus, setMessageStatus, setStatusLoading } = useEmployeeStatusStore();

  // Mutation for updating call status
  const updateCallStatusMutation = useMutation({
    mutationFn: async ({ status, savePrevious = true }) => {
      if (!user?.id && !user?.userId) {
        throw new Error('User ID is required');
      }

      const userId = user.id || user.userId;
      
      // Save previous status if requested
      if (savePrevious) {
        const currentCallStatus = localStorage.getItem('callStatus');
        if (currentCallStatus && currentCallStatus !== status) {
          localStorage.setItem('previousCallStatus', currentCallStatus);
        }
      }

      // Update localStorage
      localStorage.setItem('callStatus', status);
      setCallStatus(status);
      setStatusLoading(true);

      // Update backend via API
      const response = await apiClient.put(`/users/${userId}/status`, {
        status,
        type: 'call'
      });

      return response;
    },
    onSuccess: (data, variables) => {
      setStatusLoading(false);
      // Invalidate user profile to refetch
      // queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id || user?.userId] });
    },
    onError: (error) => {
      console.error('Error updating call status:', error);
      setStatusLoading(false);
    },
  });

  // Mutation for updating message/chat status
  const updateMessageStatusMutation = useMutation({
    mutationFn: async ({ status, savePrevious = true }) => {
      if (!user?.id && !user?.userId) {
        throw new Error('User ID is required');
      }

      const userId = user.id || user.userId;
      
      // Save previous status if requested
      if (savePrevious) {
        const currentMessageStatus = localStorage.getItem('messageStatus');
        if (currentMessageStatus && currentMessageStatus !== status) {
          localStorage.setItem('previousMessageStatus', currentMessageStatus);
        }
      }

      // Update localStorage
      localStorage.setItem('messageStatus', status);
      setMessageStatus(status);
      setStatusLoading(true);

      // Update backend via API
      const response = await apiClient.put(`/users/${userId}/status`, {
        status,
        type: 'chat'
      });

      return response;
    },
    onSuccess: (data, variables) => {
      setStatusLoading(false);
      // Invalidate user profile to refetch
      // queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id || user?.userId] });
    },
    onError: (error) => {
      console.error('Error updating message status:', error);
      setStatusLoading(false);
    },
  });

  // Helper function to update both call and message status
  const updateBothStatuses = async ({ callStatus, messageStatus, savePrevious = true }) => {
    const promises = [];
    
    if (callStatus) {
      promises.push(updateCallStatusMutation.mutateAsync({ status: callStatus, savePrevious }));
    }
    
    if (messageStatus) {
      promises.push(updateMessageStatusMutation.mutateAsync({ status: messageStatus, savePrevious }));
    }

    await Promise.allSettled(promises);
  };

  return {
    updateCallStatus: updateCallStatusMutation.mutate,
    updateCallStatusAsync: updateCallStatusMutation.mutateAsync,
    updateMessageStatus: updateMessageStatusMutation.mutate,
    updateMessageStatusAsync: updateMessageStatusMutation.mutateAsync,
    updateBothStatuses,
    isUpdatingCallStatus: updateCallStatusMutation.isPending,
    isUpdatingMessageStatus: updateMessageStatusMutation.isPending,
  };
}

