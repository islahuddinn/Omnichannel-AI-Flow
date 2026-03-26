"use client";

import React, { useState, useMemo } from "react";
import AgentOverviewTable from "@/components/panels/company-admin/call-center/statistics/AgentOverviewTable";
import { FilterSection } from "@/components/panels/company-admin/call-center/statistics/FilterSection";
import { StatCard } from "@/components/panels/company-admin/call-center/statistics/StatsCard";
import Pagination from "@/components/shared/Pagination";
import { useCallSentiment } from "@/hooks/useCallSentiment";
import StatisticsErrorState from "@/components/panels/company-admin/call-center/statistics/StatisticsErrorState";
import StatisticsLoadingState from "@/components/shared/loading-states/call-statistics/StatisticsLoadingState";
import {
  Clock,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
} from "lucide-react";

function CallStatisticsPage() {
  // State for filters
  const [filters, setFilters] = useState({
    filter: "allcalls", // incoming, outgoing, allcalls
    country: "All", // CZ, SK, All
    time_period: null, // 0 (today), 1, 3, 7, 30, 90 - null until user clicks
  });

  // State for pagination
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
  });

  // Build query params
  const queryParams = useMemo(() => {
    const params = {
      page: pagination.page,
      limit: pagination.limit,
      filter: filters.filter !== "allcalls" ? filters.filter : undefined,
      country: filters.country !== "All" ? filters.country : undefined,
    };

    // Only add time_period if it's been set by user clicking a date filter
    if (filters.time_period !== null && filters.time_period !== undefined) {
      params.time_period = filters.time_period;
    }

    return params;
  }, [pagination, filters]);

  // Fetch data
  const { data, isLoading, isError, error, refetch } =
    useCallSentiment(queryParams);

  const stats = data?.stats || {};
  const agents = data?.agents || [];
  const paginationData = data?.pagination || {};

  // Helper function to parse time string (HH:MM:SS) to display format
  const formatTime = (timeString) => {
    if (!timeString || timeString === "00:00:00") return "0m 0s";
    const parts = timeString.split(":");
    if (parts.length === 3) {
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = parseInt(parts[2]);

      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m ${seconds}s`;
    }
    return timeString;
  };

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page on filter change
  };

  // Handle pagination changes
  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  // Loading state
  if (isLoading) {
    return <StatisticsLoadingState />;
  }

  // Error state
  if (isError) {
    return <StatisticsErrorState error={error} onRetry={refetch} />;
  }

  return (
    <div className="w-full py-8 px-8 space-y-6">
      {/* Header Section */}
      <div className="flex flex-row justify-between items-center">
        <div className="flex flex-col items-start">
          <h1 className="text-[28px] font-semibold leading-[38px] tracking-[-0.114286px] text-foreground">
            Call Statistics
          </h1>
          <p className="text-lg font-normal leading-[25px] tracking-[-0.114286px] text-muted-foreground">
            Manage your call statistics.
          </p>
        </div>
      </div>

      {/* Filters */}
      <FilterSection filters={filters} onFilterChange={handleFilterChange} />

      {/* Statistics Section */}
      <div className="space-y-6">
        <h2 className="text-sm font-bold text-foreground border-l-4 border-primary pl-4">
          Statistics
        </h2>

        {/* Dynamic Grid of Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {[
            {
              key: "totalCalls",
              label: "Total Calls",
              icon: <PhoneCall className="w-5 h-5 text-primary" />,
            },
            {
              key: "totalLengthOfCalls",
              label: "Total Length of Calls",
              icon: <Clock className="w-5 h-5 text-primary" />,
              format: formatTime,
            },
            {
              key: "averageLengthOfCalls",
              label: "Average Length of Calls",
              icon: <Clock className="w-5 h-5 text-primary" />,
              format: formatTime,
            },
            {
              key: "maxLengthOfCalls",
              label: "Max Length of Calls",
              icon: <Clock className="w-5 h-5 text-primary" />,
              format: formatTime,
            },
            {
              key: "shortOutboundCalls",
              label: "Short Outbound(< 1min)",
              icon: <PhoneOutgoing className="w-5 h-5 text-primary" />,
            },
            {
              key: "outboundCallAttempts",
              label: "Outbound Attempts",
              icon: <PhoneOutgoing className="w-5 h-5 text-primary" />,
            },
            {
              key: "outboundCallsAnswered",
              label: "Outbound Answered",
              icon: <PhoneOutgoing className="w-5 h-5 text-primary" />,
            },
            {
              key: "answeredInboundCalls",
              label: "Answered Inbound",
              icon: <PhoneIncoming className="w-5 h-5 text-emerald-600" />,
            },
            {
              key: "missedInboundCalls",
              label: "Missed Inbound",
              icon: <PhoneMissed className="w-5 h-5 text-destructive" />,
            },
            {
              key: "resolvedMissedCalls",
              label: "Resolved Missed",
              icon: <PhoneMissed className="w-5 h-5 text-emerald-600" />,
            },
            {
              key: "unresolvedMissedCalls",
              label: "Unresolved Missed",
              icon: <PhoneMissed className="w-5 h-5 text-destructive" />,
            },
            {
              key: "avgAnswerTime",
              label: "Avg Answer Time",
              icon: <Clock className="w-5 h-5 text-primary" />,
              format: formatTime,
            },
            {
              key: "maxAnswerTime",
              label: "Max Answer Time",
              icon: <Clock className="w-5 h-5 text-primary" />,
              format: formatTime,
            },
            {
              key: "avgWaitingTime",
              label: "Avg Waiting Time",
              icon: <Clock className="w-5 h-5 text-primary" />,
              format: formatTime,
            },
            {
              key: "maxWaitingTime",
              label: "Max Waiting Time",
              icon: <Clock className="w-5 h-5 text-primary" />,
              format: formatTime,
            },
            {
              key: "unansweredCalls",
              label: "Unanswered Calls",
              icon: <PhoneMissed className="w-5 h-5 text-destructive" />,
            },
            {
              key: "missedCalls",
              label: "Missed Calls",
              icon: <PhoneMissed className="w-5 h-5 text-destructive" />,
            },
            {
              key: "answeredCalls",
              label: "Answered Calls",
              icon: <PhoneIncoming className="w-5 h-5 text-emerald-600" />,
            },
          ].map((stat) => (
            <StatCard
              key={stat.key}
              icon={stat.icon}
              value={
                stat.format
                  ? stat.format(stats[stat.key])
                  : stats[stat.key] || 0
              }
              label={stat.label}
              isLoading={isLoading}
            />
          ))}
        </div>
      </div>

      {/* Agent Table */}
      <AgentOverviewTable agents={agents} isLoading={isLoading} />

      {/* Pagination */}
      {!isLoading && paginationData.totalItems > 0 && (
        <Pagination
          pagination={{
            page: paginationData.currentPage || pagination.page,
            limit: paginationData.limit || pagination.limit,
            total: paginationData.totalItems || 0,
            pages: paginationData.totalPages || 1,
          }}
          onPageChange={handlePageChange}
          onLimitChange={handleLimitChange}
        />
      )}
    </div>
  );
}

export default CallStatisticsPage;
