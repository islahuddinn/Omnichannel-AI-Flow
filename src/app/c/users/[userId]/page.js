"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  ArrowLeft,
  Mail,
  Phone,
  User,
  Calendar,
  Loader2,
  Edit,
  MessageSquare,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PhoneNumberDisplay from "@/components/shared/PhoneNumberDisplay";
import DeleteButton from "@/components/shared/DeleteButton";
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
import apiClient from "@/lib/api/client";

export default function UserDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.userId;

  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingUser, setDeletingUser] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchUserDetails();
  }, [userId]);

  const fetchUserDetails = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get(`/users/${userId}`);

      if (response.success) {
        setUser(response.data);
      } else {
        toast.error(response.error || "Failed to fetch user details");
        router.push("/c/users");
      }
    } catch (error) {
      console.error("Fetch user error:", error);
      toast.error("Failed to fetch user details");
      router.push("/c/users");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;

    try {
      setIsDeleting(true);
      const response = await apiClient.delete(`/users/${user._id}`);

      if (response.success) {
        toast.success("User deleted successfully");
        router.push("/c/users");
      } else {
        toast.error(response.error || "Failed to delete user");
      }
    } catch (error) {
      console.error("Delete user error:", error);
      toast.error("Failed to delete user");
    } finally {
      setIsDeleting(false);
      setDeletingUser(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push("/c/users")}
              className="gap-2 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Users</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
              User Details
            </h1>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <DeleteButton onClick={() => setDeletingUser(true)} />
            <Button
              variant="outline"
              onClick={() => router.push(`/c/users/${user._id}/edit`)}
              className="flex-1 sm:flex-initial shrink-0"
              size="sm"
            >
              <Edit className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0" />
              <span className="hidden sm:inline truncate">Edit User</span>
              <span className="sm:hidden truncate">Edit</span>
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <div className="flex items-center justify-center">
                <Avatar className="w-32 h-32">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback className="text-4xl">
                    {user.firstName?.[0]}
                    {user.lastName?.[0]}
                  </AvatarFallback>
                </Avatar>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {user.firstName} {user.lastName}
                </h2>
                {user.email && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {user.email}
                  </p>
                )}
              </div>

              {/* Status Badge */}
              <div className="flex justify-center">
                <div className="mt-1">
                  <StatusBadge isActive={user.status?.toLowerCase() === "active"} />
                </div>
              </div>

              {/* Basic Info */}
              <div className="space-y-3 pt-4 border-t">
                {user.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {user.email}
                    </span>
                  </div>
                )}
                {user.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <PhoneNumberDisplay phone={user.phone} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details Card */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>User Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">
                  BASIC INFORMATION
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">
                      First Name
                    </label>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      {user.firstName || "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">
                      Last Name
                    </label>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      {user.lastName || "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">
                      Email Address
                    </label>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      {user.email || "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">
                      Phone Number
                    </label>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      {user.phone ? (
                        <PhoneNumberDisplay phone={user.phone} />
                      ) : (
                        "-"
                      )}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">
                      Role
                    </label>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      <Badge>{user.role}</Badge>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">
                      Status
                    </label>
                    <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                      <StatusBadge isActive={user.status?.toLowerCase() === "active"} />
                    </p>
                  </div>
                </div>
              </div>

              {/* Departments */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">
                  DEPARTMENTS{" "}
                  {user.departments &&
                    user.departments.length > 0 &&
                    `(${user.departments.length})`}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {user.departments && user.departments.length > 0 ? (
                    user.departments.map((dept, index) => {
                      const deptName =
                        typeof dept === "object" ? dept.name || dept._id : dept;
                      const deptId =
                        typeof dept === "object"
                          ? dept._id || index
                          : dept || index;
                      return (
                        <Badge key={deptId} variant="outline">
                          {deptName}
                        </Badge>
                      );
                    })
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      No departments assigned
                    </p>
                  )}
                </div>
              </div>

              {/* Activity */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">
                  ACTIVITY
                </h3>
                <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  {user.lastLogin && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>
                        Last login:{" "}
                        {new Date(user.lastLogin).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Created: {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deletingUser}
        onOpenChange={(open) => !open && setDeletingUser(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user{" "}
              <strong>
                {user?.firstName} {user?.lastName}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
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
    </div>
  );
}
