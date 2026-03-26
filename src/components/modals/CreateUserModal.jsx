// // src/components/modals/CreateUserModal.jsx
// 'use client';

// import { useMutation } from '@tanstack/react-query';
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
// import UserForm from '@/components/forms/UserForm';
// import apiClient from '@/lib/api/client';
// import { toast } from "sonner"

// export default function CreateUserModal({ open, onClose, onSuccess }) {
  
//   const createMutation = useMutation({
//     mutationFn: (data) => apiClient.post('/users', data),
//     onSuccess: () => {
//       toast({ title: 'Success', description: 'User created successfully' });
//       onSuccess();
//     },
//     onError: (error) => {
//       toast({
//         title: 'Error',
//         description: error.message || 'Failed to create user',
//         variant: 'destructive'
//       });
//     }
//   });

//   return (
//     <Dialog open={open} onOpenChange={onClose}>
//       <DialogContent className="max-w-2xl">
//         <DialogHeader>
//           <DialogTitle>Create User</DialogTitle>
//         </DialogHeader>
//         <UserForm
//           onSubmit={(data) => createMutation.mutate(data)}
//           isLoading={createMutation.isPending}
//           onCancel={onClose}
//         />
//       </DialogContent>
//     </Dialog>
//   );
// }




// src/components/modals/CreateUserModal.jsx
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import UserForm from '@/components/forms/UserForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export default function CreateUserModal({ open, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  
  const createMutation = useMutation({
    mutationFn: (data) => apiClient.post('/users', data),
    onSuccess: (response) => {
      toast.success('User created successfully');
      
      // ✅ Invalidate ALL users queries (regardless of page/search params)
      queryClient.invalidateQueries({ queryKey: ['users'], exact: false });
      
      // ✅ Optimistically update the cache with the new user
      if (response?.success && response?.data) {
        const newUser = response.data;
        
        // Get all cached users queries and add the new user
        queryClient.setQueriesData({ queryKey: ['users'] }, (oldData) => {
          if (!oldData) return oldData;
          
          // Ensure data is always an array
          const currentData = Array.isArray(oldData.data) ? oldData.data : [];
          
          // Check if user already exists in the data
          const existingIndex = currentData.findIndex(u => u._id === newUser._id);
          
          if (existingIndex >= 0) {
            // User already exists, update it (shouldn't happen for new users, but handle it anyway)
            const updatedData = [...currentData];
            updatedData[existingIndex] = newUser;
            return {
              ...oldData,
              data: updatedData
            };
          } else {
            // New user, add to the beginning of the list
            return {
              ...oldData,
              data: [newUser, ...currentData],
              pagination: {
                ...oldData.pagination,
                total: (oldData.pagination?.total || 0) + 1
              },
              statistics: {
                ...oldData.statistics,
                total: (oldData.statistics?.total || 0) + 1,
                active: (oldData.statistics?.active || 0) + (newUser.status === 'active' ? 1 : 0)
              }
            };
          }
        });
      }
      
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || error.message || 'Failed to create user');
    }
  });

  // Animation variants matching ContactFormModal
  const modalVariants = {
    hidden: {
      opacity: 0,
      scale: 0.95,
      y: -20,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        damping: 25,
        stiffness: 300,
        duration: 0.3,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -20,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="sm:max-w-[900px] max-w-[95vw] p-0 overflow-hidden max-h-[90vh] h-[90vh] flex flex-col">
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-col h-full"
            >
              <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  <DialogTitle className="text-2xl font-bold">
                    Create Agent
                  </DialogTitle>
                  <DialogDescription className="mt-2">
                    Add a new team member to your organization
                  </DialogDescription>
                </motion.div>
              </DialogHeader>
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-6 py-4">
                  <UserForm
                    key={open ? 'create-user-form' : 'closed'}
                    initialData={undefined}
                    onSubmit={(data) => createMutation.mutate(data)}
                    isLoading={createMutation.isPending}
                    onCancel={onClose}
                  />
                </div>
              </ScrollArea>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}