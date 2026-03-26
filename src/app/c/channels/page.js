


// src/app/c/channels/page.js
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, Filter, RefreshCw, Search, Loader2, Building2, AlertTriangle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import apiClient from '@/lib/api/client';
import ChannelManager from '@/components/panels/company-admin/ChannelManager';
import TemplateManager from '@/components/panels/company-admin/TemplateManager';
import DepartmentList from '@/components/panels/company-admin/DepartmentList';
import CreateDepartmentModal from '@/components/modals/CreateDepartmentModal';
import ChannelIcon from '@/components/shared/ChannelIcon';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ACTIVE_TAB_CLASSES } from '@/constants/ui';
import Pagination from '@/components/shared/Pagination';

function ChannelsPageContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState('accounts');

  // ✅ Set active tab from URL parameter (for redirects from old departments page)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['accounts', 'templates', 'departments'].includes(tabParam)) {
      setActiveTab(tabParam);
      // Clean up URL by removing the tab parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('tab');
      router.replace(newUrl.pathname + newUrl.search, { scroll: false });
    }
  }, [searchParams, router]);
  const [channelFilter, setChannelFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // ✅ Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1); // Reset to page 1 when search changes
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch channels/accounts with pagination
  const { 
    data: channelsData, 
    isLoading: channelsLoading, 
    refetch: refetchChannels,
    error: channelsError 
  } = useQuery({
    queryKey: ['channels', page, limit, debouncedSearchTerm, channelFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (debouncedSearchTerm) {
        params.append('search', debouncedSearchTerm);
      }

      if (channelFilter !== 'all') {
        params.append('type', channelFilter);
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const result = await apiClient.get(`/channels?${params}`);
      return result;
    },
    retry: 2,
    staleTime: 30 * 1000
  });

  // Fetch templates (always enabled for global counts)
  const { 
    data: templatesData, 
    isLoading: templatesLoading,
    refetch: refetchTemplates 
  } = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiClient.get('/templates'),
    retry: 2,
    staleTime: 30 * 1000
  });

  // Fetch departments (always enabled for global counts)
  const { 
    data: departmentsData, 
    isLoading: departmentsLoading,
    refetch: refetchDepartments 
  } = useQuery({
    queryKey: ['departments'],
    queryFn: () => apiClient.get('/departments'),
    retry: 2,
    staleTime: 30 * 1000
  });

  const [isCreateDepartmentModalOpen, setIsCreateDepartmentModalOpen] = useState(false);
  const [departmentToDelete, setDepartmentToDelete] = useState(null);

  // Delete department mutation
  const deleteDepartmentMutation = useMutation({
    mutationFn: (deptId) => apiClient.delete(`/departments/${deptId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      toast.success('Department deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete department');
    }
  });

  const channels = channelsData?.data || [];
  const templates = templatesData?.data || [];
  const pagination = channelsData?.pagination || {
    page: 1,
    limit: limit,
    total: 0,
    pages: 1,
  };

  // Get counts by type for tabs (using all channels, not just current page)
  const channelsByType = {
    all: channels,
    whatsapp: channels.filter(c => c.type === 'whatsapp'),
    facebook: channels.filter(c => c.type === 'facebook'),
    instagram: channels.filter(c => c.type === 'instagram'),
    sms: channels.filter(c => c.type === 'sms'),
    email: channels.filter(c => c.type === 'email'),
    webchat: channels.filter(c => c.type === 'webchat')
  };

  const handleRefresh = () => {
    // Refresh all queries to keep counts up to date
    refetchChannels();
    refetchTemplates();
    refetchDepartments();
    toast.success('All data refreshed');
  };

  if (channelsError) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Failed to load channels</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {channelsError?.message || 'Unable to fetch channels. Please try again.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetchChannels()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Channels & Accounts
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage communication channels, accounts, and message templates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} className="cursor-pointer">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div>
              <div className="text-sm text-muted-foreground">Total Channels</div>
              <div className="text-2xl font-bold text-foreground">{pagination.total}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Connected</div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {channels.filter(c => c.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Disconnected</div>
            <div className="text-2xl font-bold text-muted-foreground">
              {channels.filter(c => c.status === 'inactive').length}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Templates</div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {templatesData?.data?.length || 0}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Departments</div>
            <div className="text-2xl font-bold text-primary">
              {departmentsData?.data?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full gap-3 px-2 grid-cols-3 bg-muted border-border">
          <TabsTrigger value="accounts" className={`flex items-center gap-2 cursor-pointer data-[state=active]:bg-card ${ACTIVE_TAB_CLASSES.trigger}`}>
            <Filter className="h-4 w-4" />
            Accounts & Channels
          </TabsTrigger>
          <TabsTrigger value="templates" className={`flex items-center gap-2 cursor-pointer data-[state=active]:bg-card ${ACTIVE_TAB_CLASSES.trigger}`}>
            <Plus className="h-4 w-4" />
            Message Templates
          </TabsTrigger>
          <TabsTrigger value="departments" className={`flex items-center gap-2 cursor-pointer data-[state=active]:bg-card ${ACTIVE_TAB_CLASSES.trigger}`}>
            <Building2 className="h-4 w-4" />
            Departments
          </TabsTrigger>
        </TabsList>

        {/* Search and Dropdowns Container - Only show for accounts tab */}
        {activeTab === 'accounts' && (
          <div className="flex flex-col sm:flex-row gap-4 items-center mt-4">
            {/* Search Field */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                placeholder="Search channels..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                aria-label="Search channels"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-32 cursor-pointer" aria-label="Filter by status">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="cursor-pointer">All Status</SelectItem>
                  <SelectItem value="active" className="cursor-pointer">Active</SelectItem>
                  <SelectItem value="inactive" className="cursor-pointer">Inactive</SelectItem>
                  <SelectItem value="error" className="cursor-pointer">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Accounts Tab */}
        <TabsContent value="accounts" className="space-y-6" key="accounts-content">
          {/* Quick Setup - Moved to top */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle>Quick Setup</CardTitle>
              <CardDescription>
                Set up new communication channels
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { type: 'whatsapp', label: 'WhatsApp' },
                  { type: 'facebook', label: 'Facebook' },
                  { type: 'instagram', label: 'Instagram' },
                  { type: 'sms', label: 'SMS' },
                  { type: 'email', label: 'Email' },
                  { type: 'webchat', label: 'WebChat' }
                ].map((channel) => (
                  <Button
                    key={channel.type}
                    variant="outline"
                    className="h-24 flex-col gap-2 cursor-pointer hover:bg-muted"
                    onClick={() => router.push(`/c/channels/${channel.type}/setup`)}
                  >
                    <ChannelIcon type={channel.type} className="h-8 w-8" />
                    <span className="text-sm">{channel.label}</span>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Channel Type Tabs */}
          <Tabs 
            value={channelFilter} 
            onValueChange={(value) => {
              setChannelFilter(value);
              setPage(1); // Reset to page 1 when filter changes
            }}
            className="w-full" 
            key={`channel-tabs-${activeTab}`}
          >
            <TabsList className="w-full gap-3 px-2 overflow-x-auto bg-muted border-border">
              <TabsTrigger value="all" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                All ({pagination.total})
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                WhatsApp ({channelsByType.whatsapp.length})
              </TabsTrigger>
              <TabsTrigger value="facebook" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Facebook ({channelsByType.facebook.length})
              </TabsTrigger>
              <TabsTrigger value="instagram" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Instagram ({channelsByType.instagram.length})
              </TabsTrigger>
              <TabsTrigger value="sms" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                SMS ({channelsByType.sms.length})
              </TabsTrigger>
              <TabsTrigger value="email" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Email ({channelsByType.email.length})
              </TabsTrigger>
              <TabsTrigger value="webchat" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                WebChat ({channelsByType.webchat.length})
              </TabsTrigger>
            </TabsList>

            {channelsLoading ? (
              <div className="flex items-center justify-center py-12" role="status" aria-label="Loading">
                <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" aria-hidden="true" />
                <span className="sr-only">Loading...</span>
              </div>
            ) : channelsError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                  <RefreshCw className="h-7 w-7 text-destructive" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Failed to load channels</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {channelsError?.message || 'Unable to fetch channels. Please try again.'}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchChannels()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : (
              <TabsContent value={channelFilter} key={channelFilter}>
                <ChannelManager channels={channels} />
              </TabsContent>
            )}
          </Tabs>

          {/* Pagination */}
          {!channelsLoading && channels.length > 0 && pagination && (
            <Pagination
              pagination={pagination}
              onPageChange={(newPage) => {
                setPage(newPage);
              }}
              onLimitChange={(newLimit) => {
                setLimit(newLimit);
                setPage(1);
              }}
            />
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" key="templates-content">
          {templatesLoading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Loading templates">
              <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" aria-hidden="true" />
              <span className="sr-only">Loading templates...</span>
            </div>
          ) : (
            <TemplateManager 
              templates={templates} 
              channels={channels}
            />
          )}
        </TabsContent>

        {/* Departments Tab */}
        <TabsContent value="departments" className="space-y-6" key="departments-content">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Departments
              </h2>
              <p className="text-muted-foreground mt-1">
                Organize your team and manage routing rules
              </p>
            </div>
            <Button onClick={() => setIsCreateDepartmentModalOpen(true)} className="cursor-pointer">
              <Plus className="mr-2 h-4 w-4" />
              Create Department
            </Button>
          </div>

          {departmentsLoading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Loading departments">
              <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" aria-hidden="true" />
              <span className="sr-only">Loading departments...</span>
            </div>
          ) : (
            <DepartmentList
              departments={departmentsData?.data || []}
              onEdit={(deptId) => router.push(`/c/departments/${deptId}/edit`)}
              onDelete={(deptId) => setDepartmentToDelete(deptId)}
            />
          )}

          <CreateDepartmentModal
            open={isCreateDepartmentModalOpen}
            onClose={() => setIsCreateDepartmentModalOpen(false)}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['departments'] });
              setIsCreateDepartmentModalOpen(false);
            }}
          />

          <AlertDialog open={!!departmentToDelete} onOpenChange={(open) => { if (!open) setDepartmentToDelete(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Department</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this department? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => {
                    if (departmentToDelete) {
                      deleteDepartmentMutation.mutate(departmentToDelete);
                      setDepartmentToDelete(null);
                    }
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ChannelsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]" role="status" aria-label="Loading channels">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary" aria-hidden="true" />
        <span className="sr-only">Loading channels...</span>
      </div>
    }>
      <ChannelsPageContent />
    </Suspense>
  );
}