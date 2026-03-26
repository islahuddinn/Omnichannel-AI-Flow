"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import React, { useEffect, useState } from "react";
import { useCallGroups } from "@/hooks/useCallGroups";

function CallToGroup({
  setGroupName,
  groupName,
  setGroupTime,
  groupTime,
  groupId,
  setGroupId,
  initialData,
  errors,
  departmentIds = [],
}) {
  // Fetch call groups filtered by departmentIds
  const { data: groupsData, isLoading } = useCallGroups({
    page: 1,
    limit: 100,
    departmentIds: departmentIds,
  });
  const callGroups = groupsData || [];

  const handleGroupChange = (selectedGroupId) => {
    const selectedGroup = callGroups.find(
      (group) => (group._id || group.group_id).toString() === selectedGroupId
    );
    if (selectedGroup) {
      setGroupId(selectedGroup._id || selectedGroup.group_id);
      setGroupName(selectedGroup.groupName || selectedGroup.group_name);
    }
  };

  useEffect(() => {
    if (initialData) {
      setGroupId(initialData.groupId || "");
      setGroupName(initialData.groupName || "");
      setGroupTime(initialData.groupTime || "");
    }
  }, [initialData]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="worksans text-xs text-foreground pb-2">Group</label>
        <Select
          onValueChange={handleGroupChange}
          value={groupId ? groupId.toString() : ""}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={isLoading ? "Loading..." : "Select group"}
            >
              {groupName || (isLoading ? "Loading..." : "Select group")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {callGroups.map((item) => {
              const id = item._id || item.group_id;
              const name = item.groupName || item.group_name;
              return (
                <SelectItem key={id} value={id.toString()}>
                  {name}
                </SelectItem>
              );
            })}
            {callGroups.length === 0 && !isLoading && (
              <SelectItem value="none" disabled>
                No groups found
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {errors?.groupId && <p className="text-destructive text-[10px] mt-1">{errors.groupId}</p>}
      </div>
      <div>
        <label className="worksans text-xs text-foreground pb-2">
          Seconds to wait on this step
        </label>
        <Input
          value={groupTime}
          onChange={(e) => setGroupTime(e.target.value)}
          placeholder="Enter Seconds To Wait"
          type="number"
          className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {errors?.groupTime && <p className="text-destructive text-[10px] mt-1">{errors.groupTime}</p>}
      </div>
    </div>
  );
}

export default CallToGroup;
