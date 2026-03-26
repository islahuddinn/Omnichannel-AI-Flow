'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Brain, Tag, X, ChevronDown, ChevronUp, Flame, Frown, Meh, Smile, Sparkles, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

const sentimentTheme = {
  positive: {
    bar: 'bg-emerald-500',
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-emerald-200 dark:border-emerald-800',
    header: 'text-emerald-700 dark:text-emerald-400',
    text: 'text-slate-700 dark:text-slate-300',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800',
    topicBg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
    icon: Smile,
  },
  neutral: {
    bar: 'bg-slate-400',
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-slate-200 dark:border-slate-700',
    header: 'text-slate-600 dark:text-slate-400',
    text: 'text-slate-700 dark:text-slate-300',
    badge: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
    topicBg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    icon: Meh,
  },
  negative: {
    bar: 'bg-amber-500',
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-amber-200 dark:border-amber-800',
    header: 'text-amber-700 dark:text-amber-400',
    text: 'text-slate-700 dark:text-slate-300',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800',
    topicBg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
    icon: Frown,
  },
  frustrated: {
    bar: 'bg-orange-500',
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-orange-200 dark:border-orange-800',
    header: 'text-orange-700 dark:text-orange-400',
    text: 'text-slate-700 dark:text-slate-300',
    badge: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800',
    topicBg: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
    icon: Flame,
  },
  angry: {
    bar: 'bg-red-500',
    bg: 'bg-white dark:bg-slate-900',
    border: 'border-red-200 dark:border-red-800',
    header: 'text-red-700 dark:text-red-400',
    text: 'text-slate-700 dark:text-slate-300',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800',
    topicBg: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
    icon: Flame,
  },
};

const priorityConfig = {
  urgent: { label: 'URGENT', bg: 'bg-red-500 text-white', pulse: true },
  high: { label: 'HIGH', bg: 'bg-orange-500 text-white', pulse: false },
};

export default function HandoffSummaryCard({ conversation }) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [streamedSummary, setStreamedSummary] = useState('');
  const streamRef = useRef(null);
  const prevSummaryRef = useRef('');
  const prevConvId = useRef(null);

  const metadata = conversation?.metadata;
  const summary = metadata?.handoffSummary;
  const sentiment = metadata?.sentiment;
  const topics = metadata?.topics;
  const botFailure = conversation?.botFailure;
  const hasData = summary || botFailure?.failed;

  // Reset when conversation changes
  useEffect(() => {
    if (conversation?._id !== prevConvId.current) {
      prevConvId.current = conversation?._id;
      setIsDismissed(false);
      setIsExpanded(false);
      setAnimateIn(false);
      setStreamedSummary('');
      prevSummaryRef.current = '';

      if (hasData) {
        setTimeout(() => setAnimateIn(true), 150);
      }
    }
  }, [conversation?._id, hasData]);

  // Animate in when data arrives dynamically (socket update)
  useEffect(() => {
    if (hasData && !isDismissed && !animateIn) {
      setTimeout(() => setAnimateIn(true), 150);
    }
  }, [hasData, isDismissed, animateIn]);

  // Stream summary text when expanded
  useEffect(() => {
    if (!isExpanded || !summary || summary === prevSummaryRef.current) return;
    prevSummaryRef.current = summary;

    if (streamRef.current) clearInterval(streamRef.current);
    setStreamedSummary('');

    let i = 0;
    streamRef.current = setInterval(() => {
      if (i < summary.length) {
        setStreamedSummary(summary.substring(0, i + 1));
        i++;
      } else {
        clearInterval(streamRef.current);
        streamRef.current = null;
      }
    }, 10);

    return () => { if (streamRef.current) clearInterval(streamRef.current); };
  }, [isExpanded, summary]);

  if (!hasData || isDismissed) return null;

  const priority = conversation?.priority || 'normal';
  const pConfig = priorityConfig[priority];
  const theme = sentimentTheme[sentiment] || sentimentTheme.neutral;
  const SentimentIcon = theme.icon;
  const displaySummary = isExpanded ? (streamedSummary || summary) : '';
  const isStreaming = streamedSummary && streamedSummary.length < (summary?.length || 0);

  const handleDismiss = (e) => {
    e.stopPropagation();
    setAnimateIn(false);
    setTimeout(() => setIsDismissed(true), 250);
  };

  const handleToggle = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
      setStreamedSummary('');
      prevSummaryRef.current = '';
    }
  };

  return (
    <div
      className={cn(
        'mx-3 mt-2 mb-1 rounded-lg border overflow-hidden shadow-sm cursor-pointer select-none transition-all duration-300 ease-out',
        theme.bg, theme.border,
        animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'
      )}
      onClick={handleToggle}
    >
      {/* Colored top bar */}
      <div className={cn('h-0.5', theme.bar)} />

      {/* Compact header — always visible */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className={cn('h-3.5 w-3.5 flex-shrink-0', theme.header)} />
          <span className={cn('text-[11px] font-semibold uppercase tracking-wider', theme.header)}>
            AI Summary
          </span>
          {!isExpanded && (
            <span className="text-[11px] text-muted-foreground ml-1 truncate max-w-[200px]">
              — Click to view
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {sentiment && (
            <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border font-medium capitalize', theme.badge)}>
              <SentimentIcon className="h-2.5 w-2.5" />
              {sentiment}
            </span>
          )}

          {pConfig && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-bold tracking-wide', pConfig.bg, pConfig.pulse && 'animate-pulse')}>
              {pConfig.label}
            </span>
          )}

          <button
            onClick={handleDismiss}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Expandable body */}
      <div className={cn(
        'transition-all duration-300 ease-in-out overflow-hidden',
        isExpanded ? 'max-h-[250px] opacity-100' : 'max-h-0 opacity-0'
      )}>
        <div className={cn('px-3 pb-3 pt-0', theme.text)}>
          {/* Summary with streaming */}
          {displaySummary && (
            <p className="text-[13px] leading-relaxed mb-2">
              {displaySummary}
              {isStreaming && (
                <span className="inline-block w-[2px] h-3.5 bg-current animate-pulse ml-0.5 align-text-bottom rounded-full" />
              )}
            </p>
          )}

          {/* Bot failure */}
          {botFailure?.failed && !summary && (
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              <span className="text-xs">Bot failed — {botFailure.reason || 'unknown'}</span>
            </div>
          )}

          {/* Topics */}
          {topics && topics.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <Tag className="h-3 w-3 opacity-40 flex-shrink-0" />
              {topics.map((topic, i) => (
                <span key={i} className={cn('text-[10px] px-2 py-0.5 rounded-md font-medium', theme.topicBg)}>
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
