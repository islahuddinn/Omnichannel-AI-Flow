// // src/app/(superadmin)/dashboard/page.js
// 'use client';

// import { useEffect, useState } from 'react';
// import { useQuery } from '@tanstack/react-query';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { Button } from '@/components/ui/button';
// import { Building2, Users, MessageSquare, TrendingUp } from 'lucide-react';
// import apiClient from '@/lib/api/client';
// import socketClient from '@/lib/socket/client';
// import CompanyGrid from '@/components/panels/superadmin/CompanyGrid';
// import SystemMetrics from '@/components/panels/superadmin/SystemMetrics';
// import ErrorBoundary from '@/components/shared/ErrorBoundary';

// export default function SuperAdminDashboard() {
//   const [realtimeMetrics, setRealtimeMetrics] = useState({
//     activeSessions: 0,
//     messageRate: 0,
//     activeConversations: 0
//   });

//   const { data: metrics, isLoading } = useQuery({
//     queryKey: ['system-metrics'],
//     queryFn: () => apiClient.get('/system/metrics'),
//     refetchInterval: 60000 // Refresh every minute
//   });

//   useEffect(() => {
//     const socket = socketClient.getSuperAdminSocket();
    
//     if (socket) {
//       socket.emit('metrics:subscribe');
      
//       socket.on('metrics:update', (data) => {
//         setRealtimeMetrics(data);
//       });

//       return () => {
//         socket.emit('metrics:unsubscribe');
//         socket.off('metrics:update');
//       };
//     }
//   }, []);

//   return (
//     <div className="p-6 space-y-6">
//       {/* Header */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
//             Super Admin Dashboard
//           </h1>
//           <p className="text-gray-600 dark:text-gray-400 mt-1">
//             Manage and monitor all companies and system resources
//           </p>
//         </div>
//       </div>

//       {/* Metrics Cards */}
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
//         <Card>
//           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//             <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
//             <Building2 className="h-4 w-4 text-muted-foreground" />
//           </CardHeader>
//           <CardContent>
//             <div className="text-2xl font-bold">
//               {metrics?.data?.companies?.total || 0}
//             </div>
//             <p className="text-xs text-muted-foreground">
//               {metrics?.data?.companies?.active || 0} active
//             </p>
//           </CardContent>
//         </Card>

//         <Card>
//           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//             <CardTitle className="text-sm font-medium">Total Users</CardTitle>
//             <Users className="h-4 w-4 text-muted-foreground" />
//           </CardHeader>
//           <CardContent>
//             <div className="text-2xl font-bold">
//               {metrics?.data?.users?.total || 0}
//             </div>
//             <p className="text-xs text-muted-foreground">
//               {metrics?.data?.users?.online || 0} online now
//             </p>
//           </CardContent>
//         </Card>

//         <Card>
//           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//             <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
//             <Users className="h-4 w-4 text-muted-foreground" />
//           </CardHeader>
//           <CardContent>
//             <div className="text-2xl font-bold">
//               {realtimeMetrics.activeSessions}
//             </div>
//             <p className="text-xs text-muted-foreground">Real-time</p>
//           </CardContent>
//         </Card>

//         <Card>
//           <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//             <CardTitle className="text-sm font-medium">Message Rate</CardTitle>
//             <MessageSquare className="h-4 w-4 text-muted-foreground" />
//           </CardHeader>
//           <CardContent>
//             <div className="text-2xl font-bold">
//               {realtimeMetrics.messageRate}/min
//             </div>
//             <p className="text-xs text-muted-foreground">
//               {realtimeMetrics.activeConversations} active conversations
//             </p>
//           </CardContent>
//         </Card>
//       </div>

//       {/* System Metrics Chart */}
//       <ErrorBoundary message="Failed to load system metrics">
//         <SystemMetrics />
//       </ErrorBoundary>

//       {/* Recent Companies */}
     

//        {/* Custom fallback UI */}
//       <ErrorBoundary
//         fallback={(error, reset) => (
//           <div className="p-4 bg-red-50 rounded">
//             <p>Chart failed to load: {error.message}</p>
//             <button onClick={reset}>Reload Chart</button>
//           </div>
//         )}
//       >
//          <CompanyGrid />
//       </ErrorBoundary>
//     </div>
//   );
// }




// src/app/(superadmin)/dashboard/page.js
'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, AlertTriangle } from 'lucide-react';
import apiClient from '@/lib/api/client';
import CompanyGrid from '@/components/panels/superadmin/CompanyGrid';
import SystemMetrics from '@/components/panels/superadmin/SystemMetrics';
import ErrorBoundary from '@/components/shared/ErrorBoundary';

export default function SuperAdminDashboard() {
  // Fetch static metrics via API
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: () => apiClient.get('/system/metrics'),
    refetchInterval: 60000, // Refresh every minute
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Super Admin Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage and monitor all companies and system resources
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[15px]">
        {/* Total Companies Card */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px',
                minHeight: '134px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-3 pt-3 pb-0 gap-4">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7
                  }}>
                Total Companies
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0"
                   style={{
                     background: 'linear-gradient(180deg, #4073F2 0%, #4B50E8 100%)',
                     borderRadius: '12px'
                   }}>
                <Building2 className="w-[22.4px] h-[22.4px] text-white" />
              </div>
            </div>
            <div className="flex flex-col items-start px-3 pt-3 pb-3">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {isLoading ? '...' : metrics?.data?.companies?.total || 0}
              </div>
              <p className="text-sm font-semibold text-[#00B69B] dark:text-green-400 mt-1"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px',
                   opacity: 0.7
                 }}>
                {metrics?.data?.companies?.active || 0} active
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Total Users Card */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px',
                minHeight: '134px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-3 pt-3 pb-0 gap-4">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7
                  }}>
                Total Users
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0"
                   style={{
                     background: 'linear-gradient(180deg, #0FB182 0%, #0E9B87 100%)',
                     borderRadius: '12px'
                   }}>
                <Users className="w-[27px] h-[24px] text-white" />
              </div>
            </div>
            <div className="flex flex-col items-start px-3 pt-3 pb-3">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {isLoading ? '...' : metrics?.data?.users?.total || 0}
              </div>
              <p className="text-sm font-semibold text-[#757285] dark:text-gray-400 mt-1"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px',
                   opacity: 0.7
                 }}>
                {metrics?.data?.users?.online || 0} online now
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Suspended Companies Card */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px',
                minHeight: '134px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-3 pt-3 pb-0 gap-4">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7
                  }}>
                Suspended Companies
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0"
                   style={{
                     background: 'linear-gradient(180deg, #EF4444 0%, #DC2626 100%)',
                     borderRadius: '12px'
                   }}>
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="flex flex-col items-start px-3 pt-3 pb-3">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {isLoading ? '...' : (metrics?.data?.companies?.total || 0) - (metrics?.data?.companies?.active || 0)}
              </div>
              <p className="text-sm font-semibold text-[#EF4444] dark:text-red-400 mt-1"
                 style={{
                   fontFamily: 'Nunito Sans, sans-serif',
                   fontWeight: 600,
                   fontSize: '14px',
                   lineHeight: '19px',
                   opacity: 0.7
                 }}>
                {metrics?.data?.companies?.total ? 
                  `${Math.round(((metrics.data.companies.total - (metrics.data.companies.active || 0)) / metrics.data.companies.total) * 100)}% of total` 
                  : '0% of total'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Metrics Chart */}
      <ErrorBoundary message="Failed to load system metrics">
        <SystemMetrics />
      </ErrorBoundary>

      {/* Company Grid */}
      <ErrorBoundary
        fallback={(error, reset) => (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-red-800 dark:text-red-200">
              Failed to load companies: {error.message}
            </p>
            <button
              onClick={reset}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}
      >
        <CompanyGrid />
      </ErrorBoundary>
    </div>
  );
}