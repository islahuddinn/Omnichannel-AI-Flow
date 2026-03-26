// src/components/panels/company-admin/SalesforceAnalyticsDashboard.jsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Cloud, CheckCircle2, XCircle, AlertTriangle, TrendingUp, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#4f46e5', '#06b6d4', '#8b5cf6'];

function StatCard({ title, value, subtitle, icon: Icon, color }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {Icon && (
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', color || 'bg-primary/10')}>
              <Icon className={cn('h-4 w-4', color ? 'text-white' : 'text-primary')} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SalesforceAnalyticsDashboard({ data }) {
  if (!data) return <div className="text-center py-12 text-muted-foreground">No Salesforce data yet</div>;

  const { summary, topFields, byOutcome, topFailReasons, dailyTimeline, recentUpdates } = data;

  const statusPieData = [
    { name: 'Success', value: summary?.successCount || 0, color: '#10b981' },
    { name: 'Failed', value: summary?.failedCount || 0, color: '#ef4444' },
    { name: 'Skipped', value: summary?.skippedCount || 0, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Total Updates" value={summary?.totalUpdates || 0} icon={Cloud} />
        <StatCard title="Success Rate" value={`${summary?.successRate || 0}%`} subtitle={`${summary?.successCount || 0} successful`} icon={CheckCircle2} color="bg-emerald-500" />
        <StatCard title="Failed" value={summary?.failedCount || 0} icon={XCircle} color="bg-red-500" />
        <StatCard title="Skipped" value={summary?.skippedCount || 0} icon={AlertTriangle} color="bg-amber-500" />
        <StatCard title="Deal Updates" value={summary?.dealUpdates || 0} icon={TrendingUp} />
        <StatCard title="Contact Updates" value={summary?.contactUpdates || 0} icon={Activity} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Update Timeline</CardTitle>
            <CardDescription>Daily Salesforce update activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyTimeline || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="success" stackId="1" stroke="#10b981" fill="#10b98133" name="Success" />
                <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef444433" name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Update Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label={({ percent }) => `${(percent * 100).toFixed(0)}%`}>
                    {statusPieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">No data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Updated Fields */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most Updated Fields</CardTitle>
          </CardHeader>
          <CardContent>
            {topFields?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topFields} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="field" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} name="Updates" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">No field data yet</div>
            )}
          </CardContent>
        </Card>

        {/* By Outcome */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Updates by Outcome</CardTitle>
          </CardHeader>
          <CardContent>
            {byOutcome?.length > 0 ? (
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {byOutcome.map((o, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <span className="text-sm font-medium truncate flex-1 mr-2">{o.name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-emerald-600">{o.success} ok</span>
                      {o.failed > 0 && <span className="text-xs text-red-500">{o.failed} fail</span>}
                      <span className="text-xs text-muted-foreground">{o.total} total</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">No outcome data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Failure Reasons + Recent Updates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Failure Reasons</CardTitle>
          </CardHeader>
          <CardContent>
            {topFailReasons?.length > 0 ? (
              <div className="space-y-2">
                {topFailReasons.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/10">
                    <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                    <span className="text-xs flex-1 truncate">{r.reason}</span>
                    <span className="text-xs font-bold text-red-600">{r.count}x</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground text-emerald-600">No failures</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
              {(recentUpdates || []).slice(0, 10).map((u, i) => (
                <div key={i} className={cn('flex items-center gap-2 p-2 rounded-lg text-xs', u.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-red-50 dark:bg-red-900/10')}>
                  {u.status === 'success' ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                  <span className="font-medium">{u.object === 'Deal__c' ? 'Deal' : 'Contact'}</span>
                  <span className="text-muted-foreground truncate flex-1">{u.fields?.join(', ') || u.error?.substring(0, 40)}</span>
                  <span className="text-muted-foreground">{u.outcomeName}</span>
                </div>
              ))}
              {(!recentUpdates || recentUpdates.length === 0) && (
                <div className="text-center py-4 text-muted-foreground">No recent updates</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
