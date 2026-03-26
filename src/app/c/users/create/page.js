// src/app/company-admin/admin/users/create/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UserForm from '@/components/forms/UserForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function CreateUserPage() {
  const router = useRouter();
  const createMutation = useMutation({
    mutationFn: (data) => apiClient.post('/users', data),
    onSuccess: () => {
      toast.success('User created successfully');
      router.push('/c/users');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create user');
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
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Create User
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Add a new team member to your organization
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl">
        <UserForm
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}