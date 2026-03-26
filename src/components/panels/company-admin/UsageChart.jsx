// src/components/panels/company-admin/UsageChart.jsx
'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3 } from 'lucide-react';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry, index) => (
        <p key={index} className="text-xs text-muted-foreground">
          {entry.name}: <span className="font-semibold text-foreground">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function UsageChart() {
  // TODO: Replace with actual API data
  const data = [
    { name: 'Mon', messages: 400 },
    { name: 'Tue', messages: 300 },
    { name: 'Wed', messages: 600 },
    { name: 'Thu', messages: 800 },
    { name: 'Fri', messages: 500 },
    { name: 'Sat', messages: 200 },
    { name: 'Sun', messages: 300 },
  ];

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-10 flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-muted/60 dark:bg-muted/30 flex items-center justify-center mb-4">
          <BarChart3 className="w-7 h-7 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">No usage data</p>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Message volume data will appear here once available.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-semibold text-foreground">Weekly Usage</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Message volume across the week</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="text-xs text-muted-foreground">Messages</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            strokeOpacity={0.5}
            vertical={false}
          />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            dx={-5}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="messages"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#usageGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
