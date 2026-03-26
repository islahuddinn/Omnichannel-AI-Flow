"use client";

import React, { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Filter } from "lucide-react";

export const FilterSection = ({ filters = {}, onFilterChange }) => {
  // Provide default values if filters properties are undefined
  const currentFilter = filters.filter || "allcalls";
  const currentCountry = filters.country || "All";
  const currentTimePeriod = filters.time_period;

  // Local state for filter changes before applying
  const [localFilters, setLocalFilters] = useState({
    filter: currentFilter,
    country: currentCountry,
    time_period: currentTimePeriod,
  });

  // Sync local filters when props change
  useEffect(() => {
    setLocalFilters({
      filter: currentFilter,
      country: currentCountry,
      time_period: currentTimePeriod,
    });
  }, [currentFilter, currentCountry, currentTimePeriod]);

  const directionOptions = [
    { label: "Inbound & outbound", value: "allcalls" },
    { label: "Inbound only", value: "incoming" },
    { label: "Outbound only", value: "outgoing" },
  ];

  const countryOptions = [
    { label: "All", value: "All" },
    { label: "CZ", value: "CZ" },
    { label: "SK", value: "SK" },
  ];

  const dateOptions = [
    { label: "Today", value: 0 },
    { label: "Last 1 day", value: 1 },
    { label: "Last 3 days", value: 3 },
    { label: "Last 7 days", value: 7 },
    { label: "Last 30 days", value: 30 },
    { label: "Last 90 days", value: 90 },
  ];

  const handleDirectionChange = (value) => {
    // Only update local state, don't apply yet
    setLocalFilters((prev) => ({ ...prev, filter: value }));
  };

  const handleCountryChange = (value) => {
    // Only update local state, don't apply yet
    setLocalFilters((prev) => ({ ...prev, country: value }));
  };

  const handleDateChange = (value) => {
    const timePeriod = parseInt(value);
    // Only update local state, don't apply yet
    setLocalFilters((prev) => ({ ...prev, time_period: timePeriod }));
  };

  const handleApplyFilters = () => {
    // Apply all filters when button is clicked
    onFilterChange("filter", localFilters.filter);
    onFilterChange("country", localFilters.country);
    // Only apply time_period if it's not null
    if (localFilters.time_period !== null && localFilters.time_period !== undefined) {
      onFilterChange("time_period", localFilters.time_period);
    } else {
      onFilterChange("time_period", null);
    }
  };

  const handleClearFilters = () => {
    const defaultFilters = {
      filter: "allcalls",
      country: "All",
      time_period: null,
    };
    setLocalFilters(defaultFilters);
    onFilterChange("filter", defaultFilters.filter);
    onFilterChange("country", defaultFilters.country);
    onFilterChange("time_period", defaultFilters.time_period);
  };

  const getDirectionLabel = () => {
    return directionOptions.find((opt) => opt.value === localFilters.filter)?.label || "Inbound & outbound";
  };

  const getDateLabel = () => {
    if (localFilters.time_period === null || localFilters.time_period === undefined) {
      return "Today";
    }
    return dateOptions.find((opt) => opt.value === localFilters.time_period)?.label || "Today";
  };

  return (
    <div className="bg-card shadow-md dark:shadow-lg rounded-[10px] p-4 relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex flex-row items-center gap-3.5">
          <div className="flex flex-col items-start gap-1.5">
            <h3 className="text-base font-semibold leading-4 text-foreground">
              Filters
            </h3>
            <p className="text-xs font-medium leading-3 text-muted-foreground">
              Filter logs by various criteria.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-row items-center gap-3 w-full sm:w-auto">
          <Button
            onClick={handleClearFilters}
            variant="outline"
            className="h-10 px-3 sm:px-5 py-2.5 bg-primary/5 border-border rounded-[10px] text-sm sm:text-base font-normal text-foreground hover:bg-accent flex-1 sm:flex-none"
          >
            Clear Filters
          </Button>
          <Button
            onClick={handleApplyFilters}
            className="h-10 px-3 sm:px-4 py-2.5 bg-primary border border-border rounded-[10px] text-sm sm:text-base font-medium text-primary-foreground hover:bg-primary/90 flex-1 sm:flex-none"
          >
            <Filter className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
            <span className="hidden sm:inline">Apply Filters</span>
            <span className="sm:hidden">Apply</span>
          </Button>
        </div>
      </div>

      {/* Filter Dropdowns */}
      <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
        {/* Direction */}
        <div className="flex flex-col items-start gap-1.5 w-full sm:w-auto sm:min-w-[184px]">
          <label className="text-xs font-normal leading-4 tracking-[-0.01em] text-foreground">
            Direction
          </label>
          <Select value={localFilters.filter} onValueChange={handleDirectionChange}>
            <SelectTrigger className="w-full sm:w-[184px] h-10 px-3 py-[18px] border border-border rounded-[10px] text-[10px] font-normal leading-[13px] tracking-[-0.01em] text-muted-foreground bg-card dark:bg-input">
              <SelectValue>{getDirectionLabel()}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {directionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Country */}
        <div className="flex flex-col items-start gap-1.5 w-full sm:w-auto sm:min-w-[184px]">
          <label className="text-xs font-normal leading-4 tracking-[-0.01em] text-foreground">
            Country
          </label>
          <Select value={localFilters.country} onValueChange={handleCountryChange}>
            <SelectTrigger className="w-full sm:w-[184px] h-10 px-3 py-[18px] border border-border rounded-[10px] text-[10px] font-normal leading-[13px] tracking-[-0.01em] text-muted-foreground bg-card dark:bg-input">
              <SelectValue>{localFilters.country}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {countryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="flex flex-col items-start gap-1.5 w-full sm:w-auto sm:min-w-[184px]">
          <label className="text-xs font-normal leading-4 tracking-[-0.01em] text-foreground">
            Date Range
          </label>
          <Select
            value={localFilters.time_period !== null && localFilters.time_period !== undefined 
              ? localFilters.time_period.toString() 
              : "0"}
            onValueChange={handleDateChange}
          >
            <SelectTrigger className="w-full sm:w-[184px] h-10 px-3 py-[13px] border border-border rounded-[10px] text-[10px] font-normal leading-[13px] tracking-[-0.01em] text-muted-foreground bg-card dark:bg-input">
              <SelectValue>{getDateLabel()}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {dateOptions.map((option) => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
