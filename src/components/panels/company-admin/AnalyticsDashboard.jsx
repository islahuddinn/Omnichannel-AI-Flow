// src/components/panels/company-admin/AnalyticsDashboard.jsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Bot, Cloud, Zap } from 'lucide-react';
import { ACTIVE_TAB_CLASSES } from '@/constants/ui';
import BotAnalyticsDashboard from './BotAnalyticsDashboard';
import SalesforceAnalyticsDashboard from './SalesforceAnalyticsDashboard';
import OWMAnalyticsDashboard from './OWMAnalyticsDashboard';

const COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
const STATUS_COLORS = { active: '#10b981', open: '#3b82f6', pending: '#f59e0b', closed: '#6b7280', archived: '#9ca3af', deleted: '#ef4444' };
const CHANNEL_COLORS = { whatsapp: '#25d366', email: '#4f46e5', sms: '#f59e0b', webchat: '#06b6d4', facebook: '#1877f2', instagram: '#e4405f' };

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm" style={{ color: p.color }}>{p.name}: <span className="font-semibold">{p.value}</span></p>
      ))}
    </div>
  );
};

export default function AnalyticsDashboard({
  overview, conversations, agents,
  botAnalytics, botLoading, botError,
  sfAnalytics, sfLoading, sfError,
  owmAnalytics, owmLoading, owmError,
}) {
  // Format data for proper display
  const statusData = (conversations?.byStatus || []).map(s => ({
    name: capitalize(s._id || 'unknown'),
    count: s.count,
    color: STATUS_COLORS[s._id] || '#6b7280',
  }));

  const channelData = (overview?.conversationsByChannel || []).map(c => ({
    channel: capitalize(c.channel || c._id || 'unknown'),
    count: c.count,
    color: CHANNEL_COLORS[c.channel || c._id] || '#4f46e5',
  }));

  const agentData = (agents || []).map(a => ({
    ...a,
    name: a.name || 'Unknown',
  }));

  return (
    <Tabs defaultValue="conversations">
      <TabsList className="flex flex-wrap gap-1 px-2 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-auto py-1">
        <TabsTrigger value="conversations" className={`cursor-pointer text-xs sm:text-sm px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 ${ACTIVE_TAB_CLASSES.trigger}`}>
          Conversations
        </TabsTrigger>
        <TabsTrigger value="agents" className={`cursor-pointer text-xs sm:text-sm px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 ${ACTIVE_TAB_CLASSES.trigger}`}>
          Agents
        </TabsTrigger>
        <TabsTrigger value="channels" className={`cursor-pointer text-xs sm:text-sm px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 ${ACTIVE_TAB_CLASSES.trigger}`}>
          Channels
        </TabsTrigger>
        <TabsTrigger value="bot" className={`flex items-center gap-1 cursor-pointer text-xs sm:text-sm px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 ${ACTIVE_TAB_CLASSES.trigger}`}>
          <Bot className="h-3.5 w-3.5" />
          AI Bot
        </TabsTrigger>
        <TabsTrigger value="owm" className={`flex items-center gap-1 cursor-pointer text-xs sm:text-sm px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 ${ACTIVE_TAB_CLASSES.trigger}`}>
          <Zap className="h-3.5 w-3.5" />
          OWM
        </TabsTrigger>
        <TabsTrigger value="salesforce" className={`flex items-center gap-1 cursor-pointer text-xs sm:text-sm px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 ${ACTIVE_TAB_CLASSES.trigger}`}>
          <Cloud className="h-3.5 w-3.5" />
          Salesforce
        </TabsTrigger>
      </TabsList>

      <TabsContent value="conversations" className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{conversations?.totalConversations || 0}</p></CardContent></Card>
          {statusData.map(s => (
            <Card key={s.name}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.name}</p>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
            </CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">By Status</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={statusData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={40} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Trend</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={conversations?.trend || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d?.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} dot={false} name="Conversations" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="agents" className="space-y-6">
        {agentData.length > 0 ? (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">Agent Performance</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={agentData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="assignedConversations" fill="#4f46e5" name="Assigned" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="resolvedConversations" fill="#10b981" name="Resolved" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="totalMessages" fill="#06b6d4" name="Messages" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {/* Agent list */}
            <Card>
              <CardHeader><CardTitle className="text-base">Agent Details</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {agentData.map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.email}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-center"><p className="font-bold text-primary">{a.assignedConversations}</p><p className="text-muted-foreground">Assigned</p></div>
                        <div className="text-center"><p className="font-bold text-emerald-600">{a.resolvedConversations}</p><p className="text-muted-foreground">Resolved</p></div>
                        <div className="text-center"><p className="font-bold text-cyan-600">{a.totalMessages}</p><p className="text-muted-foreground">Messages</p></div>
                        <div className="text-center"><p className="font-bold">{a.resolutionRate}%</p><p className="text-muted-foreground">Rate</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">No agent data available</div>
        )}
      </TabsContent>

      <TabsContent value="channels" className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Conversations by Channel</CardTitle></CardHeader>
          <CardContent>
            {channelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={channelData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Conversations" radius={[4, 4, 0, 0]}>
                    {channelData.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No channel data available</div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="bot" className="space-y-6">
        {botLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : botError ? (
          <div className="text-center py-12 text-muted-foreground">Failed to load bot analytics.</div>
        ) : (
          <BotAnalyticsDashboard data={botAnalytics} />
        )}
      </TabsContent>

      <TabsContent value="owm" className="space-y-6">
        {owmLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : owmError ? (
          <div className="text-center py-12 text-muted-foreground">Failed to load OWM analytics.</div>
        ) : (
          <OWMAnalyticsDashboard data={owmAnalytics} />
        )}
      </TabsContent>

      <TabsContent value="salesforce" className="space-y-6">
        {sfLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : sfError ? (
          <div className="text-center py-12 text-muted-foreground">Failed to load Salesforce analytics.</div>
        ) : (
          <SalesforceAnalyticsDashboard data={sfAnalytics} />
        )}
      </TabsContent>
    </Tabs>
  );
}
