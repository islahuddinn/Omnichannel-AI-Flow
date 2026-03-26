// // src/app/company-admin/admin/analytics/page.js
// 'use client';

// import { useState } from 'react';
// import { useQuery } from '@tanstack/react-query';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { DatePickerWithRange } from '@/components/ui/date-range-picker';
// import apiClient from '@/lib/api/client';
// import AnalyticsDashboard from '@/components/panels/company-admin/AnalyticsDashboard';
// import LoadingSpinner from '@/components/shared/LoadingSpinner';

// export default function AnalyticsPage() {
//   const [dateRange, setDateRange] = useState({
//     from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
//     to: new Date()
//   });

//   const { data: overview, isLoading: overviewLoading } = useQuery({
//     queryKey: ['analytics-overview', dateRange],
//     queryFn: () => apiClient.get(
//       `/analytics/overview?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`
//     )
//   });

//   const { data: conversations, isLoading: conversationsLoading } = useQuery({
//     queryKey: ['analytics-conversations', dateRange],
//     queryFn: () => apiClient.get(
//       `/analytics/conversations?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`
//     )
//   });

//   const { data: agents, isLoading: agentsLoading } = useQuery({
//     queryKey: ['analytics-agents', dateRange],
//     queryFn: () => apiClient.get(
//       `/analytics/agents?startDate=${dateRange.from.toISOString()}&endDate=${dateRange.to.toISOString()}`
//     )
//   });

//   const isLoading = overviewLoading || conversationsLoading || agentsLoading;

//   return (
//     <div className="p-6 space-y-6">
//       {/* Header */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
//             Analytics
//           </h1>
//           <p className="text-gray-600 dark:text-gray-400 mt-1">
//             Detailed insights and performance metrics
//           </p>
//         </div>
//         <DatePickerWithRange
//           date={dateRange}
//           onDateChange={setDateRange}
//         />
//       </div>

//       {isLoading ? (
//         <div className="flex items-center justify-center py-12">
//           <LoadingSpinner size="lg" />
//         </div>
//       ) : (
//         <AnalyticsDashboard
//           overview={overview?.data}
//           conversations={conversations?.data}
//           agents={agents?.data}
//         />
//       )}
//     </div>
//   );
// }



// src/app/company-admin/admin/analytics/page.js
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';
import AnalyticsDashboard from '@/components/panels/company-admin/AnalyticsDashboard';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { Button as AnalyticsButton } from '@/components/ui/button';

export default function AnalyticsPage() {
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(new Date());
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);

  const dateRange = {
    from: startDate,
    to: endDate
  };

  const { data: overview, isLoading: overviewLoading, isError: overviewError, refetch: refetchOverview } = useQuery({
    queryKey: ['analytics-overview', dateRange],
    queryFn: () => apiClient.get(
      `/analytics/overview?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
    )
  });

  const { data: conversations, isLoading: conversationsLoading, isError: conversationsError } = useQuery({
    queryKey: ['analytics-conversations', dateRange],
    queryFn: () => apiClient.get(
      `/analytics/conversations?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
    )
  });

  const { data: agents, isLoading: agentsLoading, isError: agentsError } = useQuery({
    queryKey: ['analytics-agents', dateRange],
    queryFn: () => apiClient.get(
      `/analytics/agents?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
    )
  });

  // Bot, OWM, Salesforce analytics queries
  const daysDiff = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
  const { data: botAnalytics, isLoading: botLoading, isError: botError } = useQuery({
    queryKey: ['analytics-bot', daysDiff],
    queryFn: () => apiClient.get(`/analytics/bot?days=${daysDiff}`)
  });

  const { data: sfAnalytics, isLoading: sfLoading, isError: sfError } = useQuery({
    queryKey: ['analytics-salesforce', daysDiff],
    queryFn: () => apiClient.get(`/analytics/salesforce?days=${daysDiff}`)
  });

  const { data: owmAnalytics, isLoading: owmLoading, isError: owmError } = useQuery({
    queryKey: ['analytics-owm', daysDiff],
    queryFn: () => apiClient.get(`/analytics/owm?days=${daysDiff}`)
  });

  const isLoading = overviewLoading || conversationsLoading || agentsLoading;
  const hasError = overviewError || conversationsError || agentsError;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Analytics
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Detailed insights and performance metrics
          </p>
        </div>
        
        {/* Date Range Selection */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Popover open={isStartOpen} onOpenChange={setIsStartOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "MMM dd, yyyy") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => {
                    setStartDate(date);
                    setIsStartOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            <span className="text-gray-500">to</span>
            
            <Popover open={isEndOpen} onOpenChange={setIsEndOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "MMM dd, yyyy") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(date) => {
                    setEndDate(date);
                    setIsEndOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          {/* Quick Date Range Buttons */}
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date();
                setStartDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
                setEndDate(today);
              }}
            >
              7D
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date();
                setStartDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));
                setEndDate(today);
              }}
            >
              30D
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const today = new Date();
                setStartDate(new Date(today.getFullYear(), today.getMonth(), 1));
                setEndDate(today);
              }}
            >
              MTD
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : hasError ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Failed to load analytics</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Unable to fetch analytics data. Please try again.
            </p>
          </div>
          <AnalyticsButton variant="outline" size="sm" onClick={() => refetchOverview()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </AnalyticsButton>
        </div>
      ) : (
        <AnalyticsDashboard
          overview={overview?.data}
          conversations={conversations?.data}
          agents={agents?.data}
          botAnalytics={botAnalytics?.data}
          botLoading={botLoading}
          botError={botError}
          sfAnalytics={sfAnalytics?.data}
          sfLoading={sfLoading}
          sfError={sfError}
          owmAnalytics={owmAnalytics?.data}
          owmLoading={owmLoading}
          owmError={owmError}
        />
      )}
    </div>
  );
}