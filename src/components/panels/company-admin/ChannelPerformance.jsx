// src/components/panels/company-admin/ChannelPerformance.jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';

const COLORS = [
  'oklch(0.60 0.24 250)',  // violet
  'oklch(0.70 0.20 180)',  // teal
  'oklch(0.65 0.20 150)',  // emerald
  'oklch(0.75 0.20 85)',   // amber
  'oklch(0.65 0.22 30)',   // orange
  'oklch(0.70 0.20 330)',  // pink
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-medium text-foreground mb-1 capitalize">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-xs text-muted-foreground">
          {entry.name}: <span className="font-semibold text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

const NoDataState = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-full py-10">
    <div className="w-16 h-16 rounded-full bg-muted/60 dark:bg-muted/30 flex items-center justify-center mb-4">
      <BarChart3 className="w-7 h-7 text-muted-foreground/40" />
    </div>
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

export default function ChannelPerformance() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => apiClient.get('/analytics/overview?period=7d'),
    refetchInterval: 60000,
  });

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: () => apiClient.get('/channels'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  const channelData = analytics?.data?.conversationsByChannel || [];
  const channelsList = channels?.data || [];

  const enhancedChannelData = channelData.map((item) => {
    const channelInfo = channelsList.find((ch) => ch.type === item.channel);
    return {
      ...item,
      name: channelInfo?.name || item.channel,
      status: channelInfo?.status || 'unknown',
      isActive: channelInfo?.status === 'active',
    };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Bar Chart Card */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">
            Conversations by Channel
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Distribution of conversations across channels
        </p>

        {/* Chart */}
        <div className="h-52">
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enhancedChannelData} margin={{ top: 0, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  strokeOpacity={0.5}
                  vertical={false}
                />
                <XAxis
                  dataKey="channel"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11, textTransform: 'capitalize' }}
                  dy={5}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  fill="var(--primary)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoDataState message="No channel data available" />
          )}
        </div>
      </div>

      {/* Pie Chart Card */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <PieChartIcon className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">
            Channel Distribution
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">
          Percentage breakdown by channel
        </p>

        {/* Chart */}
        <div className="h-52">
          {channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={enhancedChannelData}
                  dataKey="count"
                  nameKey="channel"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                  strokeWidth={2}
                  stroke="var(--card)"
                  label={({ channel, percent }) => `${channel}: ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                >
                  {enhancedChannelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                  formatter={(value) => (
                    <span className="text-muted-foreground capitalize">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <NoDataState message="No channel data available" />
          )}
        </div>
      </div>
    </div>
  );
}
