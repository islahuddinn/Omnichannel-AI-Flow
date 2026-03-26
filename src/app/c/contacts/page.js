"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useSocketEvent } from "@/hooks/useSocket";
import apiClient from "@/lib/api/client";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Loader2,
  UserPlus,
  Users,
  Eye,
  Upload,
} from "lucide-react";
import ContactFormModal from "@/components/modals/ContactFormModal";
import CSVImportModal from "@/components/modals/CSVImportModal";
import Pagination from "@/components/shared/Pagination";
import PhoneNumberDisplay from "@/components/shared/PhoneNumberDisplay";
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
import { toast } from "sonner";

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PAGE_SIZE = 20;

export default function ContactsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [deletingContact, setDeletingContact] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["contacts", page, limit, debouncedSearchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (debouncedSearchQuery) {
        params.append("search", debouncedSearchQuery);
      }

      const result = await apiClient.get(`/contacts?${params}`);
      return result;
    },
    staleTime: 30 * 1000, // 30s — fresh enough for real-time updates via sockets
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // ✅ Extract data from query result
  const contacts = data?.data || [];
  const pagination = data?.pagination || {
    page: 1,
    limit: limit,
    total: 0,
    pages: 1,
  };
  const statistics = data?.statistics || { total: 0, active: 0, inactive: 0 };

  const handleAddContact = () => {
    setEditingContact(null);
    setIsFormOpen(true);
  };

  const handleEditContact = (contact) => {
    setEditingContact(contact);
    setIsFormOpen(true);
  };

  const handleDeleteContact = async () => {
    if (!deletingContact) return;

    try {
      setIsDeleting(true);
      const result = await apiClient.delete(`/contacts/${deletingContact._id}`);

      if (result.success) {
        const { data } = result;
        const conversationsDeleted = data?.conversationsDeleted || 0;
        const messagesDeleted = data?.messagesDeleted || 0;
        
        // ✅ Show detailed success message
        if (conversationsDeleted > 0 || messagesDeleted > 0) {
          toast.success("Contact deleted successfully!", {
            description: `${conversationsDeleted} conversation${conversationsDeleted !== 1 ? 's' : ''} and ${messagesDeleted} message${messagesDeleted !== 1 ? 's' : ''} also deleted permanently`
          });
        } else {
          toast.success("Contact deleted successfully!");
        }
        
        // ✅ Invalidate and refetch contacts
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
        // ✅ Invalidate conversations to remove deleted conversations from list
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        setDeletingContact(null);
      } else {
        toast.error(result.error || "Failed to delete contact");
      }
    } catch (error) {
      toast.error("Failed to delete contact", {
        description: error.response?.data?.error || error.message || "An error occurred while deleting the contact"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFormSuccess = () => {
    setPage(1);
    // ✅ Invalidate and refetch contacts
    queryClient.invalidateQueries({ queryKey: ["contacts"] });
  };

  // ✅ Listen for real-time contact deletion via sockets
  useSocketEvent(
    "contact:deleted",
    useCallback(
      (data) => {
        try {
          const { contactId, conversationsDeleted, messagesDeleted } = data || {};
          if (!contactId) return;

          // Remove contact from all contacts queries in the cache
          queryClient.setQueriesData({ queryKey: ["contacts"] }, (oldData) => {
            if (!oldData) return oldData;

            const existingContacts = oldData.data || [];
            const updatedContacts = existingContacts.filter(
              (c) => String(c._id) !== String(contactId)
            );

            // ✅ Update pagination total
            const newTotal = Math.max(0, (oldData.pagination?.total || existingContacts.length) - 1);

            return {
              ...oldData,
              data: updatedContacts,
              pagination: {
                ...oldData.pagination,
                total: newTotal,
              },
            };
          });

          // Invalidate conversations queries to remove deleted conversations
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        } catch {
          // Silent fail — socket event errors are non-critical
        }
      },
      [queryClient]
    )
  );

  // ✅ Listen for real-time contact creation via sockets
  useSocketEvent(
    "contact:new",
    useCallback(
      (data) => {
        try {
          const { contact } = data || {};
          if (!contact || !contact._id) return;

          // Update all contacts queries in the cache
          queryClient.setQueriesData({ queryKey: ["contacts"] }, (oldData) => {
            if (!oldData) return oldData;

            // Check if contact already exists (prevent duplicates)
            const existingContacts = oldData.data || [];
            const exists = existingContacts.some((c) => c._id === contact._id);
            if (exists) return oldData;

            // Check if contact matches current search query
            const currentSearch = debouncedSearchQuery?.toLowerCase() || "";

            if (currentSearch) {
              const searchFields = [
                contact.name,
                contact.firstName,
                contact.lastName,
                contact.email,
                contact.phone,
                contact.Contact_Type,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

              if (!searchFields.includes(currentSearch)) return oldData;
            }

            // Add new contact to the beginning of the list (most recent first)
            const updatedContacts = [contact, ...existingContacts];

            // ✅ Update statistics
            const updatedStatistics = {
              ...oldData.statistics,
              total: (oldData.statistics?.total || 0) + 1,
              active: (oldData.statistics?.active || 0) + 1,
            };

            // ✅ Update pagination total
            const updatedPagination = {
              ...oldData.pagination,
              total: (oldData.pagination?.total || 0) + 1,
            };

            return {
              ...oldData,
              data: updatedContacts,
              statistics: updatedStatistics,
              pagination: updatedPagination,
            };
          });

          // Also invalidate queries to ensure UI updates
          queryClient.invalidateQueries({ queryKey: ["contacts"] });
        } catch {
          // Silent fail — socket event errors are non-critical
        }
      },
      [queryClient, debouncedSearchQuery]
    )
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Contacts
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your contact directory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsImportOpen(true)}
            className="gap-2 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={handleAddContact} className="gap-2">
            <Plus className="mt-1 h-4 w-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Total Contacts
                </p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {statistics.total}
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Active Contacts
                </p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {statistics.active}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Inactive Contacts
                </p>
                <p className="text-3xl font-bold text-gray-600 dark:text-gray-300">
                  {statistics.inactive}
                </p>
              </div>
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex gap-4" role="search" aria-label="Contacts search">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search contacts by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
              }}
              className="pl-10 rounded-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
              aria-label="Search contacts by name, email, or phone"
              autoComplete="off"
            />
          </div>
        </div>
      </div>

      {/* Contacts Table */}
      <div
        aria-busy={isLoading}
        aria-live="polite"
        aria-label="Contacts list"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-20" role="status" aria-label="Loading contacts">
            <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-gray-400" aria-hidden="true" />
            <span className="sr-only">Loading contacts...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <Users className="h-7 w-7 text-destructive" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Failed to load contacts</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {error.message || "Unable to fetch contacts. Please try again."}
              </p>
            </div>
            <Button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["contacts"] })}
              variant="outline"
              size="sm"
            >
              Retry
            </Button>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4" aria-hidden>
              <UserPlus className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No contacts found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {debouncedSearchQuery
                ? "Try adjusting your search"
                : "Get started by adding your first contact"}
            </p>
            {!debouncedSearchQuery && (
            <Button onClick={handleAddContact}>
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Button>
          )}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
            <Table role="grid" aria-label="Contacts">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left" scope="col">Name</TableHead>
                  <TableHead className="text-left" scope="col">Email</TableHead>
                  <TableHead className="text-left" scope="col">Phone</TableHead>
                  <TableHead className="text-center" scope="col">Status</TableHead>
                  <TableHead className="text-center" scope="col">Actions</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {contacts.map((contact, index) => (
                <TableRow key={contact._id}>
                  <TableCell className="font-medium">{contact.name}</TableCell>
                  <TableCell>{contact.email || "-"}</TableCell>
                  <TableCell>
                    {contact.phone ? (
                      <PhoneNumberDisplay phone={contact.phone} />
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center">
                      <StatusBadge isActive={contact.Is_Active !== false} />
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
                              onClick={() =>
                                router.push(`/c/contacts/${contact._id}`)
                              }
                              className="h-8 w-8 min-h-[44px] min-w-[44px] hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              aria-label={`View contact ${contact.name || contact.email || 'details'}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View Details</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditContact(contact)}
                              className="h-8 w-8 min-h-[44px] min-w-[44px] hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                              aria-label={`Edit contact ${contact.name || contact.email || ''}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit</p>
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingContact(contact)}
                              className="h-8 w-8 min-h-[44px] min-w-[44px] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                              aria-label={`Delete contact ${contact.name || contact.email || ''}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && contacts.length > 0 && pagination && (
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

      {/* Contact Form Modal */}
      <ContactFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingContact(null);
        }}
        contact={editingContact}
        onSuccess={handleFormSuccess}
      />

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          setIsImportOpen(false);
          queryClient.invalidateQueries({ queryKey: ["contacts"] });
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingContact}
        onOpenChange={(open) => !open && setDeletingContact(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete{" "}
                <strong>{deletingContact?.name}</strong>? This action cannot be
                undone.
              </p>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                ⚠️ This will permanently delete:
              </p>
              <ul className="text-sm list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 ml-2">
                <li>All conversations with this contact</li>
                <li>All messages in those conversations</li>
                <li>The contact itself</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteContact}
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
