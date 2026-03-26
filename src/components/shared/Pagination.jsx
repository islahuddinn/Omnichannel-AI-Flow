"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Pagination({
  pagination,
  onPageChange,
  onLimitChange,
}) {
  // ✅ Add safety check for undefined pagination
  if (!pagination) {
    return null;
  }

  const { page, limit, total, pages } = pagination;

  // Generate page numbers to display
  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];

    for (
      let i = Math.max(2, page - delta);
      i <= Math.min(pages - 1, page + delta);
      i++
    ) {
      range.push(i);
    }

    if (page - delta > 2) {
      rangeWithDots.push(1, "...");
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (page + delta < pages - 1) {
      rangeWithDots.push("...", pages);
    } else if (pages > 1) {
      rangeWithDots.push(pages);
    }

    return rangeWithDots;
  };

  // Always show pagination if there are results
  if (total === 0) return null;

  const controlButtonClass =
    "h-8 w-8 p-0 rounded-full border border-border bg-background text-foreground flex items-center justify-center hover:bg-accent/50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-foreground dark:bg-card dark:border-border dark:hover:bg-accent/30";
  const pageButtonClass =
    "h-8 min-w-8 px-2 rounded-full border border-border bg-background text-foreground text-sm font-semibold hover:bg-accent/50 dark:text-foreground dark:bg-card dark:border-border dark:hover:bg-accent/30 flex items-center justify-center whitespace-nowrap";
  const pageActiveClass =
    "bg-primary text-primary-foreground border-transparent hover:bg-primary/90 dark:bg-primary dark:text-primary-foreground";
  const rowsPerPageButtonClass =
    "h-8 px-3 rounded-full border border-border text-foreground text-sm font-medium shadow-none dark:text-foreground dark:border-border";

  return (
    <div className="flex flex-col gap-3 w-full py-2 md:flex-row md:items-center md:justify-between">
      {/* Left cluster: Rows per page + total rows */}
      <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-foreground">
        <span>Rows per page</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={rowsPerPageButtonClass}
            >
              {limit}
              <ChevronLeft className="ml-2 h-4 w-4 rotate-90" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[10, 20, 50, 100].map((pageSize, index) => (
              <DropdownMenuItem
                key={pageSize}
                onClick={() => onLimitChange?.(pageSize)}
                className={`${
                  limit === pageSize ? "bg-accent dark:bg-accent/50" : ""
                } ${index < 3 ? "mb-1" : ""}`}
              >
                {pageSize}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span>of {total} rows</span>
      </div>

      {/* Right cluster: controls + pages */}
      <div className="flex items-center gap-2 flex-wrap md:flex-nowrap overflow-hidden">
        <Button
          variant="outline"
          size="sm"
          className={controlButtonClass}
          disabled={page === 1}
          onClick={() => onPageChange?.(1)}
          aria-label="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={controlButtonClass}
          disabled={page === 1}
          onClick={() => onPageChange?.(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 overflow-x-auto max-w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {getPageNumbers().map((pageNum, index) => {
            if (pageNum === "...") {
              return (
                <Button
                  key={`dots-${index}`}
                  variant="outline"
                  size="sm"
                  className={`${pageButtonClass} border-transparent w-8 px-0`}
                  disabled
                  aria-label="more pages"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              );
            }

            const isActive = page === pageNum;
            // Calculate dynamic width based on number of digits for large page numbers
            const numDigits = String(pageNum).length;
            const minWidth = numDigits > 2 ? Math.max(32, numDigits * 8 + 8) : 32;
            
            return (
              <Button
                key={pageNum}
                variant="outline"
                size="sm"
                className={`${pageButtonClass} ${
                  isActive ? pageActiveClass : ""
                }`}
                style={{
                  minWidth: `${minWidth}px`,
                  paddingLeft: numDigits > 2 ? '8px' : '0px',
                  paddingRight: numDigits > 2 ? '8px' : '0px'
                }}
                onClick={() => onPageChange?.(pageNum)}
                aria-current={isActive ? "page" : undefined}
              >
                {pageNum}
              </Button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          className={controlButtonClass}
          disabled={page === pages}
          onClick={() => onPageChange?.(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={controlButtonClass}
          disabled={page === pages}
          onClick={() => onPageChange?.(pages)}
          aria-label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
