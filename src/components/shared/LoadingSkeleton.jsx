// // src/components/shared/LoadingSkeleton.jsx
// 'use client';

// import { Skeleton } from '@/components/ui/skeleton';

// export default function LoadingSkeleton({ rows = 5, columns = 4 }) {
//   return (
//     <div className="space-y-4">
//       {Array.from({ length: rows }).map((_, i) => (
//         <div key={i} className="flex space-x-4">
//           {Array.from({ length: columns }).map((_, j) => (
//             <Skeleton key={j} className="h-12 flex-1" />
//           ))}
//         </div>
//       ))}
//     </div>
//   );
// }



// src/components/shared/LoadingSkeleton.jsx
'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function LoadingSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}