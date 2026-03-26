"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useUsersWithCallFeature } from "@/hooks/useUsersWithCallFeature";
import { usePhoneNumbersWithDepartments } from "@/hooks/usePhoneNumbers";
import { useAudioFiles, useUploadAudio } from "@/hooks/useAudioFiles";
import DepartmentSelector from "@/components/forms/DepartmentSelector";

// Import Helper Components
import SelectMembers from "./group-form/SelectMembers";
import ExceptionMembers from "./group-form/ExceptionMembers";
import SelectOutboundNumbers from "./group-form/SelectOutboundNumbers";
import MusicFileSelector from "./group-form/MusicFileSelector";

// Normalize API group to form values (backend uses departmentIds, users; form uses departments, assignedUsers)
function normalizeInitialData(initialData, availableAudioFiles = []) {
  if (!initialData) return null;
  const departmentIds = initialData.departments || initialData.departmentIds || [];
  const normalizedDepartmentIds = departmentIds.map((dept) =>
    typeof dept === "object" && dept !== null
      ? (dept._id || dept.id || dept).toString()
      : String(dept)
  );
  const assignedUsers = initialData.assignedUsers
    || (initialData.users && Array.isArray(initialData.users)
      ? initialData.users.map((u) => (u._id != null ? String(u._id) : u))
      : []);
  const exceptionIds = (initialData.exceptionOutboundNumbers || []).map((id) =>
    typeof id === "object" && id !== null ? (id._id || id).toString() : String(id)
  );
  const playbackUrl = initialData.musicFileUrl || initialData.playback || "";
  let matchedId = initialData.musicFileId ? String(initialData.musicFileId) : "";
  if (!matchedId && playbackUrl && availableAudioFiles.length > 0) {
    const found = availableAudioFiles.find(
      (f) => (f.url || f.fileUrl) === playbackUrl
    );
    if (found) matchedId = (found._id || found.id || "").toString();
  }
  // Backend may use camelCase or snake_case; ensure array of strings
  const rawOutbound = initialData.outboundPhoneNumbers ?? initialData.outbound_phone_numbers;
  const outboundNumbers = Array.isArray(rawOutbound)
    ? rawOutbound.map((n) => (n != null ? String(n) : "")).filter(Boolean)
    : [];
  const rawPrimary =
    initialData.primaryOutboundNumber ?? initialData.primary_outbound_number;
  const primaryOutbound =
    rawPrimary != null && rawPrimary !== "" ? String(rawPrimary) : "";
  const timeToRing = initialData.timeToRingOperator != null
    ? Number(initialData.timeToRingOperator) || 20
    : 20;

  return {
    groupName: initialData.groupName || initialData.group_name || "",
    assignedUsers,
    incomingRoutingStrategy:
      initialData.incomingRoutingStrategy || "ring-to-all",
    timeToRingOperator: timeToRing,
    allowCallsWaitingInLine: Boolean(initialData.allowCallsWaitingInLine),
    musicOnHold: Boolean(initialData.musicOnHold),
    incomingCallsWaitingOptions:
      initialData.incomingCallsWaitingOptions || "no",
    redirectToOccupiedOperators: Boolean(
      initialData.redirectToOccupiedOperators
    ),
    outboundPhoneNumbers: outboundNumbers,
    primaryOutboundNumber: primaryOutbound,
    exceptionOutboundNumbers: exceptionIds,
    musicFileUrl: playbackUrl,
    musicFileId: matchedId,
    departments: normalizedDepartmentIds,
  };
}

// --- Zod Schema ---
const callGroupSchema = z
  .object({
    groupName: z.string().min(1, "Group Name is required"),
    assignedUsers: z.array(z.string()).default([]),
    incomingRoutingStrategy: z.string().default("ring-to-all"),
    timeToRingOperator: z.string().or(z.number()).default(20),
    allowCallsWaitingInLine: z.boolean().default(false),
    musicOnHold: z.boolean().default(false),
    incomingCallsWaitingOptions: z.string().default("wait"),
    redirectToOccupiedOperators: z.boolean().default(false),
    outboundPhoneNumbers: z.array(z.string()).default([]),
    primaryOutboundNumber: z.string().optional().or(z.literal("")),
    exceptionOutboundNumbers: z.array(z.string()).default([]),
    musicFileUrl: z.string().optional().or(z.literal("")),
    musicFileId: z.string().optional(), // Internal helper
    departments: z.array(z.string()).default([]),
  })
  .refine(
    (data) => {
      if (data.outboundPhoneNumbers.length > 0 && !data.primaryOutboundNumber) {
        return false;
      }
      return true;
    },
    {
      message:
        "Primary outbound number is required when outbound numbers are selected",
      path: ["primaryOutboundNumber"],
    }
  );

export default function CallGroupForm({
  open,
  onOpenChange,
  initialData = null,
  isInitialDataLoading = false,
  onSubmit,
  isSubmitting = false,
}) {
  // --- API Data ---
  // --- API Data ---
  const { data: audioFilesData } = useAudioFiles();
  const uploadAudioMutation = useUploadAudio();

  // --- Form Setup ---
  const defaultValues = {
    groupName: "",
    assignedUsers: [],
    incomingRoutingStrategy: "ring-to-all",
    timeToRingOperator: 20,
    allowCallsWaitingInLine: false,
    musicOnHold: false,
    incomingCallsWaitingOptions: "wait",
    redirectToOccupiedOperators: false,
    outboundPhoneNumbers: [],
    primaryOutboundNumber: "",
    exceptionOutboundNumbers: [],
    musicFileUrl: "",
    musicFileId: "",
    departments: [],
  };

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(callGroupSchema),
    defaultValues,
  });

  // --- Watchers for Logic ---
  const assignedUsers = watch("assignedUsers");
  const selectedDepartments = watch("departments");
  const exceptionOutboundNumbers = watch("exceptionOutboundNumbers");
  const outboundPhoneNumbers = watch("outboundPhoneNumbers");
  const primaryOutboundNumber = watch("primaryOutboundNumber");
  const incomingRoutingStrategy = watch("incomingRoutingStrategy");
  const allowCallsWaitingInLine = watch("allowCallsWaitingInLine");
  const musicOnHold = watch("musicOnHold");
  const incomingCallsWaitingOptions = watch("incomingCallsWaitingOptions");

  const hasSelectedDepartments =
    Array.isArray(selectedDepartments) && selectedDepartments.length > 0;

  // Fetch users filtered by selected departments
  const { data: usersData } = useUsersWithCallFeature(
    hasSelectedDepartments ? selectedDepartments : null,
    { enabled: hasSelectedDepartments }
  );

  // Transform API data for helpers
  // API returns { success: true, data: [ ...users ] }
  const employees = useMemo(() => {
    // When no departments are selected, we intentionally show no employees
    // and force the user to pick a department first.
    if (!hasSelectedDepartments) return [];

    return (usersData || []).map((u) => {
      let name = `${u.firstName} ${u.lastName}`;
      if (u.departments && u.departments.length > 0) {
        const deptNames = u.departments.map((d) => d.name).join(", ");
        name += ` (${deptNames})`;
      }
      return {
        user_id: u._id,
        name,
        departments: u.departments || [],
      };
    });
  }, [usersData, hasSelectedDepartments]);

  const availableAudioFiles = audioFilesData || [];

  // --- Derived Logic for Phone Numbers ---
  const selectedDepartmentIds = useMemo(() => {
    if (!assignedUsers || assignedUsers.length === 0) return [];

    const uniqueIds = new Set();
    assignedUsers.forEach((userId) => {
      const user = employees.find((e) => e.user_id === userId);
      if (user && user.departments) {
        user.departments.forEach((d) => uniqueIds.add(d._id));
      }
    });
    return Array.from(uniqueIds);
  }, [assignedUsers, employees]);

  const { data: phoneNumbersData } = usePhoneNumbersWithDepartments(selectedDepartmentIds);

  const availablePhoneNumbers = (phoneNumbersData?.data || []).map(
    (p) => p.phoneNumber
  );

  // --- Sync Logic Effects ---

  // 0. Sync: Departments -> Assigned Users
  // - If no departments are selected, clear assigned users and exceptions
  // - If departments change, drop any assigned user IDs not present in the new employee list
  // - Do NOT clear assigned users when employees haven't loaded yet (keeps edit initial values)
  useEffect(() => {
    if (!hasSelectedDepartments) {
      if ((assignedUsers || []).length > 0) setValue("assignedUsers", []);
      if ((exceptionOutboundNumbers || []).length > 0) {
        setValue("exceptionOutboundNumbers", []);
      }
      return;
    }

    const employeeIds = new Set(
      (employees || []).map((e) => (e.user_id != null ? String(e.user_id) : e.user_id))
    );
    // Only filter when we have employees loaded; otherwise we'd clear initial data on edit
    if (employeeIds.size === 0) return;

    const validAssigned = (assignedUsers || []).filter((id) =>
      employeeIds.has(id != null ? String(id) : id)
    );
    if (validAssigned.length !== (assignedUsers || []).length) {
      setValue("assignedUsers", validAssigned);
    }
  }, [
    hasSelectedDepartments,
    // Using stringified deps avoids effect churn on referential changes
    (selectedDepartments || []).join(","),
    (employees || []).map((e) => e.user_id).join(","),
    (assignedUsers || []).join(","),
    (exceptionOutboundNumbers || []).join(","),
    setValue,
  ]);

  // 1. Initialize Form Data when dialog opens or group data loads (do NOT depend on availableAudioFiles.length
  //    so that after uploading a new music file, refetch of the list does not reset the form and clear the new selection)
  useEffect(() => {
    if (!open) return;
    if (initialData && !isInitialDataLoading) {
      const normalized = normalizeInitialData(initialData, availableAudioFiles);
      if (normalized) reset(normalized);
    } else if (!initialData) {
      reset(defaultValues);
    }
  }, [open, initialData, isInitialDataLoading, reset]);

  // 1b. When audio list loads after dialog opened with empty list, patch musicFileId from URL if missing
  const musicFileId = watch("musicFileId");
  const musicFileUrl = watch("musicFileUrl");
  useEffect(() => {
    if (!open || !initialData || availableAudioFiles.length === 0) return;
    if (musicFileId) return;
    if (!musicFileUrl) return;
    const found = availableAudioFiles.find(
      (f) => (f.fileUrl || f.url) === musicFileUrl
    );
    if (found) {
      setValue("musicFileId", (found._id || found.id || "").toString());
    }
  }, [open, initialData, availableAudioFiles, musicFileId, musicFileUrl, setValue]);

  // 2. Sync: Assigned Users -> Exception Outbound Numbers
  useEffect(() => {
    const validExceptions = exceptionOutboundNumbers.filter((id) =>
      assignedUsers.includes(id)
    );
    if (validExceptions.length !== exceptionOutboundNumbers.length) {
      setValue("exceptionOutboundNumbers", validExceptions);
    }
  }, [assignedUsers, setValue]);
  // Intentionally omitting exceptionOutboundNumbers from dependency to prevent loops, checking length helps.
  // Actually best way: compare arrays.

  // 3. Sync: Outbound Phone Numbers -> Primary Outbound Number
  useEffect(() => {
    if (
      primaryOutboundNumber &&
      !outboundPhoneNumbers.includes(primaryOutboundNumber)
    ) {
      setValue("primaryOutboundNumber", "");
    }
  }, [outboundPhoneNumbers, primaryOutboundNumber, setValue]);

  // 4. Clear outbound phone numbers only when creating (no initialData) and no numbers available.
  // When editing (initialData present), never clear so saved values stay visible.
  useEffect(() => {
    if (initialData) return;
    if (availablePhoneNumbers.length > 0) return;
    if (selectedDepartmentIds.length === 0) return;
    setValue("outboundPhoneNumbers", []);
    setValue("primaryOutboundNumber", "");
  }, [initialData, availablePhoneNumbers.length, selectedDepartmentIds.length, setValue]);

  // 5. Sync: Routing -> Time
  useEffect(() => {
    if (incomingRoutingStrategy !== "ring-to-one") {
      // Keep default or reset? User form logic said reset to 20
      // setValue("timeToRingOperator", 20); // Optional
    }
  }, [incomingRoutingStrategy, setValue]);

  // 6. Sync: Wait In Line -> Music On Hold (Inheritance logic as per previous form)
  // "Logic from source: if waitInLine changes, sync musicOnHold?" -> User said: "Logic from source: setValue("music_on_hold", waitInLine);"
  // We'll mimic this but be careful not to overwrite user intent manually toggling it.
  // Let's just default it if toggled ON.
  useEffect(() => {
    if (allowCallsWaitingInLine) {
      setValue("musicOnHold", true);
    }
  }, [allowCallsWaitingInLine, setValue]);

  // 6b. Sync: Wait In Line OFF -> Clear all dependent waiting/music fields
  useEffect(() => {
    if (allowCallsWaitingInLine) return;
    setValue("musicOnHold", false);
    setValue("incomingCallsWaitingOptions", "wait");
    setValue("musicFileUrl", "");
    setValue("musicFileId", "");
  }, [allowCallsWaitingInLine, setValue]);

  // 7. Sync: Music On Hold -> Waiting Options
  useEffect(() => {
    if (!musicOnHold) {
      setValue("incomingCallsWaitingOptions", "wait");
      setValue("musicFileUrl", "");
      setValue("musicFileId", "");
    }
  }, [musicOnHold, setValue]);

  const onSubmitForm = (data) => {
    // Prepare Payload
    const payload = {
      groupName: data.groupName,
      assignedUsers: data.assignedUsers,
      incomingRoutingStrategy: data.incomingRoutingStrategy,
      timeToRingOperator: Number(data.timeToRingOperator),
      allowCallsWaitingInLine: data.allowCallsWaitingInLine,
      musicOnHold: data.musicOnHold,
      incomingCallsWaitingOptions: data.incomingCallsWaitingOptions,
      redirectToOccupiedOperators: data.redirectToOccupiedOperators,
      outboundPhoneNumbers: data.outboundPhoneNumbers,
      primaryOutboundNumber: data.primaryOutboundNumber,
      exceptionOutboundNumbers: data.exceptionOutboundNumbers,
      musicFileUrl: data.musicFileUrl,
      departments: data.departments || [],
    };
    onSubmit(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-w-[95vw] p-0 overflow-hidden h-[90vh] max-h-[90vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl font-bold worksans text-foreground">
            {initialData ? "Update Group" : "Add New Group"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1">
            {isInitialDataLoading
              ? "Loading group..."
              : initialData
                ? "Edit call group settings and members."
                : "Create a new call group and assign operators."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmitForm)}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6">
            <div className="flex flex-col gap-6 py-4">
              {/* General Settings */}
              <div className="flex flex-col gap-3">
                <p className="font-bold text-sm">General Settings</p>
                <div>
                  <Label className="worksans text-xs text-foreground mb-1.5 block">
                    Group Name*
                  </Label>
                  <Controller
                    name="groupName"
                    control={control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        placeholder="Group Name"
                        className="rounded-[5.53px] bg-input border-border placeholder:text-muted-foreground"
                      />
                    )}
                  />
                  {errors.groupName && (
                    <p className="text-destructive text-xs mt-1">
                      {errors.groupName.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Departments */}
              <div className="flex flex-col gap-3">
                <p className="font-bold text-sm">Departments</p>
                <Controller
                  name="departments"
                  control={control}
                  render={({ field }) => (
                    <DepartmentSelector
                      value={field.value || []}
                      onChange={field.onChange}
                      required={false}
                      multiple={true}
                    />
                  )}
                />
              </div>

              {/* Assigned Operators */}
              <div className="flex flex-col gap-3">
                <p className="font-bold text-sm">Assigned Operators</p>
                <div>
                  <Label className="worksans text-xs text-foreground mb-1.5 block">
                    Select Members
                  </Label>
                  <Controller
                    name="assignedUsers"
                    control={control}
                    render={({ field }) => (
                      <SelectMembers
                        value={field.value}
                        onChange={field.onChange}
                        employees={employees}
                        disabled={!hasSelectedDepartments}
                        placeholder={
                          hasSelectedDepartments
                            ? "Select Members"
                            : "Select department first"
                        }
                        emptyMessage={
                          hasSelectedDepartments
                            ? undefined
                            : "Select department first"
                        }
                      />
                    )}
                  />
                </div>
              </div>

              {/* Exception Outbound Members */}
              <div className="flex flex-col gap-3">
                <Label className="worksans text-xs text-foreground">
                  Exception Outbound Members
                </Label>
                <Controller
                  name="exceptionOutboundNumbers"
                  control={control}
                  render={({ field }) => (
                    <ExceptionMembers
                      value={field.value}
                      onChange={field.onChange}
                      assignedOperators={assignedUsers}
                      employees={employees}
                    />
                  )}
                />
              </div>

              {/* Group Settings */}
              <div className="flex flex-col gap-3">
                <p className="font-bold text-sm">Group Settings</p>

                {/* Routing Strategy */}
                <div>
                  <Label className="worksans text-xs text-foreground mb-1.5 block">
                    Incoming Call Ringing Strategy
                  </Label>
                  <Controller
                    name="incomingRoutingStrategy"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger className="w-full bg-input border-border">
                          <SelectValue placeholder="Select strategy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ring-to-all">
                            Ring to All
                          </SelectItem>
                          <SelectItem value="ring-to-one">
                            Ring to One Operator
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {/* Strategy Info */}
                <div className="flex flex-col text-[9px] text-muted-foreground gap-1">
                  <p>
                    <span className="font-bold">Ring to all:</span> Rings all
                    operators simultaneously.
                  </p>
                  <p>
                    <span className="font-bold">Ring to one:</span> Rings only 1
                    operator. Next call cycles to different operator.
                  </p>
                </div>

                {/* Time to Ring One */}
                {incomingRoutingStrategy === "ring-to-one" && (
                  <div>
                    <Label className="worksans text-xs text-foreground mb-1.5 block">
                      Time to Ring to One Operator
                    </Label>
                    <Controller
                      name="timeToRingOperator"
                      control={control}
                      render={({ field }) => (
                        <Select
                          onValueChange={(val) => field.onChange(Number(val))}
                          value={String(field.value)}
                        >
                          <SelectTrigger className="w-full bg-input border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="20">20s</SelectItem>
                            <SelectItem value="50">50s</SelectItem>
                            <SelectItem value="80">80s</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}

                {/* Wait In Line */}
                <div>
                  <Label className="worksans text-xs text-foreground mb-1.5 block">
                    All Incoming Calls to Wait In-Line
                  </Label>
                  <Controller
                    name="allowCallsWaitingInLine"
                    control={control}
                    render={({ field }) => (
                      <Select
                        onValueChange={(val) => field.onChange(val === "true")}
                        value={String(field.value)}
                      >
                        <SelectTrigger className="w-full bg-input border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>

                {/* Music On Hold */}
                {allowCallsWaitingInLine && (
                  <div>
                    <Label className="worksans text-xs text-foreground mb-1.5 block">
                      Music and Notifications In-Line
                    </Label>
                    <Controller
                      name="musicOnHold"
                      control={control}
                      render={({ field }) => (
                        <Select
                          onValueChange={(val) =>
                            field.onChange(val === "true")
                          }
                          value={String(field.value)}
                        >
                          <SelectTrigger className="w-full bg-input border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">On</SelectItem>
                            <SelectItem value="false">Off</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}

                {/* Options For Incoming Calls Waiting In-Line */}
                {allowCallsWaitingInLine && musicOnHold && (
                  <div>
                    <Label className="worksans text-xs text-foreground mb-1.5 block">
                      Options For Incoming Calls Waiting In-Line
                    </Label>
                    <Controller
                      name="incomingCallsWaitingOptions"
                      control={control}
                      render={({ field }) => (
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger className="w-full bg-input border-border">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* <SelectItem value="no">No</SelectItem> */}
                            <SelectItem value="wait">
                              Tell them to wait in line
                            </SelectItem>
                            <SelectItem value="callback">
                              Tell them to hold or callback
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}

                {/* Music File Selector */}
                {allowCallsWaitingInLine &&
                  musicOnHold &&
                  incomingCallsWaitingOptions !== "no" && (
                  <div>
                    <Controller
                      name="musicFileUrl"
                      control={control}
                      render={({ field }) => (
                        <MusicFileSelector
                          audioFiles={availableAudioFiles}
                          uploadMutation={uploadAudioMutation}
                          value={{
                            fileId: watch("musicFileId") || "",
                            fileUrl: field.value,
                          }}
                          onChange={(fileData) => {
                            field.onChange(fileData.fileUrl);
                            setValue("musicFileId", fileData.fileId);
                          }}
                          waitingOption={incomingCallsWaitingOptions}
                        />
                      )}
                    />
                  </div>
                )}

                {/* Redirect Occupied */}
                {allowCallsWaitingInLine && (
                  <div>
                    <Label className="worksans text-xs text-foreground mb-1.5 block">
                      Redirect Incoming Calls To "OCCUPIED" Operators
                    </Label>
                    <Controller
                      name="redirectToOccupiedOperators"
                      control={control}
                      render={({ field }) => (
                        <Select
                          onValueChange={(val) =>
                            field.onChange(val === "true")
                          }
                          value={String(field.value)}
                        >
                          <SelectTrigger className="w-full bg-input border-border">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Yes</SelectItem>
                            <SelectItem value="false">No</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                )}

                {/* Outbound Numbers */}
                <div>
                  <Label className="worksans text-xs text-foreground mb-1.5 block">
                    Outbound Phone Numbers
                  </Label>
                  <Controller
                    name="outboundPhoneNumbers"
                    control={control}
                    render={({ field }) => (
                      <SelectOutboundNumbers
                        value={field.value}
                        onChange={field.onChange}
                        phoneNumbers={availablePhoneNumbers} // Pass filtered numbers if needed
                      />
                    )}
                  />
                </div>

                {/* Primary Outbound Number */}
                <div>
                  <Label className="worksans text-xs text-foreground mb-1.5 block">
                    Primary Outbound Number
                  </Label>
                  <Controller
                    name="primaryOutboundNumber"
                    control={control}
                    render={({ field }) => {
                      const currentValue = field.value && String(field.value).trim() ? field.value : undefined;
                      const optionsIncludePrimary = currentValue && outboundPhoneNumbers.includes(currentValue);
                      const needFallbackOption = currentValue && !optionsIncludePrimary;
                      return (
                        <Select
                          key={`primary-select-${currentValue ?? "empty"}`}
                          onValueChange={field.onChange}
                          value={currentValue}
                        >
                          <SelectTrigger className="w-full bg-input border-border">
                            <SelectValue placeholder="Select Number">
                              {currentValue ? currentValue : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {outboundPhoneNumbers.map((num) => (
                              <SelectItem key={num} value={num}>
                                {num}
                              </SelectItem>
                            ))}
                            {needFallbackOption && (
                              <SelectItem key={`primary-${currentValue}`} value={currentValue}>
                                {currentValue}
                              </SelectItem>
                            )}
                            {outboundPhoneNumbers.length === 0 && !currentValue && (
                              <SelectItem value="__disabled__" disabled>
                                Select outbound numbers first
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      );
                    }}
                  />
                  {errors.primaryOutboundNumber && (
                    <p className="text-destructive text-xs mt-1">
                      {errors.primaryOutboundNumber.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4 pb-6 px-6 border-t shrink-0 bg-background">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-[5.53px] flex-1 text-base font-bold"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="rounded-[5.53px] flex-1 text-base font-bold"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : initialData ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
