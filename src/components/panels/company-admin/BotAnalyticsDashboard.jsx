// src/components/panels/company-admin/BotAnalyticsDashboard.jsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
  Bot, Zap, ArrowUpRight, ArrowDownRight, Clock, MessageSquare,
  ThumbsUp, ThumbsDown, DollarSign, Globe, TrendingUp, AlertTriangle,
  Users, Activity, Coins, Languages,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral: '#6b7280',
  negative: '#f59e0b',
  frustrated: '#ef4444',
  angry: '#dc2626',
};

const LANGUAGE_NAMES = {
  en: 'English', sk: 'Slovak', cs: 'Czech', de: 'German', pl: 'Polish',
  hu: 'Hungarian', ro: 'Romanian', hr: 'Croatian', sl: 'Slovenian',
  bg: 'Bulgarian', uk: 'Ukrainian', ru: 'Russian', fr: 'French',
  es: 'Spanish', it: 'Italian', pt: 'Portuguese', nl: 'Dutch',
  tr: 'Turkish', ar: 'Arabic', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
};

function StatCard({ title, value, subtitle, icon: Icon, trend, trendLabel, className }) {
  const isPositive = trend > 0;
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-xl sm:text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {Icon && (
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
          )}
        </div>
        {trend !== undefined && trend !== null && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            {isPositive ? (
              <ArrowUpRight className="h-3 w-3 text-emerald-500" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-red-500" />
            )}
            <span className={isPositive ? 'text-emerald-500' : 'text-red-500'}>
              {Math.abs(trend)}%
            </span>
            {trendLabel && <span className="text-muted-foreground">{trendLabel}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatMs(ms) {
  if (!ms || ms === 0) return '0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatCost(cost) {
  if (!cost || cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm" style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function BotAnalyticsDashboard({ data }) {
  if (!data) return null;

  const { summary, satisfaction, cost, tokens, sentiment, channels, handoffReasons, languages, dailyVolume, hourlyDistribution, topQuestions, priority } = data;

  // Prepare sentiment chart data
  const sentimentData = Object.entries(sentiment || {})
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ name: key.charAt(0).toUpperCase() + key.slice(1), value, color: SENTIMENT_COLORS[key] || '#6b7280' }));

  // Prepare channel chart data
  const channelData = Object.entries(channels || {}).map(([key, value]) => ({
    channel: key.charAt(0).toUpperCase() + key.slice(1),
    count: value,
  }));

  // Prepare handoff reasons data
  const handoffData = Object.entries(handoffReasons || {}).map(([key, value]) => ({
    name: key, value,
  }));

  // Prepare language data
  const languageData = Object.entries(languages || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([code, count]) => ({
      language: LANGUAGE_NAMES[code] || code.toUpperCase(),
      code,
      count,
    }));

  // Cost by provider data
  const costByProviderData = Object.entries(cost?.byProvider || {}).map(([provider, data]) => ({
    provider: provider.charAt(0).toUpperCase() + provider.slice(1),
    totalCost: data.totalCost,
    count: data.count,
  }));

  return (
    <div className="space-y-6">
      {/* ── Summary Cards Row 1 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard
          title="Bot Resolution Rate"
          value={`${summary?.botResolutionRate || 0}%`}
          subtitle={`${summary?.totalBotResponses || 0} responses`}
          icon={Bot}
        />
        <StatCard
          title="Bot Avg Response"
          value={formatMs(summary?.avgBotResponseTimeMs)}
          subtitle={`Min: ${formatMs(summary?.minBotResponseTimeMs)}`}
          icon={Zap}
        />
        <StatCard
          title="Human Avg Response"
          value={formatMs(summary?.avgHumanResponseTimeMs)}
          subtitle="First reply time"
          icon={Clock}
        />
        <StatCard
          title="Handoff Rate"
          value={`${summary?.handoffRate || 0}%`}
          subtitle={`${summary?.handoffConversations || 0} handoffs`}
          icon={Users}
        />
        <StatCard
          title="Satisfaction"
          value={satisfaction?.satisfactionRate !== null ? `${satisfaction?.satisfactionRate}%` : 'N/A'}
          subtitle={`${satisfaction?.totalRatings || 0} ratings`}
          icon={ThumbsUp}
        />
        <StatCard
          title="Total Cost"
          value={formatCost(cost?.totalCost)}
          subtitle={`${tokens?.totalTokens?.toLocaleString() || 0} tokens`}
          icon={DollarSign}
        />
      </div>

      {/* ── Summary Cards Row 2 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Active Conversations"
          value={summary?.totalConversations || 0}
          subtitle={`${summary?.autoConversations || 0} auto / ${summary?.manualConversations || 0} manual`}
          icon={MessageSquare}
        />
        <StatCard
          title="Bot Failures"
          value={summary?.botFailedConversations || 0}
          icon={AlertTriangle}
        />
        <StatCard
          title="Inbound Messages"
          value={summary?.totalInboundMessages?.toLocaleString() || 0}
          icon={Activity}
        />
        <StatCard
          title="Avg Tokens/Response"
          value={tokens?.avgTokensPerResponse || 0}
          subtitle={`In: ${tokens?.totalInputTokens?.toLocaleString() || 0} / Out: ${tokens?.totalOutputTokens?.toLocaleString() || 0}`}
          icon={Coins}
        />
      </div>

      {/* ── Charts Row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Daily Volume Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Daily Message Volume</CardTitle>
            <CardDescription>Bot responses vs customer messages</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailyVolume || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area type="monotone" dataKey="customer" stackId="1" stroke="#6b7280" fill="#6b728033" name="Customer" />
                <Area type="monotone" dataKey="bot" stackId="1" stroke="#4f46e5" fill="#4f46e533" name="Bot" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Response Time Comparison */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Response Time: Bot vs Human</CardTitle>
            <CardDescription>Average first response time comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6 pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="font-medium">AI Bot</span>
                  </div>
                  <span className="font-bold text-primary">{formatMs(summary?.avgBotResponseTimeMs)}</span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{
                      width: `${Math.min(100, summary?.avgHumanResponseTimeMs > 0
                        ? ((summary?.avgBotResponseTimeMs || 0) / summary.avgHumanResponseTimeMs) * 100
                        : 50
                      )}%`,
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Human Agents</span>
                  </div>
                  <span className="font-bold text-muted-foreground">{formatMs(summary?.avgHumanResponseTimeMs)}</span>
                </div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-muted-foreground/50 w-full" />
                </div>
              </div>
              {summary?.avgBotResponseTimeMs > 0 && summary?.avgHumanResponseTimeMs > 0 && (
                <div className="text-center pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    Bot is <span className="font-bold text-primary">
                      {Math.round(summary.avgHumanResponseTimeMs / summary.avgBotResponseTimeMs)}x faster
                    </span> than human agents
                  </p>
                </div>
              )}

              {/* Satisfaction mini-chart */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-3">Bot Response Quality</p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <ThumbsUp className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{satisfaction?.thumbsUp || 0}</p>
                      <p className="text-xs text-muted-foreground">Helpful</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                      <ThumbsDown className="h-4 w-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{satisfaction?.thumbsDown || 0}</p>
                      <p className="text-xs text-muted-foreground">Not helpful</p>
                    </div>
                  </div>
                  {satisfaction?.satisfactionRate !== null && (
                    <div className="ml-auto text-right">
                      <p className="text-2xl font-bold text-primary">{satisfaction.satisfactionRate}%</p>
                      <p className="text-xs text-muted-foreground">Satisfaction</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row 2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Sentiment Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Customer Sentiment</CardTitle>
          </CardHeader>
          <CardContent>
            {sentimentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={sentimentData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {sentimentData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                No sentiment data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Handoff Reasons */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Handoff Reasons</CardTitle>
            <CardDescription>Why conversations were escalated</CardDescription>
          </CardHeader>
          <CardContent>
            {handoffData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={handoffData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {handoffData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                No handoff data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Channel Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Bot Responses by Channel</CardTitle>
          </CardHeader>
          <CardContent>
            {channelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={channelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="channel" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} name="Responses" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                No channel data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Charts Row 3 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Hourly Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Hourly Activity</CardTitle>
            <CardDescription>When your bot is busiest</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hourlyDistribution || []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#06b6d4" radius={[2, 2, 0, 0]} name="Bot Responses" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Language Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Languages className="h-5 w-5 text-primary" />
              <CardTitle className="text-base sm:text-lg">Languages Detected</CardTitle>
            </div>
            <CardDescription>Customer message languages (auto-detected)</CardDescription>
          </CardHeader>
          <CardContent>
            {languageData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={languageData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="language" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Messages" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
                No language data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Questions + Cost ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top Questions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Top Customer Questions</CardTitle>
            <CardDescription>Most frequent queries handled by bot</CardDescription>
          </CardHeader>
          <CardContent>
            {topQuestions && topQuestions.length > 0 ? (
              <div className="space-y-2 max-h-[320px] overflow-y-auto">
                {topQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{q.question}</p>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                      {q.count}x
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                No question data yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Tracking */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <CardTitle className="text-base sm:text-lg">Cost Tracking</CardTitle>
            </div>
            <CardDescription>AI provider usage and costs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Total cost summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xl sm:text-2xl font-bold">{formatCost(cost?.totalCost)}</p>
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xl sm:text-2xl font-bold">{formatCost(cost?.avgCostPerConversation)}</p>
                  <p className="text-xs text-muted-foreground">Per Conversation</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <p className="text-xl sm:text-2xl font-bold">{tokens?.totalTokens?.toLocaleString() || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Tokens</p>
                </div>
              </div>

              {/* Cost by provider */}
              {costByProviderData.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">By Provider</p>
                  {costByProviderData.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-sm font-medium">{p.provider}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{formatCost(p.totalCost)}</p>
                        <p className="text-xs text-muted-foreground">{p.count} responses</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Cost data will appear after bot processes messages with the new tracking
                </div>
              )}

              {/* Token breakdown */}
              <div className="pt-3 border-t">
                <p className="text-sm font-medium mb-2">Token Usage</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Input: {tokens?.totalInputTokens?.toLocaleString() || 0}</span>
                      <span>Output: {tokens?.totalOutputTokens?.toLocaleString() || 0}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${tokens?.totalTokens > 0 ? (tokens.totalInputTokens / tokens.totalTokens * 100) : 50}%`,
                        }}
                      />
                      <div className="h-full bg-cyan-500 flex-1" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Priority Breakdown ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Conversation Priority Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'low', label: 'Low', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
              { key: 'normal', label: 'Normal', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
              { key: 'high', label: 'High', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
              { key: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
            ].map(p => (
              <div key={p.key} className={cn('rounded-lg p-3 text-center', p.color)}>
                <p className="text-2xl font-bold">{priority?.[p.key] || 0}</p>
                <p className="text-xs font-medium">{p.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
