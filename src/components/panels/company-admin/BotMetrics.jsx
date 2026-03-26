// src/components/panels/company-admin/BotMetrics.jsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { Bot, Activity, CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function BotMetrics() {
  const [showFailures, setShowFailures] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['bot-metrics'],
    queryFn: () => apiClient.get('/admin/bot-metrics'),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-20 mb-2" />
              <div className="h-8 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
        <div className="bg-card border border-border rounded-xl p-5 animate-pulse">
          <div className="h-4 bg-muted rounded w-40 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <div className="h-3 bg-muted rounded w-20 mb-2" />
                <div className="h-6 bg-muted rounded w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-10 flex flex-col items-center justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mb-4">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Failed to load bot metrics</p>
        <p className="text-xs text-muted-foreground text-center max-w-sm mb-3">
          There was a problem fetching bot queue data. Please try again.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  const metrics = data?.data;
  if (!metrics) return null;

  const { summary, performance, recentFailures, actionBreakdown } = metrics;

  const statCards = [
    { label: 'Pending', value: summary.pending, icon: Clock, color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Processing', value: summary.processing, icon: Activity, color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Completed', value: summary.completed, icon: CheckCircle2, color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Failed', value: summary.failed, icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  ];

  const actionLabels = {
    send_email: 'Email',
    send_whatsapp: 'WhatsApp',
    send_sms: 'SMS',
    send_message: 'WebChat',
    move_to_manual: 'Mode Switch',
  };

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">AI Bot Queue</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-xl border border-border/60 bg-card p-4 hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/15 transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-foreground">{card.label}</span>
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${card.bg} flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">{card.value.toLocaleString()}</p>
            </div>
          );
        })}
      </div>

      {/* Performance Row */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <h4 className="text-base font-semibold text-foreground mb-1">Performance (Last 24h)</h4>
        <p className="text-xs text-muted-foreground mb-5">Bot processing statistics over the past day</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Success Rate</p>
            <p className={`text-2xl font-bold ${performance.successRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' : performance.successRate >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-destructive'}`}>
              {performance.successRate}%
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Avg Processing</p>
            <p className="text-2xl font-bold text-foreground">
              {performance.avgProcessingTimeMs > 1000
                ? `${(performance.avgProcessingTimeMs / 1000).toFixed(1)}s`
                : `${performance.avgProcessingTimeMs}ms`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Completed</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{performance.completedLast24h}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Failed</p>
            <p className="text-2xl font-bold text-destructive">{performance.failedLast24h}</p>
          </div>
        </div>
      </div>

      {/* Action Breakdown */}
      {actionBreakdown && Object.keys(actionBreakdown).length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <h4 className="text-base font-semibold text-foreground mb-1">Actions Breakdown</h4>
          <p className="text-xs text-muted-foreground mb-5">Distribution of bot actions by type</p>
          <div className="space-y-3">
            {Object.entries(actionBreakdown).map(([action, count]) => {
              const total = summary.totalItems || 1;
              const percentage = Math.round((count / total) * 100);
              return (
                <div key={action} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{actionLabels[action] || action}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground w-16 text-right">{count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Failures */}
      {recentFailures && recentFailures.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <button
            onClick={() => setShowFailures(!showFailures)}
            className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-sm font-semibold text-foreground">
                Recent Failures ({recentFailures.length})
              </span>
            </div>
            {showFailures
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />
            }
          </button>
          {showFailures && (
            <div className="border-t border-border divide-y divide-border">
              {recentFailures.map((failure) => (
                <div key={failure.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-foreground">{actionLabels[failure.action] || failure.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {failure.updatedAt ? new Date(failure.updatedAt).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <p className="text-xs text-destructive break-all">{failure.error}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
