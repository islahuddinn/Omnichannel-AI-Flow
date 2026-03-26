// // src/app/company-admin/admin/departments/page.js
// 'use client';

// import { useState } from 'react';
// import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// import { useRouter } from 'next/navigation';
// import { Button } from '@/components/ui/button';
// import { Plus } from 'lucide-react';
// import apiClient from '@/lib/api/client';
// import DepartmentList from '@/components/panels/company-admin/DepartmentList';
// import CreateDepartmentModal from '@/components/modals/CreateDepartmentModal';
// import LoadingSpinner from '@/components/shared/LoadingSpinner';
// import { useToast } from '@/components/ui/use-toast';

// export default function DepartmentsPage() {
//   const router = useRouter();
//   const queryClient = useQueryClient();
//   const { toast } = useToast();
//   const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

//   const { data, isLoading } = useQuery({
//     queryKey: ['departments'],
//     queryFn: () => apiClient.get('/departments')
//   });

//   const deleteMutation = useMutation({
//     mutationFn: (deptId) => apiClient.delete(`/departments/${deptId}`),
//     onSuccess: () => {
//       queryClient.invalidateQueries(['departments']);
//       toast({
//         title: 'Success',
//         description: 'Department deleted successfully'
//       });
//     },
//     onError: (error) => {
//       toast({
//         title: 'Error',
//         description: error.message || 'Failed to delete department',
//         variant: 'destructive'
//       });
//     }
//   });

//   return (
//     <div className="p-6 space-y-6">
//       {/* Header */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
//             Departments
//           </h1>
//           <p className="text-gray-600 dark:text-gray-400 mt-1">
//             Organize your team and manage routing rules
//           </p>
//         </div>
//         <Button onClick={() => setIsCreateModalOpen(true)}>
//           <Plus className="mr-2 h-4 w-4" />
//           Add Department
//         </Button>
//       </div>

//       {/* Departments List */}
//       {isLoading ? (
//         <div className="flex items-center justify-center py-12">
//           <LoadingSpinner size="lg" />
//         </div>
//       ) : (
//         <DepartmentList
//           departments={data?.data || []}
//           onEdit={(deptId) => router.push(`/company-admin/admin/departments/${deptId}/edit`)}
//           onDelete={(deptId) => {
//             if (confirm('Are you sure you want to delete this department?')) {
//               deleteMutation.mutate(deptId);
//             }
//           }}
//         />
//       )}

//       {/* Create Modal */}
//       <CreateDepartmentModal
//         open={isCreateModalOpen}
//         onClose={() => setIsCreateModalOpen(false)}
//         onSuccess={() => {
//           queryClient.invalidateQueries(['departments']);
//           setIsCreateModalOpen(false);
//         }}
//       />
//     </div>
//   );
// }




// src/app/c/departments/page.js
// ✅ Redirect to channels page with departments tab
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function DepartmentsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to channels page - the departments tab will be handled by URL params or default
    router.replace('/c/channels?tab=departments');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <LoadingSpinner size="lg" />
    </div>
  );
}