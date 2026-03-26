// src/app/c/dashboard/page.js
'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, MessageSquare, Briefcase, Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import apiClient from '@/lib/api/client';
import CompanyAdminDashboard from '@/components/panels/company-admin/CompanyAdminDashboard';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function AdminDashboardPage() {
  const { data: overview, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiClient.get('/analytics/overview?period=7d'),
    refetchInterval: 60000
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
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
          <h3 className="text-lg font-semibold text-foreground">Failed to load dashboard</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {error?.message || 'Unable to fetch dashboard data. Please try again.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const metrics = overview?.data?.summary || {};

  const metricCards = [
    {
      title: 'All Conversations',
      value: metrics.totalConversations || 0,
      subtitle: `${metrics.activeConversations || 0} active this week`,
      icon: MessageSquare,
      gradient: 'from-violet-500/10 to-purple-500/10',
      iconBg: 'bg-violet-500/10',
      iconColor: 'text-violet-600 dark:text-violet-400',
      borderAccent: 'border-l-violet-500',
    },
    {
      title: 'Total Messages',
      value: metrics.totalMessages || 0,
      subtitle: 'Last 7 days',
      icon: Activity,
      gradient: 'from-blue-500/10 to-cyan-500/10',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600 dark:text-blue-400',
      borderAccent: 'border-l-blue-500',
    },
    {
      title: 'Total Contacts',
      value: metrics.totalContacts || 0,
      subtitle: `+${metrics.newContacts || 0} new this week`,
      icon: Users,
      gradient: 'from-emerald-500/10 to-teal-500/10',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      borderAccent: 'border-l-emerald-500',
    },
    {
      title: 'Total Deals',
      value: metrics.totalDeals || 0,
      subtitle: 'All deals',
      icon: Briefcase,
      gradient: 'from-amber-500/10 to-orange-500/10',
      iconBg: 'bg-amber-500/10',
      iconColor: 'text-amber-600 dark:text-amber-400',
      borderAccent: 'border-l-amber-500',
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-full overflow-x-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your company&apos;s communication metrics
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live data</span>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className={`
                relative overflow-hidden rounded-xl border border-l-4 ${card.borderAccent}
                bg-gradient-to-br ${card.gradient}
                bg-card/80 backdrop-blur-sm
                p-5 transition-all duration-200
                hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20
                hover:-translate-y-0.5
              `}
            >
              {/* Top row: Title + Icon */}
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">
                  {card.title}
                </p>
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${card.iconBg}`}>
                  <Icon className={`w-5 h-5 ${card.iconColor}`} />
                </div>
              </div>

              {/* Value */}
              <div className="flex items-end gap-3">
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
                </span>
              </div>

              {/* Subtitle */}
              <p className="text-xs text-muted-foreground mt-1.5">
                {card.subtitle}
              </p>
            </div>
          );
        })}
      </div>

      {/* Main Dashboard Component */}
      <CompanyAdminDashboard />
    </div>
  );
}
