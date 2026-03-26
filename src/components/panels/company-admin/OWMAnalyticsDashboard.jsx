// src/components/panels/company-admin/OWMAnalyticsDashboard.jsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Zap, Target, Clock, Send, CheckCircle2, AlertTriangle, TrendingUp, BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function StatCard({ title, value, subtitle, icon: Icon }) {
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
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function OWMAnalyticsDashboard({ data }) {
  if (!data) return <div className="text-center py-12 text-muted-foreground">No OWM data yet</div>;

  const { summary, outcomeDistribution, stageBreakdown, automationPerformance, dailyMatches, confidenceDistribution, automationList } = data;

  const stagePieData = [
    { name: 'Pending', value: stageBreakdown?.pending || 0, color: '#f59e0b' },
    { name: 'Matched', value: stageBreakdown?.matched || 0, color: '#06b6d4' },
    { name: 'Action Taken', value: stageBreakdown?.action_taken || 0, color: '#10b981' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="OWM Messages Sent" value={summary?.totalOWMSent || 0} icon={Send} />
        <StatCard title="Match Rate" value={`${summary?.matchRate || 0}%`} subtitle={`${summary?.matchedCount || 0} matched`} icon={Target} />
        <StatCard title="Follow-ups Sent" value={summary?.followUpSentCount || 0} icon={CheckCircle2} />
        <StatCard title="Pending" value={summary?.pendingCount || 0} icon={AlertTriangle} />
        <StatCard title="Avg Confidence" value={summary?.avgConfidence || 0} icon={TrendingUp} />
        <StatCard title="Avg Match Time" value={summary?.avgMatchDurationMs ? `${(summary.avgMatchDurationMs / 1000).toFixed(1)}s` : '0s'} icon={Clock} />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard title="Total Automations" value={summary?.totalAutomations || 0} icon={Zap} />
        <StatCard title="Published" value={summary?.publishedAutomations || 0} icon={BarChart3} />
        <StatCard title="Actions Taken" value={summary?.actionTakenCount || 0} icon={CheckCircle2} />
        <StatCard title="Total Outcomes" value={summary?.totalMatches || 0} subtitle="outcome records" icon={Target} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Matches */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily OWM Activity</CardTitle>
            <CardDescription>Outcome matches per day</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={dailyMatches || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="matched" stackId="1" stroke="#10b981" fill="#10b98133" name="Matched" />
                <Area type="monotone" dataKey="pending" stackId="1" stroke="#f59e0b" fill="#f59e0b33" name="Pending" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Stage Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Outcome Stage Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {stagePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={stagePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {stagePieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">No stage data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outcome Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Matched Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            {outcomeDistribution?.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={outcomeDistribution.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} name="Matches" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">No outcome data yet</div>
            )}
          </CardContent>
        </Card>

        {/* AI Confidence Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Confidence Distribution</CardTitle>
            <CardDescription>How confident the AI is in matching</CardDescription>
          </CardHeader>
          <CardContent>
            {confidenceDistribution?.some(b => b.count > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={confidenceDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Matches" radius={[4, 4, 0, 0]}>
                    {(confidenceDistribution || []).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">No confidence data yet</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Automation Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Automation Performance</CardTitle>
          <CardDescription>Response and match rates by automation</CardDescription>
        </CardHeader>
        <CardContent>
          {automationPerformance?.length > 0 ? (
            <div className="space-y-2">
              {automationPerformance.map((a, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{a.name}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{a.sent} sent</span>
                      <span className="text-xs text-emerald-600">{a.matched} matched</span>
                      <span className="text-xs text-primary">{a.actionTaken} actions</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-primary">{a.matchRate}%</p>
                    <p className="text-[10px] text-muted-foreground">match rate</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-muted-foreground">No automation data yet</div>
          )}
        </CardContent>
      </Card>

      {/* Automation List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Automations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {(automationList || []).map((a, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <div className={cn('h-2 w-2 rounded-full', a.isPublished ? 'bg-emerald-500' : 'bg-gray-400')} />
                  <span className="text-sm">{a.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{a.totalSent} sent</span>
                  {a.totalFailed > 0 && <span className="text-red-500">{a.totalFailed} failed</span>}
                  {a.lastExecuted && <span>{new Date(a.lastExecuted).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
            {(!automationList || automationList.length === 0) && (
              <div className="text-center py-4 text-sm text-muted-foreground">No automations yet</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
