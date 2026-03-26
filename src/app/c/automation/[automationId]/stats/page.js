// src/app/c/automation/[automationId]/stats/page.js
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown, CheckCircle2, XCircle,
  BarChart3, Target, Zap, Users, MessageSquare, RefreshCw, AlertTriangle,
  Clock, Send, Eye, ExternalLink, Cloud, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ title, value, icon, color, subtitle }) {
  const gradients = {
    blue: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    purple: 'linear-gradient(135deg, #8B5CF6, #9333EA)',
    green: 'linear-gradient(135deg, #10B981, #16A34A)',
    orange: 'linear-gradient(135deg, #F97316, #EF4444)',
    cyan: 'linear-gradient(135deg, #06B6D4, #0891B2)',
    gray: 'linear-gradient(135deg, #6B7280, #4B5563)',
  };
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute w-[80px] h-[80px] -right-[30px] -top-[30px] rounded-full opacity-10" style={{ background: gradients[color] || gradients.blue }} />
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <div className="h-7 w-7 rounded-lg flex items-center justify-center text-white" style={{ background: gradients[color] || gradients.blue }}>
            {icon}
          </div>
        </div>
        <p className="text-xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value || 0}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ── Outcome Performance ─────────────────────────────────────────────────────

function OutcomeStatCard({ outcome, index }) {
  const matchRate = parseFloat(outcome.matchRate) || 0;
  return (
    <Card className="bg-muted/40">
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="text-sm font-medium truncate flex-1">{outcome.outcomeName}</h4>
          <Badge variant={matchRate >= 50 ? 'default' : 'secondary'} className="text-[10px] shrink-0">{matchRate.toFixed(1)}%</Badge>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden mb-1.5">
          <motion.div
            className={cn('h-full rounded-full', matchRate >= 50 ? 'bg-emerald-500' : 'bg-amber-500')}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, matchRate)}%` }}
            transition={{ duration: 0.6, delay: 0.05 * index }}
          />
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-emerald-600">{outcome.matched} matched</span>
          <span className="text-amber-600">{Math.max(0, outcome.unmatched)} unmatched</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Recent Matches (simplified) ─────────────────────────────────────────────

function OutcomeMatchesSection({ matches }) {
  const [showAll, setShowAll] = useState(false);
  if (!matches?.length) return (
    <div className="text-center py-8 text-muted-foreground">
      <Target className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No matches yet</p>
      <p className="text-xs mt-1">Matches will appear here when customers respond to this automation</p>
    </div>
  );
  const displayed = showAll ? matches : matches.slice(0, 6);

  return (
    <div className="space-y-1.5">
      {displayed.map((m, i) => (
        <div key={m._id || i} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{m.contactName}</span>
              <Badge variant="outline" className="text-[9px] px-1 h-4">{m.outcomeName}</Badge>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              <span>{formatDate(m.matchedAt)}</span>
              {m.confidenceScore && <span>{(m.confidenceScore * 100).toFixed(0)}%</span>}
              {m.followUpSent && <span className="text-emerald-600">follow-up sent</span>}
              {m.salesforceUpdates?.some(s => s.status === 'success') && <span className="text-blue-600">SF updated</span>}
            </div>
          </div>
          {m.conversationId && (
            <a href={`/c/conversations/${m.conversationId}`} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
            </a>
          )}
        </div>
      ))}
      {matches.length > 6 && (
        <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show less' : `Show all ${matches.length} matches`}
        </Button>
      )}
    </div>
  );
}

// ── Execution History ───────────────────────────────────────────────────────

function ExecutionHistorySection({ executions, automationId, router }) {
  if (!executions?.length) return (
    <div className="text-center py-8 text-muted-foreground">
      <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No executions yet</p>
      <p className="text-xs mt-1">Execute the automation to see history here</p>
      <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => router.push(`/c/automation/${automationId}`)}>
        Go to Automation
      </Button>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {executions.map((e, i) => (
        <div key={e._id || i} className={cn(
          'flex items-center gap-3 p-2.5 rounded-lg',
          e.status === 'completed' || e.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/10' :
          e.status === 'failed' ? 'bg-red-50 dark:bg-red-900/10' : 'bg-amber-50 dark:bg-amber-900/10'
        )}>
          {e.status === 'completed' || e.status === 'success' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
          ) : e.status === 'failed' ? (
            <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
          ) : (
            <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant={e.status === 'completed' || e.status === 'success' ? 'default' : 'destructive'} className="text-[9px] h-4">{e.status}</Badge>
              {e.contactsTargeted > 0 && <span className="text-xs text-muted-foreground">{e.contactsSucceeded}/{e.contactsTargeted} contacts</span>}
              {e.duration && <span className="text-[10px] text-muted-foreground">{formatDuration(e.duration)}</span>}
            </div>
            <span className="text-[10px] text-muted-foreground">{formatDate(e.startedAt)}</span>
            {e.error && <span className="text-[10px] text-red-500 ml-2">{e.error}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AutomationStatsPage() {
  const params = useParams();
  const router = useRouter();
  const automationId = params.automationId;
  const rm = useReducedMotion();

  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ['automation-stats', automationId],
    queryFn: async () => (await apiClient.get(`/automations/${automationId}/stats`)).data,
    enabled: !!automationId,
    refetchInterval: 30000,
  });

  const { data: automation } = useQuery({
    queryKey: ['automation', automationId],
    queryFn: async () => (await apiClient.get(`/automations/${automationId}`)).data,
    enabled: !!automationId,
  });

  if (isLoading) return <div className="flex justify-center items-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h3 className="text-lg font-semibold">Failed to load statistics</h3>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => router.push('/c/automation')}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    </div>
  );

  // Health score
  const deliveryRate = stats?.totalMessages > 0
    ? (((stats.messageStatusBreakdown?.sent || 0) + (stats.messageStatusBreakdown?.delivered || 0) + (stats.messageStatusBreakdown?.read || 0)) / stats.totalMessages * 100) : 0;
  const healthScore = stats ? Math.round(((stats.overallMatchRate || 0) * 0.5) + (deliveryRate * 0.3) + (stats.totalConversations > 0 ? 20 : 0)) : 0;
  const healthTip = healthScore >= 70 ? 'Good performance' : healthScore >= 40 ? 'Room for improvement — review unmatched outcomes' : 'Needs attention — check message delivery and outcome descriptions';

  // Message status totals
  const msgStatus = stats?.messageStatusBreakdown || {};
  const totalDelivered = (msgStatus.sent || 0) + (msgStatus.delivered || 0) + (msgStatus.read || 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.push('/c/automation')} className="shrink-0">
            <ArrowLeft className="mr-1 h-4 w-4" /><span className="hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-xl font-bold truncate flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-purple-600 shrink-0" />
              {automation?.name || 'Automation'} — Stats
            </h1>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="shrink-0">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh
        </Button>
      </div>

      {stats ? (
        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap gap-1 bg-gray-100 dark:bg-gray-800 h-auto py-1 px-1">
            <TabsTrigger value="overview" className="text-xs sm:text-sm px-3 py-1.5">Overview</TabsTrigger>
            <TabsTrigger value="outcomes" className="text-xs sm:text-sm px-3 py-1.5">Outcomes</TabsTrigger>
            <TabsTrigger value="matches" className="text-xs sm:text-sm px-3 py-1.5">Matches</TabsTrigger>
            <TabsTrigger value="history" className="text-xs sm:text-sm px-3 py-1.5">History</TabsTrigger>
          </TabsList>

          {/* ── Overview ── */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard title="Messages Sent" value={stats.totalMessages} icon={<Send className="h-3.5 w-3.5" />} color="blue" />
              <StatCard title="Conversations" value={stats.totalConversations} icon={<Users className="h-3.5 w-3.5" />} color="purple" />
              <StatCard title="Matched" value={stats.totalMatched} icon={<CheckCircle2 className="h-3.5 w-3.5" />} color="green" />
              <StatCard title="Match Rate" value={`${(stats.overallMatchRate || 0).toFixed(1)}%`} icon={<Target className="h-3.5 w-3.5" />} color="cyan" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <StatCard title="Health Score" value={`${healthScore}/100`} icon={<Zap className="h-3.5 w-3.5" />} color={healthScore >= 70 ? 'green' : healthScore >= 40 ? 'orange' : 'gray'} subtitle={healthTip} />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  <p className="font-medium mb-1">Health Score Breakdown:</p>
                  <p>Match Rate ({(stats.overallMatchRate || 0).toFixed(0)}%) x 0.5 = {((stats.overallMatchRate || 0) * 0.5).toFixed(0)}</p>
                  <p>Delivery Rate ({deliveryRate.toFixed(0)}%) x 0.3 = {(deliveryRate * 0.3).toFixed(0)}</p>
                  <p>Active Conversations = {stats.totalConversations > 0 ? 20 : 0}</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Match Rate Hero */}
            <Card className="relative overflow-hidden border-0 rounded-xl shadow-lg bg-blue-500 dark:bg-blue-600">
              <div className="absolute w-40 h-40 -right-10 -bottom-10 rounded-full bg-white/10" />
              <CardContent className="relative z-10 p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-white/80">Overall Match Rate</p>
                  <p className="text-3xl sm:text-4xl font-bold text-white flex items-center gap-2 mt-1">
                    {(stats.overallMatchRate || 0).toFixed(1)}%
                    {stats.overallMatchRate >= 50 ? <TrendingUp className="h-5 w-5 text-white/70" /> : <TrendingDown className="h-5 w-5 text-white/70" />}
                  </p>
                  <p className="text-xs text-white/60 mt-1">{stats.totalMatched} of {stats.totalConversations} conversations matched</p>
                </div>
                <div className="h-16 w-16 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center shrink-0">
                  <Target className="h-8 w-8 text-white/70" />
                </div>
              </CardContent>
            </Card>

            {/* Message Status + Channel — side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Message Status */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Message Delivery</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {[
                      { label: 'Sent', value: msgStatus.sent || 0, icon: <Send className="h-3 w-3" />, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
                      { label: 'Delivered', value: msgStatus.delivered || 0, icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
                      { label: 'Read', value: msgStatus.read || 0, icon: <Eye className="h-3 w-3" />, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
                      { label: 'Pending', value: msgStatus.pending || 0, icon: <Clock className="h-3 w-3" />, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
                      { label: 'Failed', value: msgStatus.failed || 0, icon: <XCircle className="h-3 w-3" />, color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
                    ].map(s => (
                      <div key={s.label} className={cn('p-2 rounded-lg text-center', s.color.split(' ').slice(1).join(' '))}>
                        <div className={cn('flex items-center justify-center gap-0.5 mb-0.5', s.color.split(' ')[0])}>{s.icon}<span className="text-[10px]">{s.label}</span></div>
                        <p className={cn('text-lg font-bold', s.color.split(' ')[0])}>{s.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Channel Breakdown */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">By Channel</CardTitle></CardHeader>
                <CardContent>
                  {stats.channelBreakdown && Object.keys(stats.channelBreakdown).length > 0 ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      {Object.entries(stats.channelBreakdown).map(([ch, count]) => (
                        <div key={ch} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/50">
                          <span className="text-xs font-medium capitalize">{ch}</span>
                          <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">No channel data</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Outcomes ── */}
          <TabsContent value="outcomes" className="space-y-2 mt-4">
            {stats.outcomeStats?.length > 0 ? (
              stats.outcomeStats.map((o, i) => <OutcomeStatCard key={o.outcomeId} outcome={o} index={i} />)
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No outcomes configured</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => router.push(`/c/automation/${automationId}`)}>Configure Outcomes</Button>
              </div>
            )}
          </TabsContent>

          {/* ── Matches ── */}
          <TabsContent value="matches" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-600" />
                  Recent Matches
                  {stats.recentMatches?.length > 0 && <Badge variant="secondary" className="text-[10px]">{stats.recentMatches.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OutcomeMatchesSection matches={stats.recentMatches} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── History ── */}
          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Execution History
                  {stats.executions?.length > 0 && <Badge variant="secondary" className="text-[10px]">{stats.executions.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ExecutionHistorySection executions={stats.executions} automationId={automationId} router={router} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card><CardContent className="p-12 text-center text-muted-foreground">No statistics available</CardContent></Card>
      )}
    </div>
  );
}
