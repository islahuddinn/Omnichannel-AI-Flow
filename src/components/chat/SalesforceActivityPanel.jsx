// src/components/chat/SalesforceActivityPanel.jsx
// Shows Salesforce update history + retry button for failed updates
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink,
  ChevronDown, ChevronUp, Loader2, Cloud, CloudOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';

function StatusIcon({ status }) {
  if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />;
  return <AlertTriangle className="h-4 w-4 text-amber-500" />;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getSfUrl(object, recordId) {
  const base = process.env.NEXT_PUBLIC_SALESFORCE_INSTANCE_URL || 'https://hmi1--dev1uat.sandbox.my.salesforce.com';
  return `${base}/${recordId}`;
}

export default function SalesforceActivityPanel({ conversationId }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const { data: log, isLoading } = useQuery({
    queryKey: ['sf-log', conversationId],
    queryFn: () => apiClient.get(`/conversations/${conversationId}/salesforce-log`),
    enabled: !!conversationId,
    staleTime: 30000,
  });

  const retryMutation = useMutation({
    mutationFn: async ({ matchId, automationId }) => {
      return apiClient.post(`/automations/${automationId}/outcome-matches/${matchId}/retry`);
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Salesforce update retried successfully');
        queryClient.invalidateQueries({ queryKey: ['sf-log', conversationId] });
      } else {
        toast.error(data.error || 'Retry failed');
      }
    },
    onError: (err) => toast.error(err.message || 'Retry failed'),
  });

  const entries = log?.data || [];
  const hasEntries = entries.length > 0;
  const successCount = entries.filter(e => e.status === 'success').length;
  const failedCount = entries.filter(e => e.status === 'failed').length;

  // Always show the panel — even with no data (shows "No updates yet")

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-[#00a884]" />
          <span className="text-sm font-medium">Salesforce Updates</span>
          {hasEntries && (
            <div className="flex items-center gap-1.5">
              {successCount > 0 && (
                <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                  {successCount} ✓
                </span>
              )}
              {failedCount > 0 && (
                <span className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                  {failedCount} ✗
                </span>
              )}
            </div>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2 max-h-[400px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No Salesforce updates yet</p>
          ) : (
            entries.map((entry, idx) => (
              <div key={`${entry.matchId}-${idx}`} className={cn(
                'rounded-lg p-2.5 text-xs',
                entry.status === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/10' :
                entry.status === 'failed' ? 'bg-red-50 dark:bg-red-900/10' :
                'bg-amber-50 dark:bg-amber-900/10'
              )}>
                <div className="flex items-start gap-2">
                  <StatusIcon status={entry.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">
                        {entry.object === 'Deal__c' ? 'Deal' : 'Contact'}
                      </span>
                      <span className={cn(
                        'text-[10px] px-1 py-0.5 rounded',
                        entry.status === 'success' ? 'bg-emerald-200/50 text-emerald-700 dark:text-emerald-400' :
                        entry.status === 'failed' ? 'bg-red-200/50 text-red-700 dark:text-red-400' :
                        'bg-amber-200/50 text-amber-700 dark:text-amber-400'
                      )}>
                        {entry.status}
                      </span>
                    </div>

                    {/* Fields updated */}
                    {entry.fieldsUpdated?.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {entry.fieldsUpdated.map((field, i) => (
                          <div key={i} className="flex items-center gap-1 text-muted-foreground flex-wrap">
                            <span className="text-foreground/80">{field}</span>
                            {entry.payload?.[field] !== undefined && (
                              <>
                                <span>→</span>
                                <span className="text-foreground font-medium break-all">
                                  {String(entry.payload[field])}
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Error message */}
                    {entry.error && (
                      <p className="mt-1 text-red-600 dark:text-red-400 break-words">{entry.error}</p>
                    )}
                    {entry.reason && entry.status !== 'success' && (
                      <p className="mt-0.5 text-muted-foreground">{entry.reason}</p>
                    )}

                    {/* Footer: time + links */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-muted-foreground">{formatDate(entry.updatedAt)}</span>
                      {entry.outcomeName && (
                        <span className="text-muted-foreground">• {entry.outcomeName}</span>
                      )}
                      {entry.recordId && (
                        <a
                          href={getSfUrl(entry.object, entry.recordId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#00a884] hover:underline flex items-center gap-0.5"
                          onClick={e => e.stopPropagation()}
                        >
                          View <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Retry button for failed */}
                  {entry.status === 'failed' && entry.matchId && entry.automationId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => retryMutation.mutate({ matchId: entry.matchId, automationId: entry.automationId })}
                      disabled={retryMutation.isPending}
                    >
                      {retryMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <><RefreshCw className="h-3 w-3 mr-1" />Retry</>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
