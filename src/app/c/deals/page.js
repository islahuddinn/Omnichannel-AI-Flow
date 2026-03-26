"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Eye,
  Upload,
  Loader2,
  DollarSign,
} from "lucide-react";
import DealCSVImportModal from "@/components/modals/DealCSVImportModal";
import Pagination from "@/components/shared/Pagination";
import { toast } from "sonner";

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;

export default function DealsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    total: 0,
    pages: 0,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ✅ Use TanStack Query for fetching deals (uses debounced search for API)
  const { data, isLoading, error } = useQuery({
    queryKey: ["deals", pagination.page, pagination.limit, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (debouncedSearch.trim()) {
        params.append("search", debouncedSearch.trim());
      }

      const response = await fetch(`/api/deals?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch deals");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch deals");
      }

      return result;
    },
    staleTime: 0, // Always consider data stale to ensure fresh fetches
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Always refetch on mount
  });

  const deals = data?.data || [];
  const statistics = data?.statistics || {
    total: 0,
    totalAmount: 0,
    won: 0,
    lost: 0,
    inProgress: 0,
  };
  const paginationData = data?.pagination || {
    page: pagination.page,
    limit: pagination.limit,
    total: 0,
    pages: 0,
  };

  // ✅ Update pagination state when data changes
  // Only update if values actually changed to prevent infinite loops
  useEffect(() => {
    if (data?.pagination) {
      setPagination((prev) => {
        const newTotal = data.pagination.total || 0;
        const newPages = data.pagination.pages || 0;

        // Only update if values actually changed
        if (prev.total !== newTotal || prev.pages !== newPages) {
          return {
            ...prev,
            total: newTotal,
            pages: newPages,
          };
        }

        return prev;
      });
    }
  }, [data?.pagination?.total, data?.pagination?.pages]);

  const handleFormSuccess = () => {
    // ✅ Invalidate and refetch deals after import
    queryClient.invalidateQueries({ queryKey: ["deals"] });
    setPagination((prev) => ({ ...prev, page: 1 }));
    toast.success("Deals imported successfully!");
  };

  const formatCurrency = (amount, currency = "USD") => {
    if (!amount) return "-";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(amount);
  };

  const formatDate = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Deals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your deals imported from Salesforce
          </p>
        </div>
        <Button onClick={() => setIsImportOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Import CSV
        </Button>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">
            Total Deals
          </p>
          <p className="text-2xl font-bold text-foreground">
            {statistics.total}
          </p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Won</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {statistics.won}
          </p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Lost</p>
          <p className="text-2xl font-bold text-destructive">
            {statistics.lost}
          </p>
        </div>
        <div className="bg-card rounded-lg p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">
            In Progress
          </p>
          <p className="text-2xl font-bold text-primary">
            {statistics.inProgress}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-4" role="search" aria-label="Deals search">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" aria-hidden />
          <Input
            type="search"
            placeholder="Search deals by name, stage, or deal ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="pl-10"
            aria-label="Search deals by name, stage, or deal ID"
            autoComplete="off"
          />
        </div>
      </div>

      {/* Deals Table */}
      <div
        className="bg-card rounded-lg border border-border overflow-hidden overflow-x-auto"
        aria-busy={isLoading}
        aria-live="polite"
        aria-label="Deals list"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <DollarSign className="h-7 w-7 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Failed to load deals</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {error.message || "Unable to fetch deals. Please try again."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["deals"] })
              }
            >
              Retry
            </Button>
          </div>
        ) : deals.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {debouncedSearch
                ? "No deals found matching your search."
                : "No deals found. Import a CSV file to get started."}
            </p>
            {!debouncedSearch && (
              <Button onClick={() => setIsImportOpen(true)} className="mt-4">
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            )}
          </div>
        ) : (
          <>
            <Table role="grid" aria-label="Deals">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left" scope="col">Deal ID</TableHead>
                  <TableHead className="text-left" scope="col">Name</TableHead>
                  <TableHead className="text-left" scope="col">Stage</TableHead>
                  <TableHead className="text-center" scope="col">Status</TableHead>
                  <TableHead className="text-center" scope="col">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => (
                  <TableRow key={deal._id}>
                    <TableCell className="font-mono text-xs">
                      {deal.deal_id || "-"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {deal.name || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{deal.stage || "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <Badge variant="outline">{deal.status || "-"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(`/c/deals/${deal._id}`)}
                              className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                              aria-label={`View deal ${deal.name || deal.deal_id || 'details'}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View Details</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>

      {/* Pagination */}
      {!isLoading &&
        deals.length > 0 &&
        paginationData &&
        paginationData.total > 0 && (
          <Pagination
            pagination={paginationData}
            onPageChange={(newPage) => {
              setPagination((prev) => ({ ...prev, page: newPage }));
            }}
            onLimitChange={(newLimit) => {
              setPagination((prev) => ({
                ...prev,
                limit: newLimit,
                page: 1,
              }));
            }}
          />
        )}

      {/* Import Modal */}
      <DealCSVImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
