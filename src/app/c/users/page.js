// src/app/c/users/page.js
"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import apiClient from "@/lib/api/client";
import UserList from "@/components/panels/company-admin/UserList";
import CreateUserModal from "@/components/modals/CreateUserModal";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { toast } from "sonner";
import Pagination from "@/components/shared/Pagination";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function UsersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("users");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [statistics, setStatistics] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  const { data, isLoading, isError, error: usersError, refetch } = useQuery({
    queryKey: ["users", page, limit, search],
    queryFn: async () => {
      const result = await apiClient.get(
        `/users?page=${page}&limit=${limit}&search=${search}`
      );
      if (result.success && result.statistics) {
        setStatistics(result.statistics);
      }
      return result;
    },
    staleTime: 0,
    cacheTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    enabled: activeTab === "users", // Only fetch if users tab is active
  });

  // Get current user ID separately
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const currentUser = await apiClient.get("/auth/me");
        if (currentUser?.success && currentUser?.data?._id) {
          setCurrentUserId(currentUser.data._id);
        }
      } catch (error) {
        console.error("Failed to fetch current user:", error);
        toast.error("Failed to identify current user");
      }
    };
    fetchCurrentUser();
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (userId) => apiClient.delete(`/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries(["users"]);
      toast.success("User deleted successfully");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete user");
    },
  });

  const handleDelete = (userId) => {
    if (userId === currentUserId) {
      toast.error("You cannot delete your own account");
      return;
    }
    setDeleteUserId(userId);
  };

  const handleView = (user) => {
    router.push(`/c/users/${user._id}`);
  };

  const [togglingUser, setTogglingUser] = useState(null);
  const [deleteUserId, setDeleteUserId] = useState(null);

  const handleToggleStatus = (user) => {
    setTogglingUser(user);
  };

  const confirmToggleStatus = async () => {
    if (!togglingUser) return;

    const newStatus = togglingUser.status === "active" ? "inactive" : "active";
    try {
      await apiClient.put(`/users/${togglingUser._id}`, {
        status: newStatus,
      });
      toast.success(
        `User ${
          newStatus === "active" ? "activated" : "deactivated"
        } successfully!`
      );
      queryClient.invalidateQueries(["users"]);
      setTogglingUser(null);
    } catch (error) {
      toast.error("Failed to update user status");
      setTogglingUser(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Users
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your team members and their permissions
          </p>
        </div>
        {activeTab === "users" && (
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Create User
          </Button>
        )}
      </div>

      <Tabs
        defaultValue="users"
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsContent value="users" className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Total Users
                    </p>
                    <p className="text-3xl font-bold text-foreground">
                      {statistics.total}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Active Users
                    </p>
                    <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                      {statistics.active}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center">
                    <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">
                      Inactive Users
                    </p>
                    <p className="text-3xl font-bold text-muted-foreground">
                      {statistics.inactive}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                    <Users className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Users List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <Users className="h-7 w-7 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Failed to load users</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {usersError?.message || 'Unable to fetch users. Please try again.'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <UserList
                users={Array.isArray(data?.data) ? data.data : []}
                pagination={data?.pagination}
                onPageChange={setPage}
                onEdit={(userId) => router.push(`/c/users/${userId}/edit`)}
                onDelete={handleDelete}
                onView={handleView}
                onToggleStatus={handleToggleStatus}
                currentUserId={currentUserId}
              />

              {/* Pagination */}
              {data?.pagination && data.pagination?.total > 0 && (
                <Pagination
                  pagination={
                    data.pagination || {
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
        </TabsContent>

      </Tabs>

      {/* Create User Modal */}
      <CreateUserModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          queryClient.refetchQueries({ queryKey: ["users"], exact: false });
          setIsCreateModalOpen(false);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteUserId}
        onOpenChange={(open) => !open && setDeleteUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate(deleteUserId);
                setDeleteUserId(null);
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Toggle Status Confirmation Dialog */}
      <AlertDialog
        open={!!togglingUser}
        onOpenChange={(open) => !open && setTogglingUser(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingUser?.status === "active"
                ? "Deactivate User?"
                : "Activate User?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to{" "}
              {togglingUser?.status === "active" ? "deactivate" : "activate"}{" "}
              user{" "}
              <strong>
                {togglingUser?.firstName} {togglingUser?.lastName}
              </strong>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmToggleStatus}
              className={
                togglingUser?.status === "active"
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }
            >
              {togglingUser?.status === "active" ? "Deactivate" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
