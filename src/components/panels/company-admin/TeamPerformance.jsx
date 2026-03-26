// src/components/panels/company-admin/TeamPerformance.jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import apiClient from '@/lib/api/client';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { Users, UserCheck, BarChart3 } from 'lucide-react';

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

export default function TeamPerformance() {
  const { data: departments, isLoading: isLoadingDepts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiClient.get('/departments'),
  });

  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/users'),
  });

  const { data: analytics, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => apiClient.get('/analytics/overview?period=7d'),
    refetchInterval: 60000,
  });

  if (isLoadingDepts || isLoadingUsers || isLoadingAnalytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  const departmentsList = departments?.data || [];
  const usersList = users?.data || [];

  const userBelongsToDepartment = (user, deptId) => {
    if (!user.departments || user.departments.length === 0) return false;
    return user.departments.some((dept) => {
      if (typeof dept === 'string') {
        return dept === deptId || dept.toString() === deptId.toString();
      } else if (dept && typeof dept === 'object') {
        return dept._id === deptId || dept._id?.toString() === deptId.toString();
      }
      return false;
    });
  };

  const teamMetrics = departmentsList.map((dept) => {
    const deptId = dept._id || dept.id;
    const deptUsers = usersList.filter((user) =>
      userBelongsToDepartment(user, deptId)
    );

    return {
      id: deptId,
      name: dept.name,
      userCount: deptUsers.length,
      activeUsers: deptUsers.filter((u) => u.status === 'active').length,
    };
  });

  if (teamMetrics.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-10 flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-muted/60 dark:bg-muted/30 flex items-center justify-center mb-4">
          <Users className="w-7 h-7 text-muted-foreground/40" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">No teams configured</p>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Create departments and assign agents to see team performance metrics
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Department Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {teamMetrics.map((team) => (
          <div
            key={team.id}
            className="rounded-xl border border-border/60 bg-card p-4 hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/15 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-foreground truncate pr-2">{team.name}</p>
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 dark:bg-primary/15 flex-shrink-0">
                <Users className="h-4 w-4 text-primary" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground">{team.userCount}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <UserCheck className="w-3 h-3 text-emerald-500" />
              <p className="text-xs text-muted-foreground">
                {team.activeUsers} active members
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Department Performance Chart */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Department Performance</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-5">Team size and activity by department</p>

        {/* Legend */}
        <div className="flex items-center gap-5 mb-4">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-sm bg-primary" />
            <span className="text-xs text-muted-foreground">Total Members</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            <span className="text-xs text-muted-foreground">Active Members</span>
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={teamMetrics} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
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
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              angle={teamMetrics.length > 5 ? -45 : 0}
              textAnchor={teamMetrics.length > 5 ? 'end' : 'middle'}
              height={teamMetrics.length > 5 ? 70 : 30}
              dy={5}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="userCount"
              fill="var(--primary)"
              name="Total Members"
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
            />
            <Bar
              dataKey="activeUsers"
              fill="var(--emerald-500, #10b981)"
              name="Active Members"
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
