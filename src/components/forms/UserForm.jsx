"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, MessageSquare, User, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import apiClient from "@/lib/api/client";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { usePhoneNumbers, usePhoneNumbersWithDepartments } from "@/hooks/usePhoneNumbers";
import { useAudioFiles, useUploadAudio } from "@/hooks/useAudioFiles";

import BasicInfoTab from "./user-tabs/BasicInfoTab";
import ChatSettingsTab from "./user-tabs/ChatSettingsTab";
import CallSettingsTab from "./user-tabs/CallSettingsTab";
import { ACTIVE_TAB_CLASSES } from "@/constants/ui";

// --- Zod Schemas ---

const baseSchema = z.object({
  firstName: z.string().min(1, "First Name is required"),
  lastName: z.string().min(1, "Last Name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().refine(
    (val) => !val || val.replace(/\D/g, '').length >= 10,
    { message: "Phone number must be at least 10 digits" }
  ),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
  departments: z
    .array(z.string())
    .min(1, "At least one department is required"),

  // Chat Settings
  chat_feature: z.string().min(1, "Chat feature is required"),
  role_in_chat_feature: z.string().optional(),

  // Call Settings
  call_center: z.string().min(1, "Call center feature is required"),
  inbound_calls: z.string().optional(),
  outbound_calls: z.string().optional(),
  role_in_call_center: z.string().optional(),
  call_access: z.string().optional(),
  recording_downloads: z.any().optional(), // Can be string "yes"/"no" or boolean
  outbound_phone_number: z.array(z.string()).optional(),
  primary_outbound_phone_number: z.string().optional(),
  waiting_in_line: z.string().optional(),
  playback_during_paused: z.string().optional(),
  playback: z.any().optional(),
  specific_playback_selection: z.string().optional(),
});

// Refinement for password matching
const passwordSchema = baseSchema.refine(
  (data) => {
    if (data.password || data.confirmPassword) {
      if (!data.password || !data.confirmPassword) return false;
      if (data.password.length < 8) return false;
      return data.password === data.confirmPassword;
    }
    return true;
  },
  {
    message: "Passwords must match and be at least 8 characters",
    path: ["confirmPassword"],
  }
);

// Validation Refinements
const userFormSchema = passwordSchema
  .refine(
    (data) => {
      if (data.call_center === "on") {
        return (
          data.inbound_calls &&
          data.outbound_calls &&
          data.role_in_call_center &&
          data.call_access &&
          data.recording_downloads !== undefined
        );
      }
      return true;
    },
    { message: "Call center fields are required", path: ["call_center"] }
  )
  .refine(
    (data) => {
      if (data.call_center === "on" && data.outbound_calls === "yes") {
        return (
          data.outbound_phone_number &&
          data.outbound_phone_number.length > 0 &&
          data.primary_outbound_phone_number
        );
      }
      return true;
    },
    {
      message: "Outbound phone numbers are required",
      path: ["outbound_phone_number"],
    }
  )
  .refine(
    (data) => {
      if (data.call_center === "on" && data.inbound_calls === "yes") {
        return data.waiting_in_line && data.playback_during_paused;
      }
      return true;
    },
    { message: "Inbound call settings are required", path: ["waiting_in_line"] }
  )
  .refine(
    (data) => {
      if (data.playback_during_paused === "choose") {
        return !!data.playback || !!data.specific_playback_selection;
      }
      return true;
    },
    {
      message: "Please select an existing file or upload a new one",
      path: ["playback"],
    }
  );

export default function UserForm({
  initialData,
  onSubmit,
  isLoading: isSubmittingParent,
  onCancel,
}) {
  const router = useRouter();

  // API Hooks
  const { data: audioFilesData } = useAudioFiles();
  const uploadAudioMutation = useUploadAudio();
  const { data: departmentsData, isLoading: loadingDepartments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiClient.get("/departments"),
  });

  // Helper to safely extract IDs
  const extractDepartmentIds = (departments) => {
    if (!departments || !Array.isArray(departments)) return [];
    return departments.map((dept) => {
      if (typeof dept === "object" && dept !== null) {
        return dept._id?.toString() || dept.toString();
      }
      return dept.toString();
    });
  };

  const parseOutboundNumbers = (numbers) => {
    if (!numbers) return [];
    if (Array.isArray(numbers)) return numbers;
    try {
      return JSON.parse(numbers);
    } catch (e) {
      return [numbers];
    }
  };

  const defaultValues = {
    firstName: initialData?.firstName || "",
    lastName: initialData?.lastName || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    password: "",
    confirmPassword: "",
    departments: extractDepartmentIds(initialData?.departments),

    // Chat Defaults
    chat_feature: initialData?.chat?.chat_feature || "on",
    role_in_chat_feature: initialData?.chat?.role_in_chat_feature || "",

    // Call Center Defaults
    call_center: initialData?.callCenter?.call_center || "off",
    inbound_calls: initialData?.callCenter?.inbound_calls || "no",
    outbound_calls: initialData?.callCenter?.outbound_calls || "no",
    role_in_call_center:
      initialData?.callCenter?.role_in_call_center || "call-center-operator",
    call_access: initialData?.callCenter?.call_access || "only-calls-by-him",
    recording_downloads: initialData?.callCenter?.recording_downloads
      ? "yes"
      : "no",
    outbound_phone_number: parseOutboundNumbers(
      initialData?.callCenter?.outbound_phone_number
    ),
    primary_outbound_phone_number:
      initialData?.callCenter?.primary_outbound_phone_number || "",
    waiting_in_line: initialData?.callCenter?.waiting_in_line || "5",
    playback_during_paused:
      initialData?.callCenter?.playback_during_paused || "default",
    playback: initialData?.callCenter?.playback || "",
    // So "Choose specific playback" shows the current file when editing (Select uses fileUrl as value)
    specific_playback_selection: initialData?.callCenter?.playback || "",
  };

  const methods = useForm({
    resolver: zodResolver(userFormSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    setValue,
    formState: { errors },
    watch,
  } = methods;

  const selectedDepartments = watch("departments");

  // When opening edit (initialData set), sync playback fields so "Choose specific playback" shows current file
  useEffect(() => {
    if (!initialData?.callCenter) return;
    const playbackUrl = initialData.callCenter.playback || "";
    setValue("playback", playbackUrl);
    setValue("specific_playback_selection", playbackUrl);
  }, [initialData?._id, initialData?.callCenter?.playback, setValue]);

  // Fetch phone numbers based on selected departments
  // Fetch phone numbers based on selected departments using the new hook
  const { data: phoneNumbersData } = usePhoneNumbersWithDepartments(selectedDepartments);

  const availablePhoneNumbers = phoneNumbersData?.data || [];
  const availableAudioFiles = Array.isArray(audioFilesData)
    ? audioFilesData
    : (audioFilesData?.data || []);
  const departments = departmentsData?.data || [];

  const onSubmitForm = (data) => {
    console.log('[UserForm] Form submitted with data:', data);
    
    // Logic: If 'choose' -> use selected file URL; if 'default' -> use the default audio file's URL (PBX needs actual URL, not "default" string)
    let finalPlayback = "default";
    if (data.playback_during_paused === "choose") {
      finalPlayback = data.specific_playback_selection || data.playback;
    } else if (data.playback_during_paused === "default") {
      const defaultAudio = availableAudioFiles.find((f) => f.isDefault || f.is_default);
      finalPlayback = defaultAudio?.fileUrl ?? defaultAudio?.url ?? "default";
    } else {
      finalPlayback = data.playback_during_paused;
    }

    const submitData = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || "",
      departments: data.departments,
      permissions: initialData?.permissions || {
        canCreateUsers: false,
        canDeleteUsers: false,
      },
      preferences: initialData?.preferences || {
        theme: "light",
        language: "en",
        notifications: { email: true, desktop: true, sound: true },
      },
      ...(data.password ? { password: data.password } : {}),

      chat: {
        chat_feature: data.chat_feature,
        role_in_chat_feature:
          data.chat_feature === "on" ? data.role_in_chat_feature : undefined,
      },
      callCenter: {
        call_center: data.call_center,
        inbound_calls: data.inbound_calls,
        outbound_calls: data.outbound_calls,
        outbound_phone_number: data.outbound_phone_number,
        primary_outbound_phone_number: data.primary_outbound_phone_number,
        role_in_call_center: data.role_in_call_center,
        call_access: data.call_access,
        recording_downloads: data.recording_downloads === "yes", // Convert back to boolean
        waiting_in_line: data.waiting_in_line,
        playback_during_paused: data.playback_during_paused,
        playback: finalPlayback,
      },
    };

    console.log('[UserForm] Calling onSubmit with submitData:', submitData);
    onSubmit(submitData);
  };

  if (!loadingDepartments && departments.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No departments found.</AlertDescription>
      </Alert>
    );
  }

  // --- Tab Error Checkers ---
  const basicErrors =
    errors.firstName ||
    errors.lastName ||
    errors.email ||
    errors.phone ||
    errors.password ||
    errors.confirmPassword ||
    errors.departments;
  const chatErrors = errors.chat_feature || errors.role_in_chat_feature;
  const callErrors =
    errors.call_center ||
    errors.inbound_calls ||
    errors.outbound_calls ||
    errors.role_in_call_center ||
    errors.call_access ||
    errors.recording_downloads ||
    errors.outbound_phone_number ||
    errors.primary_outbound_phone_number ||
    errors.waiting_in_line ||
    errors.playback_during_paused ||
    errors.playback;

  const handleFormSubmit = handleSubmit(
    (data) => {
      console.log('[UserForm] Form submit event triggered, calling onSubmitForm');
      onSubmitForm(data);
    },
    (errors) => {
      console.log('[UserForm] Form validation errors:', errors);
    }
  );

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleFormSubmit}
        className="space-y-6 w-full max-w-4xl mx-auto"
        autoComplete="off"
      >
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3 gap-3 px-2">
            <TabsTrigger
              value="basic"
              className={`data-[state=active]:bg-white data-[state=active]:shadow-sm relative ${ACTIVE_TAB_CLASSES.trigger}`}
            >
              <User className="h-4 w-4 mr-2" /> Basic Info
              {basicErrors && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="chat"
              className={`data-[state=active]:bg-white data-[state=active]:shadow-sm relative ${ACTIVE_TAB_CLASSES.trigger}`}
            >
              <MessageSquare className="h-4 w-4 mr-2" /> Chat Settings
              {chatErrors && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </TabsTrigger>
            <TabsTrigger
              value="call"
              className={`data-[state=active]:bg-white data-[state=active]:shadow-sm relative ${ACTIVE_TAB_CLASSES.trigger}`}
            >
              <Phone className="h-4 w-4 mr-2" /> Call Settings
              {callErrors && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="basic"
            className="space-y-6 mt-0 bg-card p-6 rounded-lg shadow-sm border border-border !flex-none"
          >
            <BasicInfoTab departments={departments} initialData={initialData} />
          </TabsContent>

          <TabsContent
            value="chat"
            className="space-y-6 mt-0 bg-card p-6 rounded-lg shadow-sm border border-border !flex-none"
          >
            <ChatSettingsTab />
          </TabsContent>

          <TabsContent
            value="call"
            className="space-y-6 mt-0 bg-card p-6 rounded-lg shadow-sm border border-border !flex-none"
          >
            <CallSettingsTab
              phoneNumbers={availablePhoneNumbers}
              audioFiles={availableAudioFiles}
              uploadMutation={uploadAudioMutation}
            />
          </TabsContent>
        </Tabs>

        <div className="flex gap-2 pt-6 border-t mt-8">
          <Button
            type="submit"
            disabled={isSubmittingParent || uploadAudioMutation.isPending}
            className="active:scale-[0.98] transition-transform w-[140px]"
          >
            {isSubmittingParent || uploadAudioMutation.isPending
              ? "Saving..."
              : initialData
                ? "Update User"
                : "Create User"}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="active:scale-[0.98] transition-transform w-[100px]"
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
