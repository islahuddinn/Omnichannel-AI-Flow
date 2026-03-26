// src/components/panels/company-admin/ConversationMetrics.jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { TrendingUp } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-xs text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
          {entry.name}: <span className="font-semibold text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function ConversationMetrics() {
  const { data, isLoading } = useQuery({
    queryKey: ['conversation-metrics'],
    queryFn: () => apiClient.get('/analytics/conversations')
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card flex items-center justify-center h-[420px]">
        <LoadingSpinner />
      </div>
    );
  }

  const conversationData = data?.data || {};
  const chartData = conversationData.trend || [];
  const byStatus = conversationData.byStatus || [];
  const hasData = chartData.length > 0;

  // Build summary stats from real API data
  const totalConversations = conversationData.totalConversations || 0;
  const openCount = byStatus.find(s => s._id === 'open')?.count || 0;
  const closedCount = byStatus.find(s => s._id === 'closed')?.count || 0;

  const summaryStats = [
    { label: 'Total', value: totalConversations.toLocaleString() },
    { label: 'Open', value: openCount.toLocaleString() },
    { label: 'Closed', value: closedCount.toLocaleString() },
  ];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">
              Conversations by Status
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Daily conversation trend over the selected period
          </p>
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-6">
          {summaryStats.map((stat) => (
            <div key={stat.label} className="text-right">
              <p className="text-lg font-semibold text-foreground leading-tight">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-sm bg-blue-500 dark:bg-blue-400" />
          <span className="text-xs text-muted-foreground">Conversations</span>
        </div>
      </div>

      {/* Chart Area */}
      {hasData ? (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="conversationGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="var(--border)"
              strokeOpacity={0.5}
              horizontal={true}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              tickCount={6}
              dx={-5}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#conversationGradient)"
              name="Conversations"
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-[300px]">
          <p className="text-sm text-muted-foreground">No conversation data available</p>
        </div>
      )}
    </div>
  );
}
