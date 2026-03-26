// src/app/(superadmin)/users/page.js
"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  Search,
  UserCheck,
  UserX,
  Loader2,
  Building2,
  Shield,
  User,
  Users,
  Filter,
  Power,
} from "lucide-react";
import apiClient from "@/lib/api/client";
import { toast } from "sonner";
import Pagination from "@/components/shared/Pagination";
import { useRouter } from "next/navigation";

export default function UsersManagementPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  // Read sidebar state from localStorage and listen for changes
  useEffect(() => {
    // Initial state from localStorage
    const savedState = localStorage.getItem("sidebarCollapsed");
    if (savedState !== null) {
      setIsSidebarCollapsed(JSON.parse(savedState));
    }

    // Listen for custom event dispatched when sidebar toggles
    const handleSidebarToggle = (event) => {
      setIsSidebarCollapsed(event.detail.collapsed);
    };

    // Listen for storage changes (for cross-tab updates)
    const handleStorageChange = (e) => {
      if (e.key === "sidebarCollapsed" && e.newValue !== null) {
        setIsSidebarCollapsed(JSON.parse(e.newValue));
      }
    };

    window.addEventListener("sidebarToggle", handleSidebarToggle);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("sidebarToggle", handleSidebarToggle);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // Fetch companies for filter
  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const result = await apiClient.get("/companies");
      return result;
    },
  });

  // Extract companies - handle nested structure from TenantService
  const companies =
    companiesData?.data?.companies ||
    companiesData?.data?.data?.companies ||
    companiesData?.data ||
    [];

  // Fetch users
  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      "admin-users",
      page,
      limit,
      search,
      companyFilter,
      roleFilter,
      statusFilter,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (search) params.append("search", search);
      if (companyFilter) params.append("companyId", companyFilter);
      if (roleFilter) params.append("role", roleFilter);
      if (statusFilter) params.append("status", statusFilter);

      const result = await apiClient.get(`/admin/users?${params.toString()}`);
      // apiClient already returns response.data, so result is { success, data, pagination, statistics }
      return result;
    },
  });

  // Extract users - data is already the response object from apiClient
  const users = Array.isArray(data?.data) ? data.data : [];
  const pagination = data?.pagination || {};
  const statistics = data?.statistics || {};

  // Suspend user mutation
  const suspendMutation = useMutation({
    mutationFn: (userId) => apiClient.post(`/admin/users/${userId}/suspend`),
    onSuccess: () => {
      toast.success("User suspended successfully");
      queryClient.invalidateQueries(["admin-users"]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Failed to suspend user");
    },
  });

  // Activate user mutation
  const activateMutation = useMutation({
    mutationFn: (userId) => apiClient.post(`/admin/users/${userId}/activate`),
    onSuccess: () => {
      toast.success("User activated successfully");
      queryClient.invalidateQueries(["admin-users"]);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Failed to activate user");
    },
  });

  const handleSuspend = (userId) => {
    if (confirm("Are you sure you want to suspend this user?")) {
      suspendMutation.mutate(userId);
    }
  };

  const handleActivate = (userId) => {
    if (confirm("Are you sure you want to activate this user?")) {
      activateMutation.mutate(userId);
    }
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case "super_admin":
        return <Shield className="h-4 w-4" />;
      case "company_admin":
        return <Building2 className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status) => {
    // Map user statuses to active/inactive for StatusBadge component
    const isActive = status === 'active';
    
    // Determine labels based on status
    let activeLabel = 'Active';
    let inactiveLabel = 'Inactive';
    
    if (status === 'suspended') {
      inactiveLabel = 'Suspended';
    } else if (status === 'inactive') {
      inactiveLabel = 'Inactive';
    }
    
    return (
      <StatusBadge 
        isActive={isActive} 
        activeLabel={activeLabel}
        inactiveLabel={inactiveLabel}
      />
    );
  };

  const clearFilters = () => {
    setSearch("");
    setCompanyFilter("");
    setRoleFilter("");
    setStatusFilter("");
    setPage(1);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Users Management
        </h1>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
          Manage all users across all companies
        </p>
      </div>

      {/* Statistics Cards */}
      <div className={`grid gap-[15px] ${
        isSidebarCollapsed 
          ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4' 
          : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
      }`}>
        {/* Total Users */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                height: '133.67px',
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-[11.54px] pt-[11.06px] pb-0 gap-[81px]">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7,
                    width: '122.17px',
                    height: '22px'
                  }}>
                Total Users
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0 bg-[#E9EFFD] dark:bg-blue-500/20"
                   style={{
                     borderRadius: '12px'
                   }}>
                <Users className="w-[27px] h-[24px] text-primary" />
              </div>
            </div>
            <div className="flex flex-col items-start px-[11.54px] pt-3 pb-[20.61px]">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {statistics.total || 0}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                height: '133.67px',
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-[11.54px] pt-[11.06px] pb-0 gap-[40px]">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7,
                    width: '164px',
                    height: '22px'
                  }}>
                Active
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0 bg-[#E7F7F6] dark:bg-teal-500/20"
                   style={{
                     borderRadius: '12px'
                   }}>
                <User className="w-[31px] h-[31px] text-emerald-500 dark:text-emerald-400" />
              </div>
            </div>
            <div className="flex flex-col items-start px-[11.54px] pt-3 pb-[20.61px]">
              <div className="text-[28px] font-bold text-[#00B69B] leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {statistics.active || 0}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inactive */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                height: '133.67px',
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-[11.54px] pt-[11.06px] pb-0 gap-[81px]">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7,
                    width: '122.17px',
                    height: '22px'
                  }}>
                Inactive
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0 bg-destructive/10"
                   style={{
                     borderRadius: '12px'
                   }}>
                <User className="w-[31px] h-[31px] text-destructive" />
              </div>
            </div>
            <div className="flex flex-col items-start px-[11.54px] pt-3 pb-[20.61px]">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {statistics.inactive || 0}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Suspended */}
        <Card className="border-0 p-0 bg-white dark:bg-gray-800" 
              style={{
                height: '133.67px',
                boxShadow: '6px 6px 54px rgba(0, 0, 0, 0.05)',
                borderRadius: '14px'
              }}>
          <CardContent className="p-0">
            <div className="flex flex-row items-center justify-between px-[11.54px] pt-[11.06px] pb-0 gap-[81px]">
              <h3 className="text-base font-semibold text-[#202224] dark:text-gray-200 flex-1" 
                  style={{
                    fontFamily: 'Nunito Sans, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    lineHeight: '22px',
                    opacity: 0.7,
                    width: '122.17px',
                    height: '22px'
                  }}>
                Suspended
              </h3>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl shrink-0 bg-amber-500/15"
                   style={{
                     borderRadius: '12px'
                   }}>
                <Power className="w-[24px] h-[28px] text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <div className="flex flex-col items-start px-[11.54px] pt-3 pb-[20.61px]">
              <div className="text-[28px] font-bold text-[#202224] dark:text-gray-100 leading-[38px] tracking-[1px]"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 700,
                     fontSize: '28px',
                     lineHeight: '38px',
                     letterSpacing: '1px'
                   }}>
                {statistics.suspended || 0}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 p-0 bg-white dark:bg-gray-800 relative w-full"
            style={{
              minHeight: '179px',
              boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
              borderRadius: '10px'
            }}>
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex flex-row justify-between items-start px-[14px] pt-[22px] gap-[179px]"
               style={{ width: '350px', height: '33px' }}>
            <div className="flex flex-row items-center gap-[14px]" style={{ width: '115px', height: '33px' }}>
              <div className="flex flex-col items-start gap-[5px]" style={{ width: '115px', height: '33px' }}>
                <h3 className="text-base font-semibold text-black dark:text-gray-200 flex items-center"
                    style={{
                      fontFamily: 'Nunito Sans, sans-serif',
                      fontWeight: 600,
                      fontSize: '16px',
                      lineHeight: '16px',
                      width: '155px',
                      height: '16px'
                    }}>
                  Filters
                </h3>
                <p className="text-xs text-black dark:text-gray-400 flex items-center"
                   style={{
                     fontFamily: 'Nunito Sans, sans-serif',
                     fontWeight: 500,
                     fontSize: '12px',
                     lineHeight: '12px',
                     opacity: 0.7,
                     width: '238px',
                     height: '12px'
                   }}>
                  Filter users by various criteria
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="absolute top-[18px] right-[14px] flex flex-row items-center gap-[12px] flex-wrap"
               style={{ maxWidth: '283px', minHeight: '40px' }}>
            <Button
              onClick={clearFilters}
              className="flex flex-row items-center px-5 py-[10px] gap-[10px]"
              style={{
                width: '125px',
                height: '40px',
                background: 'rgba(72, 128, 255, 0.05)',
                border: '1px solid #A9B4BE',
                borderRadius: '10px'
              }}
              variant="outline"
            >
              <span className="text-base font-normal text-[#313D4F] dark:text-gray-300 flex items-center"
                    style={{
                      fontFamily: 'Roboto, sans-serif',
                      fontWeight: 400,
                      fontSize: '16px',
                      lineHeight: '19px',
                      width: '85px',
                      height: '19px'
                    }}>
                Clear Filters
              </span>
            </Button>
            <Button
              onClick={() => refetch()}
              className="flex flex-row items-center px-4 py-[10px] gap-1"
              style={{
                width: '146px',
                height: '40px',
                background: '#4880FF',
                border: '1px solid #C7C8C9',
                borderRadius: '10px'
              }}
            >
              <Filter className="w-5 h-5 text-white" style={{ strokeWidth: 2 }} />
              <span className="text-base font-medium text-[#F3F8FF] flex items-center"
                    style={{
                      fontFamily: 'Roboto, sans-serif',
                      fontWeight: 500,
                      fontSize: '16px',
                      lineHeight: '19px',
                      width: '90px',
                      height: '19px'
                    }}>
                Apply Filters
              </span>
            </Button>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-row items-center px-[14px] pt-[83px] pb-[14px] gap-[14px] flex-wrap"
               style={{ minHeight: '70px' }}>
            {/* Search */}
            <div className="flex flex-col items-start gap-[10px] flex-1 min-w-[300px]" style={{ minHeight: '70px' }}>
              <Label className="text-xs font-normal text-black dark:text-gray-300"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 400,
                       fontSize: '12px',
                       lineHeight: '16px',
                       letterSpacing: '-0.01em',
                       width: '37px',
                       height: '16px'
                     }}>
                Search
              </Label>
              <div className="relative w-full">
                <div className="flex flex-row items-center px-5 py-[10px] gap-[10px] w-full bg-white dark:bg-gray-800 border border-[#A9B4BE] dark:border-gray-600 rounded-[10px]"
                     style={{
                       height: '44px',
                       borderRadius: '10px'
                     }}>
                  <Search className="w-5 h-5 text-[#2E4258] dark:text-gray-400" />
                  <Input
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 pl-2 bg-transparent text-[#2E4258] dark:text-gray-200 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                    style={{
                      fontFamily: 'Roboto, sans-serif',
                      fontWeight: 400,
                      fontSize: '16px',
                      lineHeight: '19px',
                      width: '100%'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Company */}
            <div className="flex flex-col items-start gap-[10px]" style={{ width: '168px', height: '70px' }}>
              <Label className="text-xs font-normal text-black dark:text-gray-300"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 400,
                       fontSize: '12px',
                       lineHeight: '16px',
                       letterSpacing: '-0.01em',
                       width: '51px',
                       height: '16px'
                     }}>
                Company
              </Label>
              <Select
                value={companyFilter || "all"}
                onValueChange={(value) => {
                  setCompanyFilter(value === "all" ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full border-[#C0C0C0] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#2E4258] dark:text-gray-200"
                                style={{
                                  height: '44px',
                                  borderRadius: '10px',
                                  padding: '18px 12px'
                                }}>
                  <SelectValue placeholder="All companies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All companies</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company._id} value={company._id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Role */}
            <div className="flex flex-col items-start gap-[10px]" style={{ width: '168px', height: '70px' }}>
              <Label className="text-xs font-normal text-black dark:text-gray-300"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 400,
                       fontSize: '12px',
                       lineHeight: '16px',
                       letterSpacing: '-0.01em',
                       width: '51px',
                       height: '16px'
                     }}>
                Role
              </Label>
              <Select
                value={roleFilter || "all"}
                onValueChange={(value) => {
                  setRoleFilter(value === "all" ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full border-[#C0C0C0] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#2E4258] dark:text-gray-200"
                                style={{
                                  height: '44px',
                                  borderRadius: '10px',
                                  padding: '18px 12px'
                                }}>
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="company_admin">Company Admin</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="flex flex-col items-start gap-[10px]" style={{ width: '168px', height: '70px' }}>
              <Label className="text-xs font-normal text-black dark:text-gray-300"
                     style={{
                       fontFamily: 'Nunito Sans, sans-serif',
                       fontWeight: 400,
                       fontSize: '12px',
                       lineHeight: '16px',
                       letterSpacing: '-0.01em',
                       width: '35px',
                       height: '16px'
                     }}>
                Status
              </Label>
              <Select
                value={statusFilter || "all"}
                onValueChange={(value) => {
                  setStatusFilter(value === "all" ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full border-[#C0C0C0] dark:border-gray-600 bg-white dark:bg-gray-800 text-[#2E4258] dark:text-gray-200"
                                style={{
                                  height: '44px',
                                  borderRadius: '10px',
                                  padding: '18px 12px'
                                }}>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      {isLoading ? (
        <Card className="bg-white dark:bg-gray-800">
          <CardContent>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400 dark:text-gray-500" />
            </div>
          </CardContent>
        </Card>
      ) : users.length === 0 ? (
        <Card className="bg-white dark:bg-gray-800">
          <CardContent>
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              No users found
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-0 p-0 bg-white dark:bg-gray-800 relative w-full"
                style={{
                  minHeight: '528px',
                  boxShadow: '-2px -2px 4px rgba(0, 0, 0, 0.08), 2px 2px 5px rgba(0, 0, 0, 0.08)',
                  borderRadius: '10px'
                }}>
            <CardContent className="p-0">
              {/* Header */}
              <div className="flex flex-row justify-between items-start px-[14px] pt-[17px] gap-[179px]"
                   style={{ width: '350px', height: '36px' }}>
                <div className="flex flex-row items-center gap-[15px]" style={{ width: '115px', height: '36px' }}>
                  <div className="flex flex-col items-start gap-2" style={{ width: '115px', height: '36px' }}>
                    <h3 className="text-base font-semibold text-black dark:text-gray-200 flex items-center"
                        style={{
                          fontFamily: 'Nunito Sans, sans-serif',
                          fontWeight: 600,
                          fontSize: '16px',
                          lineHeight: '16px',
                          width: '181px',
                          height: '16px'
                        }}>
                      Users
                    </h3>
                    <p className="text-xs text-black dark:text-gray-400 flex items-center"
                       style={{
                         fontFamily: 'Nunito Sans, sans-serif',
                         fontWeight: 500,
                         fontSize: '12px',
                         lineHeight: '12px',
                         opacity: 0.7,
                         width: '308px',
                         height: '12px'
                       }}>
                      {pagination.total || 0} Total users
                    </p>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto px-[14px] pt-[53px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-gray-900 dark:text-gray-200">Name</TableHead>
                      <TableHead className="text-gray-900 dark:text-gray-200">Email</TableHead>
                      <TableHead className="text-gray-900 dark:text-gray-200">Role</TableHead>
                      <TableHead className="text-gray-900 dark:text-gray-200">Company</TableHead>
                      <TableHead className="text-gray-900 dark:text-gray-200">Last Login</TableHead>
                      <TableHead className="text-gray-900 dark:text-gray-200">Status</TableHead>
                      {/* <TableHead className="text-gray-900 dark:text-gray-200">Action</TableHead> */}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user._id}>
                        <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-300">{user.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            {getRoleIcon(user.role)}
                            <span className="capitalize">
                              {user.role?.replace("_", " ")}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-300">{user.companyName || "-"}</TableCell>
                        <TableCell className="text-gray-700 dark:text-gray-300">
                          {user.lastLogin
                            ? new Date(user.lastLogin).toLocaleDateString()
                            : "Never"}
                        </TableCell>
                        <TableCell>{getStatusBadge(user.status)}</TableCell>
                        {/* <TableCell>
                          <div className="flex items-center gap-2">
                            {user.status === "suspended" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleActivate(user._id)}
                                disabled={activateMutation.isPending}
                              >
                                <UserCheck className="h-4 w-4 text-green-600" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSuspend(user._id)}
                                disabled={
                                  suspendMutation.isPending ||
                                  user.role === "super_admin"
                                }
                              >
                                <UserX className="h-4 w-4 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell> */}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {pagination && pagination.total > 0 && (
            <Pagination
              pagination={
                pagination || { page: 1, limit: 20, total: 0, pages: 1 }
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
  );
}
