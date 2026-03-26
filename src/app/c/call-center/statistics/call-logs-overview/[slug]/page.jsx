"use client";

import React, { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useCallSentiment } from "@/hooks/useCallSentiment";
import CallLogsOverviewTable from "@/components/panels/company-admin/call-center/statistics/CallLogsOverviewTable";
import { FilterSection } from "@/components/panels/company-admin/call-center/statistics/FilterSection";
import Pagination from "@/components/shared/Pagination";
import CallLogsLoadingState from "@/components/shared/loading-states/call-statistics/CallLogsLoadingState";
import StatisticsErrorState from "@/components/panels/company-admin/call-center/statistics/StatisticsErrorState";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CallLogsOverviewPage() {
    const params = useParams();
    const operatorId = params.slug; // Using 'slug' instead of 'id'

    // State for filters (reset to defaults for operator view)
    const [filters, setFilters] = useState({
        filter: "allcalls", // incoming, outgoing, allcalls
        country: "All", // CZ, SK, All
        time_period: null, // null until user clicks
    });

    // State for pagination
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 20,
    });

    // Build query params with operator_id from URL + filters
    const queryParams = useMemo(() => {
        const params = {
            page: pagination.page,
            limit: pagination.limit,
            operator_id: operatorId,
            filter: filters.filter !== "allcalls" ? filters.filter : undefined,
            country: filters.country !== "All" ? filters.country : undefined,
        };

        // Only add time_period if user has selected one
        if (filters.time_period !== null && filters.time_period !== undefined) {
            params.time_period = filters.time_period;
        }

        return params;
    }, [pagination, operatorId, filters]);

    // Fetch data
    const { data, isLoading, isError, error, refetch } =
        useCallSentiment(queryParams);

    const callLogs = data?.data || [];
    const stats = data?.stats || {};
    const paginationMeta = data?.pagination || {};

    // Get operator info from first call log or use placeholder
    const operator =
        callLogs.length > 0 && callLogs[0].operator ? callLogs[0].operator : null;

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
        return <CallLogsLoadingState />;
    }

    // Error state
    if (isError) {
        return (
            <div className="w-full py-8 px-8">
                <Link
                    href="/c/call-center/statistics"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Statistics
                </Link>
                <StatisticsErrorState error={error} onRetry={refetch} />
            </div>
        );
    }

    return (
        <div className="w-full py-8 px-8 space-y-6">
            {/* Back Button */}
            <Link
                href="/c/call-center/statistics"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Statistics
            </Link>

            {/* Filters */}
            <FilterSection filters={filters} onFilterChange={handleFilterChange} />

            {/* Call Logs Table */}
            <CallLogsOverviewTable
                callLogs={callLogs}
                operator={operator}
                isLoading={isLoading}
            />

            {/* Pagination */}
            {!isLoading && paginationMeta.totalItems > 0 && (
                <Pagination
                    pagination={{
                        page: paginationMeta.currentPage || pagination.page,
                        limit: paginationMeta.limit || pagination.limit,
                        total: paginationMeta.totalItems || 0,
                        pages: paginationMeta.totalPages || 1,
                    }}
                    onPageChange={handlePageChange}
                    onLimitChange={handleLimitChange}
                />
            )}
        </div>
    );
}
