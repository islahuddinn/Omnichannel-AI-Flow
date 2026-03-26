"use client";
// Call center: filters for call history (search, date range, operator, group, etc.).

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarIcon, Search, FilterX, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { usePhoneNumbers } from "@/hooks/usePhoneNumbers";
import { useCallGroups } from "@/hooks/useCallGroups";
import { useUsersWithCallFeature } from "@/hooks/useUsersWithCallFeature";
import SearchableSelect from "@/components/shared/SearchableSelect";

export default function CallHistoryFilters({
  searchQuery,
  setSearchQuery,
  filters,
  handleFilterChange,
  clearFilters,
  date,
  setDate,
}) {
  // Debounce Logic for Search Query
  const [localSearch, setLocalSearch] = useState(searchQuery);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch);
      }
    }, 800);
    return () => clearTimeout(handler);
  }, [localSearch, setSearchQuery, searchQuery]);

  // --- Data Fetching for Selects ---
  // API calls are now only made on mount (or initial render), not on local search typing.

  // 1. Phone Numbers: Fetch initial batch (limit 100 to allow reasonable client-side search)
  const { data: phoneData } = usePhoneNumbers(1, 100);
  const phones = phoneData?.data || [];

  // 2. Groups: Fetch initial batch
  const { data: groupData } = useCallGroups({ page: 1, limit: 100 });
  const groups = groupData || [];

  // 3. Operators (Users): Fetch all
  const { data: userData } = useUsersWithCallFeature();
  // Transform users to have name and user_id fields for SearchableSelect
  const allUsers = (userData || []).map((user) => ({
    ...user,
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown',
    user_id: user._id
  }));

  // --- Operator Logic ---
  const [operatorType, setOperatorType] = useState("all"); // all, ai_bot, user

  useEffect(() => {
    if (!filters.operator || filters.operator === "all") {
      setOperatorType("all");
    } else if (filters.operator === "ai_bot") {
      setOperatorType("ai_bot");
    } else {
      setOperatorType("user");
    }
  }, [filters.operator]);

  const handleOperatorTypeSelect = (val) => {
    setOperatorType(val);
    if (val === "all") {
      // handleFilterChange("operator", "all");
    } else if (val === "ai_bot") {
      // handleFilterChange("operator", "ai_bot");
    } else {
      // Switching to 'user' mode.
      // Do NOT trigger handleFilterChange here to avoid unnecessary API calls.
      // The API call will happen only when a specific user is selected in the secondary dropdown.
    }
  };

  return (
    <ScrollArea className="w-full whitespace-nowrap pb-2 ">
      <div className="flex items-center gap-3 w-max py-2 px-2">
        {/* Search */}
        <div className="min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="pl-9 w-[200px] border-border bg-input"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Date Range Picker */}
        <div className="w-[240px]">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full justify-start text-left font-normal bg-input border-border hover:bg-accent",
                  !date?.from && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                <div className="flex-1 truncate text-left">
                  {date?.from ? (
                    date.to ? (
                      <>
                        {format(date.from, "LLL dd, y")} -{" "}
                        {format(date.to, "LLL dd, y")}
                      </>
                    ) : (
                      format(date.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </div>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date?.from ? date : undefined}
                onSelect={setDate}
                numberOfMonths={2}
                classNames={{
                  today: "bg-transparent text-foreground font-normal hover:bg-accent hover:text-accent-foreground rounded-md",
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Type/Direction Filter */}
        <Select
          value={filters.type}
          onValueChange={(val) => handleFilterChange("type", val)}
        >
          <SelectTrigger className="w-[150px] bg-input border-border">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="incoming">Inbound</SelectItem>
            <SelectItem value="outgoing">Outbound</SelectItem>
          </SelectContent>
        </Select>

        {/* Phone Filter */}
        <SearchableSelect
          items={phones}
          value={filters.caller_number}
          onSelect={(val) => handleFilterChange("caller_number", val)}
          placeholder="Caller Number"
          searchPlaceholder="Search number..."
          labelKey="phoneNumber"
          valueKey="phoneNumber"
        />

        {/* Groups Filter */}
        <SearchableSelect
          items={groups}
          value={filters.group}
          onSelect={(val) => handleFilterChange("group", val)}
          placeholder="Groups"
          searchPlaceholder="Search group..."
          labelKey="groupName"
          valueKey="_id"
        />

        {/* Operator Type Selector */}
        <Select value={operatorType} onValueChange={handleOperatorTypeSelect}>
          <SelectTrigger className="w-[180px] bg-input border-border">
            <SelectValue placeholder="Operator Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Operators</SelectItem>
            <SelectItem value="ai_bot">AI Voice Bot</SelectItem>
            <SelectItem value="user">User</SelectItem>
          </SelectContent>
        </Select>

        {/* Specific Operator (User) Filter - Only visible if 'user' is selected */}
        {operatorType === "user" && (
          <SearchableSelect
            items={allUsers}
            value={
              filters.operator === "ai_bot" || filters.operator === "all"
                ? ""
                : filters.operator
            }
            onSelect={(val) => handleFilterChange("operator", val)}
            placeholder="Select User"
            searchPlaceholder="Search user..."
            labelKey="name"
            valueKey="user_id"
          />
        )}

        {/* Reset Filters */}
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <FilterX className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
