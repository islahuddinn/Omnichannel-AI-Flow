// src/components/panels/company-admin/UserList.jsx
"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Edit, Trash, MoreVertical, Eye, UserCheck, UserX, Users } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import OnlineIndicator from "@/components/shared/OnlineIndicator";

export default function UserList({
  users,
  onEdit,
  onDelete,
  onView,
  onToggleStatus,
  currentUserId,
}) {
  const getRoleBadge = (role) => {
    const variants = {
      company_admin: "default",
      agent: "secondary",
    };
    return <Badge variant={variants[role] || "outline"}>{role}</Badge>;
  };

  // Ensure users is always an array
  const usersArray = Array.isArray(users) ? users : [];

  if (!usersArray || usersArray.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Users className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">No users found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Try adjusting your search or create a new user.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">User</TableHead>
              <TableHead className="text-left">Email</TableHead>
              <TableHead className="text-left">Departments</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersArray
              .filter((user) => user._id !== currentUserId)
              .map((user) => (
                <TableRow key={user._id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar>
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>
                            {user.firstName?.[0]}
                            {user.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <OnlineIndicator
                          status={user.status}
                          className="absolute bottom-0 right-0"
                        />
                      </div>
                      <div>
                        <p className="font-medium">
                          {user.firstName} {user.lastName}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    {user.departments && user.departments.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.departments.map((dept, index) => (
                          <span
                            key={typeof dept === "object" ? dept._id : dept}
                            className="text-sm"
                          >
                            {typeof dept === "object" ? dept.name : dept}
                            {index < user.departments.length - 1 && ","}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        No departments
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center">
                      <StatusBadge isActive={user.status === "active"} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 sm:gap-2 flex-wrap">
                      <TooltipProvider delayDuration={200}>
                        {/* View Details Button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onView?.(user)}
                              className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View Details</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Edit Button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onEdit(user._id)}
                              className="h-8 w-8 hover:bg-muted hover:text-foreground transition-colors"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit User</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Delete Button */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDelete(user._id)}
                              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete User</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* More Options Menu (for Deactivate/Activate) */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-muted hover:text-foreground transition-colors"
                              title="More Options"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onToggleStatus?.(user)}
                              className={
                                user.status === "active"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }
                            >
                              {user.status === "active" ? (
                                <>
                                  <UserX className="mr-2 h-4 w-4" />
                                  Deactivate User
                                </>
                              ) : (
                                <>
                                  <UserCheck className="mr-2 h-4 w-4" />
                                  Activate User
                                </>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

    </div>
  );
}
