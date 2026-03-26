// src/app/company-admin/admin/users/[userId]/edit/page.js
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserForm from '@/components/forms/UserForm';
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';

export default function EditUserPage({ params }) {
  const { userId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => apiClient.get(`/users/${userId}`),
    staleTime: 0, // Always consider data stale to ensure fresh data on mount
    refetchOnMount: 'always', // Always refetch when component mounts
  });

  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put(`/users/${userId}`, data),
    onSuccess: async (response) => {
      // ✅ Optimistically update the cache with the response data
      if (response?.success && response?.data) {
        const updatedUser = response.data;
        
        // Update the specific user query cache
        queryClient.setQueryData(['user', userId], {
          success: true,
          data: updatedUser
        });
        
        // Also update the users list cache if the user exists there
        queryClient.setQueriesData({ queryKey: ['users'] }, (oldData) => {
          if (!oldData || !oldData.data) return oldData;
          
          const userIndex = oldData.data.findIndex(u => u._id === userId);
          if (userIndex >= 0) {
            const updatedData = [...oldData.data];
            updatedData[userIndex] = { ...updatedData[userIndex], ...updatedUser };
            return {
              ...oldData,
              data: updatedData
            };
          }
          return oldData;
        });
      }
      
      // ✅ Invalidate queries to ensure fresh data on next fetch
      await queryClient.invalidateQueries({ queryKey: ['user', userId] });
      await queryClient.invalidateQueries({ queryKey: ['users'], exact: false });
      
      toast.success('User updated successfully');
      
      // Small delay to ensure cache updates are processed
      setTimeout(() => {
        router.push('/c/users');
      }, 100);
    },
    onError: (error) => {
      const errorMessage = error?.response?.data?.error || error?.message || 'Failed to update user';
      toast.error(errorMessage);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Edit User
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Update user information and permissions
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <UserForm
          initialData={user?.data}
          onSubmit={(data) => updateMutation.mutate(data)}
          isLoading={updateMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}