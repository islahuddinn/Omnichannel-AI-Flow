"use client";

import { useState } from "react";
import CallGroupsTable from "@/components/panels/company-admin/call-center/CallGroupsTable";
import CallGroupForm from "@/components/panels/company-admin/call-center/CallGroupForm";
import ConfirmDialog from "@/components/modals/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  useCallGroups,
  useCallGroup,
  useCreateCallGroup,
  useUpdateCallGroup,
  useDeleteCallGroup,
} from "@/hooks/useCallGroups";
import { toast } from "sonner";

export default function CallGroupsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  // API Hooks
  const {
    data: callGroupsData,
    isLoading,
    isError,
  } = useCallGroups({ page, limit, search: searchQuery });
  const editingGroupId = editingGroup?._id || editingGroup?.group_id;
  const { data: fetchedGroup, isLoading: isLoadingGroup } = useCallGroup(
    editingGroupId,
    { enabled: !!editingGroupId && isModalOpen }
  );
  const createCallGroup = useCreateCallGroup();
  const updateCallGroup = useUpdateCallGroup();
  const deleteCallGroup = useDeleteCallGroup();

  // When editing, use freshly fetched group so form gets full backend data (fixes values not showing after refresh).
  // Prefer fetched group; while loading show list row so dialog can open, form will reset when fetch completes.
  const formInitialData = isModalOpen && editingGroupId
    ? (fetchedGroup ?? editingGroup)
    : editingGroup;
  const formWaitingForData = !!editingGroupId && isModalOpen && isLoadingGroup;

  // Handlers
  const handleAddGroup = () => {
    setEditingGroup(null);
    setIsModalOpen(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = (groupId) => {
    setGroupToDelete(groupId);
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;

    try {
      await deleteCallGroup.mutateAsync(groupToDelete);
      toast.success("Call Group deleted successfully");
      setGroupToDelete(null);
    } catch (error) {
      toast.error("Failed to delete call group");
    }
  };

  const handleFormSubmit = async (formData) => {
    try {
      if (editingGroup) {
        // Update existing
        await updateCallGroup.mutateAsync({
          id: editingGroup.group_id || editingGroup._id,
          data: formData,
        });
        toast.success("Call Group updated successfully");
      } else {
        // Add new
        await createCallGroup.mutateAsync(formData);
        toast.success("Call Group created successfully");
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Operation failed");
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 py-4 px-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Call Groups</h2>
          <p className="text-muted-foreground">
            Manage your call groups and assignments.
          </p>
        </div>
        <Button onClick={handleAddGroup} disabled={isLoading}>
          <Plus className="mr-2 h-4 w-4" />
          Add Group
        </Button>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col border shadow-sm bg-card">
        <CardContent className="p-6 flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              Loading...
            </div>
          ) : isError ? (
            <div className="flex items-center justify-center h-full text-destructive">
              Failed to load call groups
            </div>
          ) : (
            <CallGroupsTable
              data={callGroupsData || []}
              onEdit={handleEditGroup}
              onDelete={handleConfirmDelete}
              pagination={
                callGroupsData?.pagination || {
                  page: 1,
                  limit: 10,
                  total: 0,
                  pages: 1,
                }
              }
              onPageChange={setPage}
              onLimitChange={setLimit}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}
        </CardContent>
      </Card>

      <CallGroupForm
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        initialData={formInitialData}
        isInitialDataLoading={formWaitingForData}
        onSubmit={handleFormSubmit}
        isSubmitting={createCallGroup.isPending || updateCallGroup.isPending}
      />

      <ConfirmDialog
        open={!!groupToDelete}
        onOpenChange={(open) => !open && setGroupToDelete(null)}
        title="Delete Call Group"
        description="Are you sure you want to delete this call group? This action cannot be undone."
        onConfirm={handleDeleteGroup}
        loading={deleteCallGroup.isPending}
        variant="destructive"
        confirmText="Delete"
      />
    </div>
  );
}
