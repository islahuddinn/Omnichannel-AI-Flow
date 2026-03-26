// src/components/panels/superadmin/SystemMetrics.jsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import apiClient from '@/lib/api/client';
import socketClient from '@/lib/socket/client';

export default function SystemMetrics() {
  const [timeRange, setTimeRange] = useState('realtime');
  const [realtimeData, setRealtimeData] = useState([]);
  
  // ✅ Fetch conversation metrics with time range from API
  const { data: metricsData, isLoading, refetch } = useQuery({
    queryKey: ['system-metrics-conversations', timeRange],
    queryFn: () => apiClient.get('/system/metrics', {
      params: {
        includeConversations: 'true',
        timeRange: timeRange
      }
    }),
    refetchInterval: timeRange === 'realtime' ? 30000 : 60000, // Refresh every 30s for real-time, 60s for others
  });
  
  // ✅ Real-time socket updates for real-time tab only
  useEffect(() => {
    if (timeRange !== 'realtime') return;
    
    const socket = socketClient.getSuperAdminSocket();
    
    if (socket) {
      socket.on('metrics:update', (data) => {
        setRealtimeData(prev => {
          const updated = [...prev, {
            time: new Date(data.timestamp || Date.now()).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            }),
            conversations: data.activeConversations || 0
          }];
          
          // Keep only last 20 data points for smoother chart
          if (updated.length > 20) {
            updated.shift();
          }
          
          return updated;
        });
      });

      return () => {
        socket.off('metrics:update');
      };
    }
  }, [timeRange]);

  // ✅ Get display data - use real-time socket data for real-time tab, API data for others
  const displayData = timeRange === 'realtime' && realtimeData.length > 0
    ? realtimeData
    : (metricsData?.data?.conversations?.chartData || []);

  // ✅ Get current metrics
  const currentMetrics = {
    total: metricsData?.data?.conversations?.total || 0,
    active: metricsData?.data?.conversations?.active || 0,
    totalMessages: metricsData?.data?.conversations?.totalMessages || 0
  };

  // ✅ Refetch when time range changes
  useEffect(() => {
    if (timeRange !== 'realtime') {
      setRealtimeData([]); // Clear real-time data when switching tabs
    }
  }, [timeRange]);

  return (
    <Card className="col-span-full border-0 p-0 bg-card shadow-md"
          style={{
            borderRadius: '10px'
          }}>
      <CardHeader className="px-5 pt-5 pb-0">
        <CardTitle className="text-base font-semibold text-foreground"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 600,
                     fontSize: '16px',
                     lineHeight: '16px'
                   }}>
          System Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pt-5 pb-5">
        <Tabs value={timeRange} onValueChange={setTimeRange}>
          <TabsList className="h-9 p-0 gap-2 bg-transparent mb-6">
            <TabsTrigger 
              value="realtime" 
              className="h-9 px-[42px] py-4 rounded-lg border-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground transition-colors"
              style={{
                fontFamily: 'Nunito Sans, sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                lineHeight: '16px'
              }}>
              Real-Time
            </TabsTrigger>
            <TabsTrigger 
              value="24h" 
              className="h-9 px-[42px] py-4 rounded-xl border-0 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground transition-colors"
              style={{
                fontFamily: 'Nunito Sans, sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                lineHeight: '16px'
              }}>
              24 Hours
            </TabsTrigger>
            <TabsTrigger 
              value="7d" 
              className="h-9 px-[42px] py-4 rounded-xl border-0 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground transition-colors"
              style={{
                fontFamily: 'Nunito Sans, sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                lineHeight: '16px'
              }}>
              7 Days
            </TabsTrigger>
            <TabsTrigger 
              value="30d" 
              className="h-9 px-[42px] py-4 rounded-xl border-0 data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground transition-colors"
              style={{
                fontFamily: 'Nunito Sans, sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                lineHeight: '16px'
              }}>
              30 Days
            </TabsTrigger>
          </TabsList>

          {/* Real-Time Tab */}
          <TabsContent value="realtime" className="mt-0">
            <div className="w-full bg-card rounded-2xl border border-border p-6 md:p-8 shadow-sm"
                 style={{
                   borderRadius: '16px'
                 }}>
              {/* Analytics Overview Section */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-normal text-foreground"
                      style={{
                        fontFamily: 'Segoe UI Symbol, sans-serif',
                        fontWeight: 400,
                        fontSize: '20px',
                        lineHeight: '28px'
                      }}>
                    Analytics Overview
                  </h3>
                  <p className="text-sm text-muted-foreground"
                     style={{
                       fontFamily: 'Segoe UI Symbol, sans-serif',
                       fontWeight: 400,
                       fontSize: '14px',
                       lineHeight: '20px'
                     }}>
                    Real-time metrics dashboard
                  </p>
                </div>
                
                {/* Legend */}
                <div className="flex flex-row items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                    <span className="text-sm text-foreground"
                          style={{
                            fontFamily: 'Segoe UI Symbol, sans-serif',
                            fontWeight: 400,
                            fontSize: '14px',
                            lineHeight: '20px'
                          }}>
                      Conversations
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-secondary"></div>
                    <span className="text-sm text-foreground"
                          style={{
                            fontFamily: 'Segoe UI Symbol, sans-serif',
                            fontWeight: 400,
                            fontSize: '14px',
                            lineHeight: '20px'
                          }}>
                      Messages
                    </span>
                  </div>
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Total Conversations Card */}
                <div className="flex flex-col p-4 rounded-xl bg-primary/10"
                     style={{
                       borderRadius: '12px'
                     }}>
                  <div className="text-2xl font-normal text-foreground mb-1"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '24px',
                         lineHeight: '32px'
                       }}>
                    {isLoading ? '...' : currentMetrics.total.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '14px',
                         lineHeight: '20px'
                       }}>
                    Total Conversations
                  </div>
                  {currentMetrics.active > 0 && (
                    <div className="text-xs text-primary mt-1"
                         style={{
                           fontFamily: 'Segoe UI Symbol, sans-serif',
                           fontWeight: 400,
                           fontSize: '12px',
                           lineHeight: '16px'
                         }}>
                      {currentMetrics.active.toLocaleString()} active
                    </div>
                  )}
                </div>

                {/* Total Messages Card */}
                <div className="flex flex-col p-4 rounded-xl bg-primary/5"
                     style={{
                       borderRadius: '12px'
                     }}>
                  <div className="text-2xl font-normal text-foreground mb-1"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '24px',
                         lineHeight: '32px'
                       }}>
                    {isLoading ? '...' : currentMetrics.totalMessages.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '14px',
                         lineHeight: '20px'
                       }}>
                    Total Messages
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="w-full h-[280px] md:h-[320px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">Loading chart data...</div>
                  </div>
                ) : displayData.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">No data available for this time range</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayData}>
                      <defs>
                        <linearGradient id="colorConversations" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMessages" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        stroke="#E5E7EB" 
                        className="dark:stroke-gray-700" 
                      />
                      <XAxis 
                        dataKey="time" 
                        stroke="#6B7280" 
                        className="dark:stroke-gray-400"
                        tick={{ fill: '#6B7280', className: 'dark:fill-gray-400' }}
                        style={{ fontFamily: 'Segoe UI Symbol, sans-serif' }}
                      />
                      <YAxis 
                        stroke="#6B7280" 
                        className="dark:stroke-gray-400"
                        tick={{ fill: '#6B7280', className: 'dark:fill-gray-400' }}
                        style={{ fontFamily: 'Segoe UI Symbol, sans-serif' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                          fontFamily: 'Segoe UI Symbol, sans-serif'
                        }}
                        className="dark:bg-gray-800 dark:border-gray-700"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="conversations" 
                        stroke="#3B82F6" 
                        name="Conversations"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#3B82F6' }}
                        activeDot={{ r: 6 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="messages" 
                        stroke="#8B5CF6" 
                        name="Messages"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#8B5CF6' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </TabsContent>

          {/* 24 Hours Tab */}
          <TabsContent value="24h" className="mt-0">
            <div className="w-full bg-card rounded-2xl border border-border p-6 md:p-8 shadow-sm"
                 style={{
                   borderRadius: '16px'
                 }}>
              {/* Analytics Overview Section */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-normal text-foreground"
                      style={{
                        fontFamily: 'Segoe UI Symbol, sans-serif',
                        fontWeight: 400,
                        fontSize: '20px',
                        lineHeight: '28px'
                      }}>
                    Analytics Overview
                  </h3>
                  <p className="text-sm text-muted-foreground"
                     style={{
                       fontFamily: 'Segoe UI Symbol, sans-serif',
                       fontWeight: 400,
                       fontSize: '14px',
                       lineHeight: '20px'
                     }}>
                    24-hour metrics dashboard
                  </p>
                </div>
                
                {/* Legend */}
                <div className="flex flex-row items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                    <span className="text-sm text-foreground"
                          style={{
                            fontFamily: 'Segoe UI Symbol, sans-serif',
                            fontWeight: 400,
                            fontSize: '14px',
                            lineHeight: '20px'
                          }}>
                      Conversations
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-secondary"></div>
                    <span className="text-sm text-foreground"
                          style={{
                            fontFamily: 'Segoe UI Symbol, sans-serif',
                            fontWeight: 400,
                            fontSize: '14px',
                            lineHeight: '20px'
                          }}>
                      Messages
                    </span>
                  </div>
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Total Conversations Card */}
                <div className="flex flex-col p-4 rounded-xl bg-primary/10"
                     style={{
                       borderRadius: '12px'
                     }}>
                  <div className="text-2xl font-normal text-foreground mb-1"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '24px',
                         lineHeight: '32px'
                       }}>
                    {isLoading ? '...' : currentMetrics.total.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '14px',
                         lineHeight: '20px'
                       }}>
                    Total Conversations
                  </div>
                  {currentMetrics.active > 0 && (
                    <div className="text-xs text-primary mt-1"
                         style={{
                           fontFamily: 'Segoe UI Symbol, sans-serif',
                           fontWeight: 400,
                           fontSize: '12px',
                           lineHeight: '16px'
                         }}>
                      {currentMetrics.active.toLocaleString()} active
                    </div>
                  )}
                </div>

                {/* Total Messages Card */}
                <div className="flex flex-col p-4 rounded-xl bg-primary/5"
                     style={{
                       borderRadius: '12px'
                     }}>
                  <div className="text-2xl font-normal text-foreground mb-1"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '24px',
                         lineHeight: '32px'
                       }}>
                    {isLoading ? '...' : currentMetrics.totalMessages.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '14px',
                         lineHeight: '20px'
                       }}>
                    Total Messages
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="w-full h-[280px] md:h-[320px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">Loading chart data...</div>
                  </div>
                ) : displayData.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">No data available for this time range</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayData}>
                      <defs>
                        <linearGradient id="colorConversations24h" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMessages24h" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        stroke="#E5E7EB" 
                        className="dark:stroke-gray-700" 
                      />
                      <XAxis 
                        dataKey="time" 
                        stroke="#6B7280" 
                        className="dark:stroke-gray-400"
                        tick={{ fill: '#6B7280', className: 'dark:fill-gray-400' }}
                        style={{ fontFamily: 'Segoe UI Symbol, sans-serif' }}
                      />
                      <YAxis 
                        stroke="#6B7280" 
                        className="dark:stroke-gray-400"
                        tick={{ fill: '#6B7280', className: 'dark:fill-gray-400' }}
                        style={{ fontFamily: 'Segoe UI Symbol, sans-serif' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                          fontFamily: 'Segoe UI Symbol, sans-serif'
                        }}
                        className="dark:bg-gray-800 dark:border-gray-700"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="conversations" 
                        stroke="#3B82F6" 
                        name="Conversations"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#3B82F6' }}
                        activeDot={{ r: 6 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="messages" 
                        stroke="#8B5CF6" 
                        name="Messages"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#8B5CF6' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </TabsContent>

          {/* 7 Days Tab */}
          <TabsContent value="7d" className="mt-0">
            <div className="w-full bg-card rounded-2xl border border-border p-6 md:p-8 shadow-sm"
                 style={{
                   borderRadius: '16px'
                 }}>
              {/* Analytics Overview Section */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-normal text-foreground"
                      style={{
                        fontFamily: 'Segoe UI Symbol, sans-serif',
                        fontWeight: 400,
                        fontSize: '20px',
                        lineHeight: '28px'
                      }}>
                    Analytics Overview
                  </h3>
                  <p className="text-sm text-muted-foreground"
                     style={{
                       fontFamily: 'Segoe UI Symbol, sans-serif',
                       fontWeight: 400,
                       fontSize: '14px',
                       lineHeight: '20px'
                     }}>
                    7-day metrics dashboard
                  </p>
                </div>
                
                {/* Legend */}
                <div className="flex flex-row items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                    <span className="text-sm text-foreground"
                          style={{
                            fontFamily: 'Segoe UI Symbol, sans-serif',
                            fontWeight: 400,
                            fontSize: '14px',
                            lineHeight: '20px'
                          }}>
                      Conversations
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-secondary"></div>
                    <span className="text-sm text-foreground"
                          style={{
                            fontFamily: 'Segoe UI Symbol, sans-serif',
                            fontWeight: 400,
                            fontSize: '14px',
                            lineHeight: '20px'
                          }}>
                      Messages
                    </span>
                  </div>
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Total Conversations Card */}
                <div className="flex flex-col p-4 rounded-xl bg-primary/10"
                     style={{
                       borderRadius: '12px'
                     }}>
                  <div className="text-2xl font-normal text-foreground mb-1"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '24px',
                         lineHeight: '32px'
                       }}>
                    {isLoading ? '...' : currentMetrics.total.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '14px',
                         lineHeight: '20px'
                       }}>
                    Total Conversations
                  </div>
                  {currentMetrics.active > 0 && (
                    <div className="text-xs text-primary mt-1"
                         style={{
                           fontFamily: 'Segoe UI Symbol, sans-serif',
                           fontWeight: 400,
                           fontSize: '12px',
                           lineHeight: '16px'
                         }}>
                      {currentMetrics.active.toLocaleString()} active
                    </div>
                  )}
                </div>

                {/* Total Messages Card */}
                <div className="flex flex-col p-4 rounded-xl bg-primary/5"
                     style={{
                       borderRadius: '12px'
                     }}>
                  <div className="text-2xl font-normal text-foreground mb-1"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '24px',
                         lineHeight: '32px'
                       }}>
                    {isLoading ? '...' : currentMetrics.totalMessages.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '14px',
                         lineHeight: '20px'
                       }}>
                    Total Messages
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="w-full h-[280px] md:h-[320px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">Loading chart data...</div>
                  </div>
                ) : displayData.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">No data available for this time range</div>
                  </div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayData}>
                      <defs>
                        <linearGradient id="colorConversations7d" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMessages7d" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        stroke="#E5E7EB" 
                        className="dark:stroke-gray-700" 
                      />
                      <XAxis 
                        dataKey="time" 
                        stroke="#6B7280" 
                        className="dark:stroke-gray-400"
                        tick={{ fill: '#6B7280', className: 'dark:fill-gray-400' }}
                        style={{ fontFamily: 'Segoe UI Symbol, sans-serif' }}
                      />
                      <YAxis 
                        stroke="#6B7280" 
                        className="dark:stroke-gray-400"
                        tick={{ fill: '#6B7280', className: 'dark:fill-gray-400' }}
                        style={{ fontFamily: 'Segoe UI Symbol, sans-serif' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                          fontFamily: 'Segoe UI Symbol, sans-serif'
                        }}
                        className="dark:bg-gray-800 dark:border-gray-700"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="conversations" 
                        stroke="#3B82F6" 
                        name="Conversations"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#3B82F6' }}
                        activeDot={{ r: 6 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="messages" 
                        stroke="#8B5CF6" 
                        name="Messages"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#8B5CF6' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </TabsContent>

          {/* 30 Days Tab */}
          <TabsContent value="30d" className="mt-0">
            <div className="w-full bg-card rounded-2xl border border-border p-6 md:p-8 shadow-sm"
                 style={{
                   borderRadius: '16px'
                 }}>
              {/* Analytics Overview Section */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-xl font-normal text-foreground"
                      style={{
                        fontFamily: 'Segoe UI Symbol, sans-serif',
                        fontWeight: 400,
                        fontSize: '20px',
                        lineHeight: '28px'
                      }}>
                    Analytics Overview
                  </h3>
                  <p className="text-sm text-muted-foreground"
                     style={{
                       fontFamily: 'Segoe UI Symbol, sans-serif',
                       fontWeight: 400,
                       fontSize: '14px',
                       lineHeight: '20px'
                     }}>
                    30-day metrics dashboard
                  </p>
                </div>
                
                {/* Legend */}
                <div className="flex flex-row items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary"></div>
                    <span className="text-sm text-foreground"
                          style={{
                            fontFamily: 'Segoe UI Symbol, sans-serif',
                            fontWeight: 400,
                            fontSize: '14px',
                            lineHeight: '20px'
                          }}>
                      Conversations
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-secondary"></div>
                    <span className="text-sm text-foreground"
                   style={{
                            fontFamily: 'Segoe UI Symbol, sans-serif',
                     fontWeight: 400,
                            fontSize: '14px',
                            lineHeight: '20px'
                   }}>
                      Messages
                    </span>
                  </div>
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Total Conversations Card */}
                <div className="flex flex-col p-4 rounded-xl bg-primary/10"
                     style={{
                       borderRadius: '12px'
                     }}>
                  <div className="text-2xl font-normal text-foreground mb-1"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '24px',
                         lineHeight: '32px'
                       }}>
                    {isLoading ? '...' : currentMetrics.total.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '14px',
                         lineHeight: '20px'
                       }}>
                    Total Conversations
                  </div>
                  {currentMetrics.active > 0 && (
                    <div className="text-xs text-primary mt-1"
                         style={{
                           fontFamily: 'Segoe UI Symbol, sans-serif',
                           fontWeight: 400,
                           fontSize: '12px',
                           lineHeight: '16px'
                         }}>
                      {currentMetrics.active.toLocaleString()} active
            </div>
                  )}
                </div>

                {/* Total Messages Card */}
                <div className="flex flex-col p-4 rounded-xl bg-primary/5"
                     style={{
                       borderRadius: '12px'
                     }}>
                  <div className="text-2xl font-normal text-foreground mb-1"
                   style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                     fontWeight: 400,
                         fontSize: '24px',
                         lineHeight: '32px'
                   }}>
                    {isLoading ? '...' : currentMetrics.totalMessages.toLocaleString()}
              </div>
                  <div className="text-sm text-muted-foreground"
                       style={{
                         fontFamily: 'Segoe UI Symbol, sans-serif',
                         fontWeight: 400,
                         fontSize: '14px',
                         lineHeight: '20px'
                       }}>
                    Total Messages
            </div>
                </div>
              </div>

              {/* Chart */}
              <div className="w-full h-[280px] md:h-[320px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">Loading chart data...</div>
                  </div>
                ) : displayData.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-muted-foreground">No data available for this time range</div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayData}>
                      <defs>
                        <linearGradient id="colorConversations30d" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMessages30d" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        stroke="#E5E7EB" 
                        className="dark:stroke-gray-700" 
                      />
                      <XAxis 
                        dataKey="time" 
                        stroke="#6B7280" 
                        className="dark:stroke-gray-400"
                        tick={{ fill: '#6B7280', className: 'dark:fill-gray-400' }}
                        style={{ fontFamily: 'Segoe UI Symbol, sans-serif' }}
                      />
                      <YAxis 
                        stroke="#6B7280" 
                        className="dark:stroke-gray-400"
                        tick={{ fill: '#6B7280', className: 'dark:fill-gray-400' }}
                        style={{ fontFamily: 'Segoe UI Symbol, sans-serif' }}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                          fontFamily: 'Segoe UI Symbol, sans-serif'
                        }}
                        className="dark:bg-gray-800 dark:border-gray-700"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="conversations" 
                        stroke="#3B82F6" 
                        name="Conversations"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#3B82F6' }}
                        activeDot={{ r: 6 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="messages" 
                        stroke="#8B5CF6" 
                        name="Messages"
                        strokeWidth={2}
                        dot={{ r: 4, fill: '#8B5CF6' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
