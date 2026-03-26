// // src/app/(superadmin)/companies/page.js
// 'use client';

// import { useState } from 'react';
// import { useQuery } from '@tanstack/react-query';
// import { Plus, Search } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from '@/components/ui/select';
// import CompanyTable from '@/components/panels/superadmin/CompanyTable';
// import CreateCompanyModal from '@/components/modals/CreateCompanyModal';
// import apiClient from '@/lib/api/client';

// export default function CompaniesPage() {
//   const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
//   const [search, setSearch] = useState('');
//   const [status, setStatus] = useState('');
//   const [page, setPage] = useState(1);

//   const { data, isLoading, refetch } = useQuery({
//     queryKey: ['companies', { search, status, page }],
//     queryFn: () => apiClient.get('/companies', {
//       params: { search, status, page, limit: 20 }
//     })
//   });

//   return (
//     <div className="p-6 space-y-6">
//       {/* Header */}
//       <div className="flex justify-between items-center">
//         <div>
//           <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
//             Companies
//           </h1>
//           <p className="text-gray-600 dark:text-gray-400 mt-1">
//             Manage all tenant companies and their subscriptions
//           </p>
//         </div>
//         <Button onClick={() => setIsCreateModalOpen(true)}>
//           <Plus className="mr-2 h-4 w-4" />
//           Create Company
//         </Button>
//       </div>

//       {/* Filters */}
//       <div className="flex gap-4">
//         <div className="flex-1 max-w-sm">
//           <div className="relative">
//             <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
//             <Input
//               placeholder="Search companies..."
//               value={search}
//               onChange={(e) => setSearch(e.target.value)}
//               className="pl-10"
//             />
//           </div>
//         </div>
//         <Select value={status} onValueChange={setStatus}>
//           <SelectTrigger className="w-[180px]">
//             <SelectValue placeholder="All Status" />
//           </SelectTrigger>
//           <SelectContent>
//             <SelectItem value=" ">All Status</SelectItem>
//             <SelectItem value="active">Active</SelectItem>
//             <SelectItem value="trial">Trial</SelectItem>
//             <SelectItem value="suspended">Suspended</SelectItem>
//             <SelectItem value="expired">Expired</SelectItem>
//           </SelectContent>
//         </Select>
//       </div>

//       {/* Companies Table */}
//       <CompanyTable
//         companies={data?.data?.companies || []}
//         pagination={data?.data?.pagination}
//         isLoading={isLoading}
//         onPageChange={setPage}
//         onRefresh={refetch}
//       />

//       {/* Create Company Modal */}
//       <CreateCompanyModal
//         open={isCreateModalOpen}
//         onClose={() => setIsCreateModalOpen(false)}
//         onSuccess={() => {
//           setIsCreateModalOpen(false);
//           refetch();
//         }}
//       />
//     </div>
//   );
// }

// src/app/(superadmin)/companies/page.js
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import CompanyTable from "@/components/panels/superadmin/CompanyTable";
import CreateCompanyModal from "@/components/modals/CreateCompanyModal";
import Pagination from "@/components/shared/Pagination";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import apiClient from "@/lib/api/client";

export default function CompaniesPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["companies", { search, status, page, limit }],
    queryFn: () =>
      apiClient.get("/companies", {
        params: {
          search,
          status,
          page,
          limit,
        },
      }),
  });

  const handleStatusChange = (value) => {
    setStatus(value === "all" ? "" : value);
    setPage(1);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Companies
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage all tenant companies and their subscriptions
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Company
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-[10px] p-4 flex flex-row items-center gap-4"
           style={{
             boxShadow: '-1px -1px 4px rgba(0, 0, 0, 0.08), 1px 1px 4px rgba(0, 0, 0, 0.08)',
             borderRadius: '10px'
           }}>
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-[#2E4258] dark:text-gray-400 h-5 w-5" />
            <Input
              placeholder="Search companies..."
              value={search}
              onChange={handleSearchChange}
              className="pl-12 h-11 bg-white dark:bg-gray-800 border border-[#A9B4BE] dark:border-gray-600 rounded-[10px] text-[#2E4258] dark:text-gray-200 placeholder:text-[#2E4258] dark:placeholder:text-gray-400"
              style={{
                fontFamily: 'Roboto, sans-serif',
                fontWeight: 400,
                fontSize: '16px',
                lineHeight: '19px'
              }}
            />
          </div>
        </div>
        <Select value={status || "all"} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[162px] h-10 bg-white dark:bg-gray-800 border border-[#A9B4BE] dark:border-gray-600 rounded-[10px] text-[#2E4258] dark:text-gray-200"
                         style={{
                           fontFamily: 'Roboto, sans-serif',
                           fontWeight: 400,
                           fontSize: '16px',
                           lineHeight: '19px',
                           padding: '10px 20px'
                         }}>
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Companies Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSkeleton rows={5} />
        </div>
      ) : (
        <>
          <CompanyTable
            companies={data?.data?.companies || []}
            pagination={data?.data?.pagination}
            onPageChange={setPage}
            onRefresh={refetch}
          />

          {/* Pagination */}
          {data?.data?.pagination && data.data.pagination?.total > 0 && (
            <Pagination
              pagination={
                data.data.pagination || {
                  page: 1,
                  limit: 20,
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

      {/* Create Company Modal */}
      <CreateCompanyModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          setIsCreateModalOpen(false);
          refetch();
        }}
      />
    </div>
  );
}
