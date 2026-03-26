// // src/app/company-admin/admin/departments/create/page.js
// 'use client';

// import { useRouter } from 'next/navigation';
// import { useMutation } from '@tanstack/react-query';
// import { ArrowLeft } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import DepartmentForm from '@/components/forms/DepartmentForm';
// import apiClient from '@/lib/api/client';
// import { useToast } from '@/components/ui/use-toast';

// export default function CreateDepartmentPage() {
//   const router = useRouter();
//   const { toast } = useToast();

//   const createMutation = useMutation({
//     mutationFn: (data) => apiClient.post('/departments', data),
//     onSuccess: () => {
//       toast({
//         title: 'Success',
//         description: 'Department created successfully'
//       });
//       router.push('/company-admin/admin/departments');
//     },
//     onError: (error) => {
//       toast({
//         title: 'Error',
//         description: error.message || 'Failed to create department',
//         variant: 'destructive'
//       });
//     }
//   });

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
//             Create Department
//           </h1>
//           <p className="text-gray-600 dark:text-gray-400 mt-1">
//             Set up a new department with routing rules
//           </p>
//         </div>
//       </div>

//       {/* Form */}
//       <div className="max-w-2xl">
//         <DepartmentForm
//           onSubmit={(data) => createMutation.mutate(data)}
//           isLoading={createMutation.isPending}
//           onCancel={() => router.back()}
//         />
//       </div>
//     </div>
//   );
// }





// src/app/company-admin/admin/departments/create/page.js
'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DepartmentForm from '@/components/forms/DepartmentForm';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';

export default function CreateDepartmentPage() {
  const router = useRouter();

  const createMutation = useMutation({
    mutationFn: (data) => apiClient.post('/departments', data),
    onSuccess: () => {
      toast.success('Department created successfully');
      router.push('/c/channels?tab=departments');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create department');
    }
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Create Department</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Set up a new department
          </p>
        </div>
      </div>

      <div className="max-w-2xl">
        <DepartmentForm
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
          onCancel={() => router.back()}
        />
      </div>
    </div>
  );
}