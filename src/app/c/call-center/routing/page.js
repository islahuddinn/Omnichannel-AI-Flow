"use client";

import React, { useState } from "react";
import CallRoutingTable from "@/components/panels/company-admin/call-center/routing/CallRoutingTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { AddNumberDialog } from "@/components/panels/company-admin/call-center/routing/AddNumberDialog";
import { ExternalRoutingDialog } from "@/components/panels/company-admin/call-center/routing/ExternalRoutingDialog";
import PhoneInput from "@/components/shared/PhoneInput";
import { usePhoneNumbers } from "@/hooks/usePhoneNumbers";
import Pagination from "@/components/shared/Pagination";

export default function CallRoutingPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchText, setSearchText] = useState("");
  const [phoneNumberSearch, setPhoneNumberSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  // API Hook
  const {
    data: phoneNumbersData,
    isLoading,
    isError,
  } = usePhoneNumbers(page, limit, activeSearch);

  // Dialog States
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [externalRoutingTarget, setExternalRoutingTarget] = useState(null);
  const [editingNumber, setEditingNumber] = useState(null);

  const handleEdit = (id) => {
    router.push(`/c/call-center/routing/${id}`);
  };

  const handleEditNumber = (row) => {
    setEditingNumber(row);
    setIsAddOpen(true);
  };


  const handleExternalRouting = (row) => {
    setExternalRoutingTarget(row);
  };

  const handlePageChange = (p) => setPage(p);
  const handleLimitChange = (l) => {
    setLimit(l);
    setPage(1);
  };

  const handleSearch = () => {
    // Use search text to filter the table
    setActiveSearch(searchText);
    setPage(1);
  };

  const handleClearFilter = () => {
    setSearchText("");
    setActiveSearch("");
    setPage(1);
  };

  console.log("Phone Numbers Data:", phoneNumbersData);

  const pagination = phoneNumbersData?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    pages: 1,
  };
  const tableData = phoneNumbersData?.data || [];

  return (
    <div className="urbanist h-[calc(100vh-6rem)] p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-4 p-2 bg-card rounded-[4.53px] shadow-sm flex-1 overflow-hidden border border-border">
        {/* Search and Phone Input Container */}
        <div className="flex flex-col sm:flex-row gap-3 w-full items-center">
          {/* Search and Phone Input in single container */}
          <div className="flex flex-1 gap-5 w-full bg-card rounded-lg border border-border p-2 items-center">
            {/* Search Input */}
            <div className="relative flex-1 flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-muted-foreground z-10" />
              <Input
                placeholder="Search By Phone Number..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-10 border-border bg-transparent h-10 w-full"
              />
            </div>

            {/* Phone Number Input */}
            {/* <div className="flex items-center w-full sm:w-64 md:w-72 [&_.phone-input-container]:w-full [&_.phone-input-container>div]:space-y-0">
              <PhoneInput
                value={phoneNumberSearch}
                onChange={(val) => setPhoneNumberSearch(val)}
                placeholder="Enter phone number"
              />
            </div> */}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleSearch}
              className="px-5 py-2 text-xs font-medium tracking-wider urbanist flex items-center w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Search
            </Button>

            {activeSearch && (
              <Button
                onClick={handleClearFilter}
                variant="outline"
                className="px-5 py-2 text-xs font-medium tracking-wider urbanist flex items-center w-full sm:w-auto"
              >
                Clear Filter
              </Button>
            )}

            <Button
              onClick={() => setIsAddOpen(true)}
              className="px-5 py-2 text-xs font-medium tracking-wider urbanist flex items-center w-full sm:w-auto bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Add Number
            </Button>
          </div>
        </div>

        {/* Table Area */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            Loading...
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-12 text-destructive">
            Failed to load phone numbers
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0">
              <CallRoutingTable
                data={tableData}
                onEdit={handleEdit}
                onEditNumber={handleEditNumber}
                onExternalRouting={handleExternalRouting}
                searchQuery={activeSearch}
              />
            </div>

            {/* Pagination */}
            {pagination && pagination?.total > 0 && (
              <Pagination
                pagination={
                  pagination || {
                    page: 1,
                    limit: limit,
                    total: 0,
                    pages: 1,
                  }
                }
                onPageChange={(newPage) => setPage(newPage)}
                onLimitChange={(newLimit) => {
                  setLimit(newLimit);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
      </div>

      {/* Dialogs */}
      <AddNumberDialog
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
          setEditingNumber(null);
        }}
        initialData={editingNumber}
      />

      <ExternalRoutingDialog
        isOpen={!!externalRoutingTarget}
        onClose={() => setExternalRoutingTarget(null)}
        routingData={externalRoutingTarget}
      />
    </div>
  );
}
