// src/components/modals/AutomationStatsModal.jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, TrendingDown, CheckCircle2, XCircle, BarChart3, Target, Zap, Users, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api/client';

export default function AutomationStatsModal({ open, onOpenChange, automationId, automationName }) {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['automation-stats', automationId],
    queryFn: async () => {
      const result = await apiClient.get(`/automations/${automationId}/stats`);
      return result.data;
    },
    enabled: open && !!automationId,
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3 }}
            >
              <DialogHeader>
                <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-2">
                  <BarChart3 className="h-6 w-6 text-purple-600" />
                  Automation Statistics
                </DialogTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {automationName}
                </p>
              </DialogHeader>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
              ) : error ? (
                <div className="text-center py-12 text-red-600">
                  Failed to load statistics
                </div>
              ) : stats ? (
                <div className="space-y-6 mt-4">
                  {/* Overall Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                      title="Total Messages"
                      value={stats.totalMessages}
                      icon={<MessageSquare className="h-5 w-5" />}
                      color="blue"
                      delay={0.1}
                    />
                    <StatCard
                      title="Total Conversations"
                      value={stats.totalConversations}
                      icon={<Users className="h-5 w-5" />}
                      color="purple"
                      delay={0.2}
                    />
                    <StatCard
                      title="Matched Outcomes"
                      value={stats.totalMatched}
                      icon={<CheckCircle2 className="h-5 w-5" />}
                      color="green"
                      delay={0.3}
                    />
                    <StatCard
                      title="Unmatched"
                      value={stats.totalUnmatched}
                      icon={<XCircle className="h-5 w-5" />}
                      color="orange"
                      delay={0.4}
                    />
                  </div>

                  {/* Match Rate Card */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Card className="bg-gradient-to-r from-purple-500 to-blue-500 border-0 shadow-xl">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-purple-100 text-sm font-medium mb-1">Overall Match Rate</p>
                            <div className="flex items-baseline gap-2">
                              <span className="text-4xl font-bold text-white">
                                {stats.overallMatchRate}%
                              </span>
                              {stats.overallMatchRate >= 50 ? (
                                <TrendingUp className="h-6 w-6 text-green-200" />
                              ) : (
                                <TrendingDown className="h-6 w-6 text-red-200" />
                              )}
                            </div>
                          </div>
                          <div className="relative w-32 h-32">
                            <svg className="transform -rotate-90 w-32 h-32">
                              <circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="rgba(255,255,255,0.2)"
                                strokeWidth="12"
                                fill="none"
                              />
                              <motion.circle
                                cx="64"
                                cy="64"
                                r="56"
                                stroke="white"
                                strokeWidth="12"
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 56}`}
                                initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
                                animate={{ 
                                  strokeDashoffset: 2 * Math.PI * 56 * (1 - stats.overallMatchRate / 100)
                                }}
                                transition={{ duration: 1.5, ease: "easeOut" }}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Target className="h-8 w-8 text-white" />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Outcome Statistics */}
                  {stats.outcomeStats && stats.outcomeStats.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                    >
                      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-yellow-500" />
                            Outcome Performance
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {stats.outcomeStats.map((outcome, index) => (
                              <OutcomeStatCard
                                key={outcome.outcomeId}
                                outcome={outcome}
                                index={index}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}

                  {/* Message Status Breakdown */}
                  {stats.messageStatusBreakdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 }}
                    >
                      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-lg">
                        <CardHeader>
                          <CardTitle>Message Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-4">
                            <StatusBadge
                              label="Sent"
                              value={stats.messageStatusBreakdown.sent}
                              color="green"
                            />
                            <StatusBadge
                              label="Failed"
                              value={stats.messageStatusBreakdown.failed}
                              color="red"
                            />
                            <StatusBadge
                              label="Pending"
                              value={stats.messageStatusBreakdown.pending}
                              color="yellow"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </div>
              ) : null}
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}

function StatCard({ title, value, icon, color, delay }) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    green: 'from-green-500 to-green-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <Card className={cn(
        "bg-gradient-to-br border-0 shadow-lg overflow-hidden",
        colorClasses[color]
      )}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium mb-1">{title}</p>
              <motion.p
                className="text-3xl font-bold text-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: delay + 0.2 }}
              >
                {value || 0}
              </motion.p>
            </div>
            <motion.div
              className="bg-white/20 rounded-full p-3"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: delay + 0.1, type: "spring" }}
            >
              <div className="text-white">
                {icon}
              </div>
            </motion.div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function OutcomeStatCard({ outcome, index }) {
  const matchRate = parseFloat(outcome.matchRate) || 0;
  const total = outcome.total || 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 * index, duration: 0.3 }}
    >
      <Card className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-1">
                {outcome.outcomeName}
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                {outcome.possibleOutcome}
              </p>
            </div>
            <Badge
              variant={matchRate >= 50 ? "default" : "secondary"}
              className={cn(
                matchRate >= 50
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
              )}
            >
              {matchRate}% Match
            </Badge>
          </div>

          <div className="space-y-2">
            {/* Progress Bar */}
            <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className={cn(
                  "h-full rounded-full",
                  matchRate >= 50 ? "bg-gradient-to-r from-green-500 to-green-600" : "bg-gradient-to-r from-orange-500 to-orange-600"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${matchRate}%` }}
                transition={{ duration: 1, delay: 0.2 * index, ease: "easeOut" }}
              />
            </div>

            {/* Stats Row */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">{outcome.matched}</span>
                  <span className="text-gray-500">matched</span>
                </div>
                <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
                  <XCircle className="h-4 w-4" />
                  <span className="font-medium">{outcome.unmatched}</span>
                  <span className="text-gray-500">unmatched</span>
                </div>
              </div>
              <span className="text-gray-500 text-xs">
                Total: {total}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatusBadge({ label, value, color }) {
  const colorClasses = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800',
    red: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-800',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "p-4 rounded-lg border-2 text-center",
        colorClasses[color]
      )}
    >
      <p className="text-sm font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold">{value || 0}</p>
    </motion.div>
  );
}

