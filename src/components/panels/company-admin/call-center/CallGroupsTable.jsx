"use client";
// Call center: table of call groups with search, pagination, edit, and delete.

import { useState, useMemo, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Edit, Trash2, X } from "lucide-react";
import Pagination from "@/components/shared/Pagination";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { LucideEdit } from "lucide-react";
import Image from "next/image";
import { useDepartments } from "@/hooks/useDepartments";

export default function CallGroupsTable({
  data,
  onEdit,
  onDelete,
  pagination,
  onPageChange,
  onLimitChange,
  searchQuery,
  setSearchQuery,
}) {
  // Local state for input value (doesn't trigger search until button is clicked)
  const [inputValue, setInputValue] = useState(searchQuery || "");

  // Sync input value when searchQuery changes externally (e.g., from parent component)
  useEffect(() => {
    setInputValue(searchQuery || "");
  }, [searchQuery]);

  // Handle search button click
  const handleSearch = () => {
    setSearchQuery(inputValue);
    // Reset to page 1 when searching
    if (onPageChange) {
      onPageChange(1);
    }
  };

  // Handle clear filter button click
  const handleClear = () => {
    setInputValue("");
    setSearchQuery("");
    // Reset to page 1 when clearing
    if (onPageChange) {
      onPageChange(1);
    }
  };

  // Handle Enter key press in input
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  // Fetch departments to map IDs to names
  const { data: departmentsData } = useDepartments();
  const departments = departmentsData?.data || [];

  // Create a map of department ID to name
  const departmentMap = useMemo(() => {
    const map = {};
    departments.forEach((dept) => {
      map[dept._id?.toString()] = dept.name;
    });
    return map;
  }, [departments]);

  // Helper function to get department names from IDs
  const getDepartmentNames = (departmentIds) => {
    if (!departmentIds || departmentIds.length === 0) return [];
    return departmentIds
      .map((id) => {
        const idStr = typeof id === "object" ? (id._id || id.id || id).toString() : id.toString();
        return departmentMap[idStr] || idStr;
      })
      .filter(Boolean);
  };

  // Helper to render shortened list with tooltip
  const renderListWithTooltip = (items, labelFn) => {
    if (!items || items.length === 0) return "-";

    const displayItems = items.slice(0, 2);
    const remaining = items.length - 2;

    return (
      <div className="flex items-center gap-1">
        <span>{displayItems.map(labelFn).join(", ")}</span>
        {remaining > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground cursor-pointer bg-muted px-1 rounded">
                  +{remaining} more
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col gap-1">
                  {items.slice(2).map((item, idx) => (
                    <span key={idx}>{labelFn(item)}</span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Search Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-[300px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search groups..."
              className="pl-9"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <Button onClick={handleSearch} size="sm" variant="default">
            <Search className="h-4 w-4 mr-2" />
            Search
          </Button>
          {(inputValue || searchQuery) && (
            <Button onClick={handleClear} size="sm" variant="outline">
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 border rounded-md overflow-hidden flex flex-col">
        <ScrollArea className="flex-1">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              <TableRow>
                <TableHead>
                  #<span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>
                  GROUP NAME
                  <span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>
                  DEPARTMENTS
                  <span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>
                  ASSIGNED NUMBERS
                  <span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>
                  USERS<span className="float-right text-border">|</span>
                </TableHead>
                <TableHead>ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length > 0 ? (
                data.map((group) => (
                  <TableRow key={group._id}>
                    <TableCell className="font-medium">
                      #
                      {group._id
                        ? group._id.slice(-6)
                        : (group.group_id || "").slice(-6)}
                    </TableCell>
                    <TableCell>{group.groupName || group.group_name}</TableCell>
                    <TableCell>
                      {renderListWithTooltip(
                        getDepartmentNames(group.departmentIds || group.departments || []),
                        (name) => name
                      )}
                    </TableCell>
                    <TableCell>
                      {renderListWithTooltip(
                        group.outboundPhoneNumbers ||
                          group.outbound_phone_numbers,
                        (n) => n
                      )}
                    </TableCell>
                    <TableCell>
                      {renderListWithTooltip(
                        group.users,
                        (u) => `${u.firstName} ${u.lastName}`
                      )}
                    </TableCell>
                    <TableCell className="flex gap-2 items-center">
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-1"
                              onClick={() => onEdit(group)}
                            >
                              <LucideEdit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span>Edit Group</span>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-1"
                              onClick={() => onDelete(group._id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span>Delete Group</span>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No groups found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Pagination */}
      <Pagination
        pagination={pagination}
        onPageChange={onPageChange}
        onLimitChange={onLimitChange}
      />
    </div>
  );
}
