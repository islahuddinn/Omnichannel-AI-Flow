// src/components/modals/CreateDepartmentModal.jsx
'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DepartmentForm from '@/components/forms/DepartmentForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function CreateDepartmentModal({ open, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [resetKey, setResetKey] = useState(0);

  // ✅ Reset form when modal opens
  useEffect(() => {
    if (open) {
      setResetKey(prev => prev + 1);
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.post('/departments', data),
    onSuccess: (response) => {
      toast.success('Department created successfully');
      
      // ✅ Invalidate ALL departments queries for real-time updates
      queryClient.invalidateQueries({ queryKey: ['departments'], exact: false });
      
      // ✅ Optimistically update the cache with the new department
      if (response?.success && response?.data) {
        const newDepartment = response.data;
        
        // Get all cached departments queries and add the new department
        queryClient.setQueriesData({ queryKey: ['departments'] }, (oldData) => {
          if (!oldData) return oldData;
          
          // Check if department already exists in the data
          const existingIndex = oldData.data?.findIndex(d => d._id === newDepartment._id);
          
          if (existingIndex >= 0) {
            // Department already exists, update it
            const updatedData = [...oldData.data];
            updatedData[existingIndex] = newDepartment;
            return {
              ...oldData,
              data: updatedData
            };
          } else {
            // New department, add to the beginning of the list
            return {
              ...oldData,
              data: [newDepartment, ...(oldData.data || [])],
              pagination: oldData.pagination ? {
                ...oldData.pagination,
                total: (oldData.pagination?.total || 0) + 1
              } : undefined
            };
          }
        });
      }
      
      // ✅ Reset form for next use
      setResetKey(prev => prev + 1);
      
      // ✅ Close modal
      onClose();
      
      // ✅ Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || error.message || 'Failed to create department');
    }
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-w-[95vw] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-gray-900 dark:text-gray-100 text-xl font-semibold">
            Create Department
          </DialogTitle>
        </DialogHeader>
        <DepartmentForm
          key={resetKey}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}