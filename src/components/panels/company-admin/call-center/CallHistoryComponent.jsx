"use client";



import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import HistoryTable from "./HistoryTable";
import CallStatsCards from "./CallStatsCards";
import CallHistoryFilters from "./CallHistoryFilters";
import { useCallLogs, useDeleteCallLog } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import toast from "react-hot-toast";

export default function CallHistoryComponent() {
  const { user } = useAuth();
  const isAgent = user?.role === 'agent';
  // const { toast } = useToast(); -> Removed
  const [searchQuery, setSearchQuery] = useState("");
  const [date, setDate] = useState({ from: null, to: null });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
  });

  const [filters, setFilters] = useState({
    status: "all", // Note: User requested removing status filter from UI, but we'll keep state if needed or clean it up
    type: "all",
    group: "all",
    operator: "all",
    caller_number: "", // For specific phone number filter
  });

  // Single source of truth for server-side table filters/pagination.
  const queryParams = useMemo(() => {
    return {
      page: pagination.page,
      limit: pagination.limit,
      query: searchQuery,
      start_date: date.from ? date.from.toISOString() : undefined,
      end_date: date.to ? date.to.toISOString() : undefined,
      filter: filters.type !== "all" ? filters.type : undefined,
      group_id: filters.group !== "all" ? filters.group : undefined,
      operator_id: filters.operator !== "all" ? filters.operator : undefined,
      caller_number: filters.caller_number || undefined,
    };
  }, [pagination, searchQuery, date, filters]);

  // Agent role uses restricted endpoint; admins get broader listing.
  const { data, isLoading, isError, refetch } = useCallLogs(queryParams, isAgent);
  const deleteMutation = useDeleteCallLog();

  console.log("data call logs in callHistoryComponent", data);
  const callLogs = data?.data || [];
  const stats = data?.stats || {};
  const meta = data?.pagination || {};

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset page on filter change
  };

  const clearFilters = () => {
    setFilters({
      status: "all",
      type: "all",
      group: "all",
      operator: "all",
      caller_number: "",
    });
    setSearchQuery("");
    setDate({ from: null, to: null });
    setPagination((prev) => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, page: 1 }));
  };

  const handleDeleteLog = async (id) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Call log deleted successfully");
    } catch (error) {
      toast.error("Failed to delete call log");
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* 1. Stats Cards Carousel */}
      <CallStatsCards stats={stats} />

      {/* History Card containing Filters AND Table */}
      <Card className="flex-1 overflow-hidden flex flex-col gap-2 border shadow-sm bg-card">
        {/* Filters moved INSIDE the Card Header */}
        <CallHistoryFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filters={filters}
          handleFilterChange={handleFilterChange}
          clearFilters={clearFilters}
          date={date}
          setDate={setDate}
        />

        <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
          <HistoryTable
            data={callLogs}
            pagination={{
              page: meta.currentPage || 1,
              limit: meta.limit || 10,
              total: meta.totalItems || 0,
              pages: meta.totalPages || 1,
            }}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
            isLoading={isLoading}
            onDelete={handleDeleteLog}
          />
        </CardContent>
      </Card>
    </div>
  );
}
