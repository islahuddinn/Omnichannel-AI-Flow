// // src/app/company-admin/admin/departments/[departmentId]/edit/page.js
// 'use client';

// import { use } from 'react';
// import { useRouter } from 'next/navigation';
// import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// import { ArrowLeft } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import DepartmentForm from '@/components/forms/DepartmentForm';
// import apiClient from '@/lib/api/client';
// import LoadingSpinner from '@/components/shared/LoadingSpinner';
// import { useToast } from '@/components/ui/use-toast';

// export default function EditDepartmentPage({ params }) {
//   const { departmentId } = use(params);
//   const router = useRouter();
//   const queryClient = useQueryClient();
//   const { toast } = useToast();

//   const { data: department, isLoading } = useQuery({
//     queryKey: ['department', departmentId],
//     queryFn: () => apiClient.get(`/departments/${departmentId}`)
//   });

//   const updateMutation = useMutation({
//     mutationFn: (data) => apiClient.put(`/departments/${departmentId}`, data),
//     onSuccess: () => {
//       queryClient.invalidateQueries(['department', departmentId]);
//       queryClient.invalidateQueries(['departments']);
//       toast({
//         title: 'Success',
//         description: 'Department updated successfully'
//       });
//       router.push('/company-admin/admin/departments');
//     },
//     onError: (error) => {
//       toast({
//         title: 'Error',
//         description: error.message || 'Failed to update department',
//         variant: 'destructive'
//       });
//     }
//   });

//   if (isLoading) {
//     return (
//       <div className="flex items-center justify-center min-h-screen">
//         <LoadingSpinner size="lg" />
//       </div>
//     );
//   }

//   return (
//     <div className="p-6 space-y-6">
//       {/* Header */}
//       <div className="flex items-center gap-4">
//         <Button
//           variant="ghost"
//           size="icon"
//           onClick={() => router.back()}
//         >
//           <ArrowLeft className="h-5 w-5" />
//         </Button>
//         <div>
//           <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
//             Edit Department
//           </h1>
//           <p className="text-gray-600 dark:text-gray-400 mt-1">
//             Update department settings and routing rules
//           </p>
//         </div>
//       </div>

//       {/* Form */}
//       <div className="max-w-2xl">
//         <DepartmentForm
//           initialData={department?.data}
//           onSubmit={(data) => updateMutation.mutate(data)}
//           isLoading={updateMutation.isPending}
//           onCancel={() => router.back()}
//         />
//       </div>
//     </div>
//   );
// }




// src/app/company-admin/admin/departments/[departmentId]/edit/page.js
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DepartmentForm from '@/components/forms/DepartmentForm';
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { toast } from 'sonner';

export default function EditDepartmentPage({ params }) {
  const { departmentId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: department, isLoading, isError, error: deptError, refetch } = useQuery({
    queryKey: ['department', departmentId],
    queryFn: () => apiClient.get(`/departments/${departmentId}`)
  });

  const updateMutation = useMutation({
    mutationFn: (data) => apiClient.put(`/departments/${departmentId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['department', departmentId]);
      queryClient.invalidateQueries(['departments']);
      toast.success('Department updated successfully');
      router.push('/c/channels?tab=departments');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update department');
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Failed to load department</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {deptError?.message || 'Unable to fetch department details. Please try again.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Department</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Update department settings
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        <DepartmentForm
          initialData={department?.data}
          onSubmit={(data) => updateMutation.mutate(data)}
          isLoading={updateMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}