"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/shared/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowLeft,
  Mail,
  Phone,
  User,
  Calendar,
  Loader2,
  Edit,
  MessageSquare,
  Building2,
  Tag,
  FileText,
  Info,
  Activity,
  Search,
  Copy,
  Check,
  Plus,
  Trash2,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
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
import PhoneNumberDisplay from "@/components/shared/PhoneNumberDisplay";
import DeleteButton from "@/components/shared/DeleteButton";
import CustomFieldsDialog from "@/components/modals/CustomFieldsDialog";
import { ACTIVE_TAB_CLASSES } from "@/constants/ui";

// Extracted outside to prevent re-creation on every render
function DetailsSubTabs({
  details,
  formatFieldName,
  formatFieldValue,
  cardVariants,
  itemVariants,
  isContactTypeKey,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const { sections, generalFields, allFieldsFlat } = useMemo(() => {
    const sections = {};
    const generalFields = [];
    const allFieldsFlat = [];

    Object.entries(details).forEach(([key, value]) => {
      const isNestedObject =
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length > 0;

      if (isNestedObject) {
        const entries = Object.entries(value).filter(([k]) => !isContactTypeKey(k));
        if (entries.length > 0) sections[key] = entries;
        entries.forEach(([k, v]) => allFieldsFlat.push([`${key} — ${k}`, v]));
      } else {
        generalFields.push([key, value]);
        allFieldsFlat.push([key, value]);
      }
    });

    return { sections, generalFields, allFieldsFlat };
  }, [details, isContactTypeKey]);

  const filterFields = (fields) => {
    if (!searchQuery) return fields;
    const query = searchQuery.toLowerCase();
    return fields.filter(
      ([key, value]) =>
        formatFieldName(key).toLowerCase().includes(query) ||
        formatFieldValue(value).toLowerCase().includes(query)
    );
  };

  const visibleTabs = useMemo(() => {
    const tabs = ["all"];
    if (generalFields.length > 0) tabs.push("general");
    Object.keys(sections).forEach((sectionKey) => tabs.push(sectionKey));
    return tabs;
  }, [sections, generalFields]);

  const [activeSubTab, setActiveSubTab] = useState("all");

  useEffect(() => {
    if (!visibleTabs.includes(activeSubTab)) {
      setActiveSubTab(visibleTabs[0] || "all");
    }
  }, [visibleTabs, activeSubTab]);

  const getActiveFields = () => {
    if (activeSubTab === "all") return allFieldsFlat;
    if (activeSubTab === "general") return generalFields;
    return sections[activeSubTab] || [];
  };

  const activeFields = filterFields(getActiveFields());

  const getCategoryCount = (category) => {
    if (category === "all") return allFieldsFlat.length;
    if (category === "general") return generalFields.length;
    return sections[category]?.length || 0;
  };

  const getTabLabel = (category) => {
    if (category === "all") return "All";
    if (category === "general") return "General";
    return category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <motion.div variants={cardVariants} initial="hidden" animate="visible">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Additional details
          </h3>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
            <Input
              type="text"
              placeholder="Search fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 text-sm pl-10"
            />
          </div>
        </div>

        <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
          <div className="overflow-x-auto pb-2 mb-4">
            <TabsList className="inline-flex w-max min-w-full h-auto gap-1 flex-wrap">
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="text-xs py-2 px-3 shrink-0">
                  {getTabLabel(tab)} ({getCategoryCount(tab)})
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value={activeSubTab} className="mt-0">
            {activeFields.length > 0 ? (
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {activeFields.map(([key, value], index) => (
                  <motion.div
                    key={key}
                    variants={itemVariants}
                    custom={index}
                    initial="hidden"
                    animate="visible"
                    className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-3 px-4 rounded-lg bg-gray-50/60 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800/80 hover:bg-gray-100/70 dark:hover:bg-gray-800/40 transition-colors motion-reduce:transition-none"
                  >
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400 shrink-0 sm:w-[200px]">
                      {formatFieldName(key)}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100 break-words leading-relaxed min-w-0 whitespace-pre-line">
                      {formatFieldValue(value)}
                    </span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <div className="text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">
                    {searchQuery
                      ? "No fields match your search"
                      : "No fields in this category"}
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </motion.div>
  );
}

export default function ContactDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const contactId = params.contactId;

  const [deletingContact, setDeletingContact] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [copiedLink, setCopiedLink] = useState(false);
  const [isCustomFieldsOpen, setIsCustomFieldsOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [deletingField, setDeletingField] = useState(null);
  const [deleteApplyToAll, setDeleteApplyToAll] = useState(false);
  const queryClient = useQueryClient();

  const { data: contact, isLoading, isError: isContactError, error: contactError, refetch: refetchContact } = useQuery({
    queryKey: ["contact", contactId],
    queryFn: async () => {
      const response = await fetch(`/api/contacts/${contactId}`);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch contact details");
      }

      return result.data;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleDelete = async () => {
    if (!contact) return;

    try {
      setIsDeleting(true);
      const response = await fetch(`/api/contacts/${contact._id}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Contact deleted successfully");
        router.push("/c/contacts");
      } else {
        toast.error(result.error || "Failed to delete contact");
      }
    } catch {
      toast.error("Failed to delete contact");
    } finally {
      setIsDeleting(false);
      setDeletingContact(false);
    }
  };

  // Convert details Map to object if needed
  const details =
    contact?.details instanceof Map
      ? Object.fromEntries(contact.details)
      : contact?.details || {};

  // Convert metadata Map to object if needed and merge with details
  const metadata =
    contact?.metadata instanceof Map
      ? Object.fromEntries(contact.metadata)
      : contact?.metadata || {};

  // Keys that map to schema Contact_Type — do not show as separate detail rows
  const CONTACT_TYPE_DETAIL_KEYS = ["Contact Type", "Contact_Type", "ContactType", "contact_type", "contactType"];

  const isContactTypeKey = (key) =>
    CONTACT_TYPE_DETAIL_KEYS.some((k) => key === k || key.toLowerCase().replace(/\s+/g, "_") === k.toLowerCase());

  // Merge metadata into details for display, then remove Contact Type variants (use schema Contact_Type only)
  const allDetailsRaw = { ...details, ...metadata };
  const allDetails = Object.fromEntries(
    Object.entries(allDetailsRaw).filter(([key]) => !isContactTypeKey(key))
  );

  // Helper function to format field names (convert underscores to spaces, capitalize)
  const formatFieldName = (key) => {
    return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Format ISO date-time (e.g. 2026-02-10T22:09:10.848Z) as human-readable
  const formatDateTime = (v) => {
    try {
      const d = v instanceof Date ? v : new Date(v);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return null;
    }
  };

  // Parse run-on strings like "Key: Value. Key2: Value2" or "key=val&key2=val2" into lines
  const parseRunOnString = (s) => {
    const trimmed = String(s).trim();
    if (!trimmed) return null;
    // Query string style: key=value&key2=value2
    if (trimmed.includes("=") && (trimmed.includes("&") || trimmed.includes("."))) {
      const pairs = trimmed.split(/[&]/).map((part) => {
        const eq = part.indexOf("=");
        if (eq === -1) return null;
        const k = part.slice(0, eq).trim().replace(/_/g, " ");
        const v = part.slice(eq + 1).trim();
        if (!k) return null;
        const cap = k.replace(/\b\w/g, (l) => l.toUpperCase());
        return `${cap}: ${v}`;
      });
      const filtered = pairs.filter(Boolean);
      if (filtered.length > 0) return filtered.join("\n");
    }
    // Sentence style: "Key: Value. Key2: Value2"
    if (trimmed.includes(". ")) {
      const parts = trimmed.split(/\.\s+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) return parts.join("\n");
    }
    return null;
  };

  // Format a single value for human-readable display (no raw JSON)
  const formatSingleValue = (v) => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "boolean") return v ? "Yes" : "No";
    if (typeof v === "number") return String(v);
    // ISO date-time (e.g. 2026-02-10T22:09:10.848Z)
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v.trim())) {
      const formatted = formatDateTime(v);
      if (formatted) return formatted;
    }
    if (v instanceof Date || (typeof v === "string" && !isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}/.test(v))) {
      const formatted = formatDateTime(v);
      if (formatted) return formatted;
      return String(v);
    }
    if (typeof v === "object") return formatComplexValue(v);
    const s = String(v).trim();
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        return formatComplexValue(parsed);
      } catch {
        const parsed = parseRunOnString(s);
        return parsed || s || "—";
      }
    }
    const parsed = parseRunOnString(s);
    return parsed || s || "—";
  };

  // Human-readable format for objects/arrays — one pair per line where useful
  const formatComplexValue = (value) => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) {
      const parts = value.map((item) =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? Object.entries(item)
              .map(([k, v]) => `${formatFieldName(k)}: ${formatSingleValue(v)}`)
              .join(", ")
          : formatSingleValue(item)
      );
      return parts.length ? parts.join("\n") : "—";
    }
    if (typeof value === "object") {
      const pairs = Object.entries(value)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${formatFieldName(k)}: ${formatSingleValue(v)}`);
      return pairs.length ? pairs.join("\n") : "N/A";
    }
    return String(value).trim() || "N/A";
  };

  const formatFieldValue = (value) => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object") return formatComplexValue(value);
    const s = String(value).trim();
    if (!s) return "N/A";
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return formatComplexValue(JSON.parse(s));
      } catch {
        const parsed = parseRunOnString(s);
        return parsed ?? s;
      }
    }
    const parsed = parseRunOnString(s);
    return parsed ?? s;
  };

  // Reduced motion support
  const prefersReducedMotion = useReducedMotion();

  // Animation variants — disabled when user prefers reduced motion
  const cardVariants = prefersReducedMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
      };

  const itemVariants = prefersReducedMotion
    ? { hidden: { opacity: 1 }, visible: () => ({ opacity: 1 }) }
    : {
        hidden: { opacity: 0, x: -10 },
        visible: (i) => ({
          opacity: 1,
          x: 0,
          transition: { delay: i * 0.05, duration: 0.2 },
        }),
      };

  const getStatusColor = (status) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case "inactive":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-label="Loading contact">
        <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-gray-400" aria-hidden="true" />
        <span className="sr-only">Loading contact details...</span>
      </div>
    );
  }

  if (isContactError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <User className="h-7 w-7 text-destructive" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Failed to load contact</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {contactError?.message || 'Unable to fetch contact details. Please try again.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetchContact()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!contact) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push("/c/contacts")}
              className="gap-2 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Contacts</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
              Contact Details
            </h1>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <DeleteButton onClick={() => setDeletingContact(true)} />
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:col-span-1"
          >
            <Card className="lg:sticky lg:top-6 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-center">
                  <Avatar className="h-28 w-28 ring-4 ring-primary/20">
                    <AvatarImage src={contact.avatar} />
                    <AvatarFallback className="text-4xl font-bold bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white">
                      {(
                        contact.firstName?.[0] ||
                        contact.name?.[0] ||
                        "?"
                      ).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {contact.firstName && contact.lastName
                      ? `${contact.firstName} ${contact.lastName}`
                      : contact.name || "Unknown"}
                  </h2>

                  {contact.email && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {contact.email}
                    </p>
                  )}
                  {contact.Contact_Type && (
                    <Badge variant="outline" className="mt-2">
                      {contact.Contact_Type}
                    </Badge>
                  )}
                </div>

                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex justify-center flex-wrap gap-2">
                    {contact.tags.map((tag, index) => (
                      <Badge key={index} className={getStatusColor(tag)}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="space-y-3 pt-4 border-t">
                  {contact.email && (
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 truncate">
                        {contact.email}
                      </span>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                      <PhoneNumberDisplay phone={contact.phone} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Details Card with Tabs */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="lg:col-span-2"
          >
            <Card className="shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle>Contact Information</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={activeTab}
                  onValueChange={setActiveTab}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger
                      value="overview"
                      className={`flex items-center gap-1.5 text-xs sm:text-sm ${ACTIVE_TAB_CLASSES.trigger}`}
                    >
                      <Info className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Overview</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="details"
                      className={`flex items-center gap-1.5 text-xs sm:text-sm ${ACTIVE_TAB_CLASSES.trigger}`}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Details</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="custom"
                      className={`flex items-center gap-1.5 text-xs sm:text-sm ${ACTIVE_TAB_CLASSES.trigger}`}
                    >
                      <Settings className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Custom Fields</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="activity"
                      className={`flex items-center gap-1.5 text-xs sm:text-sm ${ACTIVE_TAB_CLASSES.trigger}`}
                    >
                      <Activity className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Activity</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Overview Tab */}
                  <TabsContent value="overview" className="space-y-6 mt-6">
                    {/* Basic Info */}
                    <motion.div
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Basic information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {contact.firstName && (
                          <motion.div
                            variants={itemVariants}
                            custom={0}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              First Name
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.firstName}
                            </p>
                          </motion.div>
                        )}
                        {contact.lastName && (
                          <motion.div
                            variants={itemVariants}
                            custom={1}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Last Name
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.lastName}
                            </p>
                          </motion.div>
                        )}
                        {contact.displayName && (
                          <motion.div
                            variants={itemVariants}
                            custom={2}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Display Name
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.displayName}
                            </p>
                          </motion.div>
                        )}
                        <motion.div
                          variants={itemVariants}
                          custom={3}
                          initial="hidden"
                          animate="visible"
                        >
                          <label className="text-sm text-gray-600 dark:text-gray-400">
                            Full Name
                          </label>
                          <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                            {contact.name || "-"}
                          </p>
                        </motion.div>
                        <motion.div
                          variants={itemVariants}
                          custom={4}
                          initial="hidden"
                          animate="visible"
                        >
                          <label className="text-sm text-gray-600 dark:text-gray-400">
                            Email Address
                          </label>
                          <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                            {contact.email || "-"}
                          </p>
                        </motion.div>
                        <motion.div
                          variants={itemVariants}
                          custom={5}
                          initial="hidden"
                          animate="visible"
                        >
                          <label className="text-sm text-gray-600 dark:text-gray-400">
                            Phone Number
                          </label>
                          <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                            <PhoneNumberDisplay phone={contact.phone} />
                          </p>
                        </motion.div>
                        {contact.Salutation && (
                          <motion.div
                            variants={itemVariants}
                            custom={6}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Salutation
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.Salutation}
                            </p>
                          </motion.div>
                        )}
                        {contact.Contact_Type && (
                          <motion.div
                            variants={itemVariants}
                            custom={7}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                              <Tag className="h-3.5 w-3.5" />
                              Contact Type
                            </label>
                            <Badge variant="outline" className="mt-1">
                              {contact.Contact_Type}
                            </Badge>
                          </motion.div>
                        )}
                        <motion.div
                          variants={itemVariants}
                          custom={8}
                          initial="hidden"
                          animate="visible"
                        >
                          <label className="text-sm text-gray-600 dark:text-gray-400">
                            Status
                          </label>
                          <div className="mt-1 ml-2">
                            <StatusBadge isActive={contact.Is_Active !== false} />
                          </div>
                        </motion.div>
                        {contact.SF_id && (
                          <motion.div
                            variants={itemVariants}
                            custom={9}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5" />
                              Salesforce ID
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1 font-mono">
                              {contact.SF_id}
                            </p>
                          </motion.div>
                        )}
                        {contact.company && (
                          <motion.div
                            variants={itemVariants}
                            custom={10}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5" />
                              Company
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.company}
                            </p>
                          </motion.div>
                        )}
                        {contact.jobTitle && (
                          <motion.div
                            variants={itemVariants}
                            custom={11}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Job Title
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.jobTitle}
                            </p>
                          </motion.div>
                        )}
                        {contact.timezone && (
                          <motion.div
                            variants={itemVariants}
                            custom={12}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Timezone
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.timezone}
                            </p>
                          </motion.div>
                        )}
                        {contact.language && (
                          <motion.div
                            variants={itemVariants}
                            custom={13}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Language
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.language}
                            </p>
                          </motion.div>
                        )}
                        {contact.webchatLink && (
                          <motion.div
                            variants={itemVariants}
                            custom={14}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              WebChat Link
                            </label>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-base font-medium text-gray-900 dark:text-white break-all flex-1">
                                <a
                                  href={contact.webchatLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  {contact.webchatLink}
                                </a>
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(
                                      contact.webchatLink
                                    );
                                    setCopiedLink(true);
                                    setTimeout(
                                      () => setCopiedLink(false),
                                      2000
                                    );
                                    toast.success("Link copied to clipboard!");
                                  } catch (error) {
                                    toast.error("Failed to copy link");
                                  }
                                }}
                                className="h-8 w-8 min-h-[44px] min-w-[44px] p-0"
                                aria-label={copiedLink ? "Link copied" : "Copy webchat link"}
                              >
                                {copiedLink ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </motion.div>
                        )}
                        {contact.updatedAt && (
                          <motion.div
                            variants={itemVariants}
                            custom={16}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Updated Date
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {new Date(contact.updatedAt).toLocaleString()}
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>

                    {/* Activity & Statistics */}
                    <motion.div
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Activity & Statistics
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {contact.lastInteraction && (
                          <motion.div
                            variants={itemVariants}
                            custom={0}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Last Interaction
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {new Date(
                                contact.lastInteraction
                              ).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDistanceToNow(
                                new Date(contact.lastInteraction),
                                { addSuffix: true }
                              )}
                            </p>
                          </motion.div>
                        )}
                        {contact.conversationCount !== undefined && (
                          <motion.div
                            variants={itemVariants}
                            custom={1}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                              <MessageSquare className="h-3.5 w-3.5" />
                              Conversation Count
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.conversationCount || 0}
                            </p>
                          </motion.div>
                        )}
                        {contact.messageCount !== undefined && (
                          <motion.div
                            variants={itemVariants}
                            custom={2}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Message Count
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {contact.messageCount || 0}
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>

                    {/* Block Status */}
                    {contact.blocked && (
                      <motion.div
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 p-5"
                      >
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-4 flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          Block Status
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <motion.div
                            variants={itemVariants}
                            custom={0}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Blocked
                            </label>
                            <Badge variant="destructive" className="mt-1">
                              Yes
                            </Badge>
                          </motion.div>
                          {contact.blockedAt && (
                            <motion.div
                              variants={itemVariants}
                              custom={1}
                              initial="hidden"
                              animate="visible"
                            >
                              <label className="text-sm text-gray-600 dark:text-gray-400">
                                Blocked At
                              </label>
                              <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                                {new Date(contact.blockedAt).toLocaleString()}
                              </p>
                            </motion.div>
                          )}
                          {contact.blockedBy && (
                            <motion.div
                              variants={itemVariants}
                              custom={2}
                              initial="hidden"
                              animate="visible"
                            >
                              <label className="text-sm text-gray-600 dark:text-gray-400">
                                Blocked By
                              </label>
                              <p className="text-sm font-medium text-gray-900 dark:text-white mt-1 font-mono">
                                {typeof contact.blockedBy === "object" &&
                                contact.blockedBy.name
                                  ? contact.blockedBy.name
                                  : String(contact.blockedBy)}
                              </p>
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* Merge Tracking */}
                    {contact.mergedFrom && contact.mergedFrom.length > 0 && (
                      <motion.div
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
                      >
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                          <Info className="h-4 w-4" />
                          Merged From
                        </h3>
                        <div className="space-y-2">
                          {contact.mergedFrom.map((mergedId, index) => (
                            <Badge
                              key={index}
                              variant="outline"
                              className="mr-2"
                            >
                              {String(mergedId)}
                            </Badge>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* System Information */}
                    <motion.div
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        System Information
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {contact.createdBy && (
                          <motion.div
                            variants={itemVariants}
                            custom={0}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Created By
                            </label>
                            <p className="text-sm font-medium text-gray-900 dark:text-white mt-1 font-mono">
                              {typeof contact.createdBy === "object" &&
                              contact.createdBy.name
                                ? contact.createdBy.name
                                : String(contact.createdBy)}
                            </p>
                          </motion.div>
                        )}
                        {contact.createdAt && (
                          <motion.div
                            variants={itemVariants}
                            custom={1}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Created At
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {new Date(contact.createdAt).toLocaleString()}
                            </p>
                          </motion.div>
                        )}
                        {contact.updatedAt && (
                          <motion.div
                            variants={itemVariants}
                            custom={2}
                            initial="hidden"
                            animate="visible"
                          >
                            <label className="text-sm text-gray-600 dark:text-gray-400">
                              Updated At
                            </label>
                            <p className="text-base font-medium text-gray-900 dark:text-white mt-1">
                              {new Date(contact.updatedAt).toLocaleString()}
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </motion.div>

                    {/* Tags */}
                    {contact.tags && contact.tags.length > 0 && (
                      <motion.div
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
                      >
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                          <Tag className="h-4 w-4" />
                          Tags
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {contact.tags.map((tag, index) => (
                            <Badge key={index} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </TabsContent>

                  {/* Details Tab */}
                  <TabsContent value="details" className="space-y-4 mt-6">
                    {Object.keys(allDetails).length > 0 ? (
                      <DetailsSubTabs
                        details={allDetails}
                        formatFieldName={formatFieldName}
                        formatFieldValue={formatFieldValue}
                        cardVariants={cardVariants}
                        itemVariants={itemVariants}
                        isContactTypeKey={isContactTypeKey}
                      />
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center py-12 text-gray-500"
                      >
                        <div className="text-center">
                          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                          <p className="text-sm">
                            No additional details available
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </TabsContent>

                  {/* Custom Fields Tab */}
                  <TabsContent value="custom" className="space-y-4 mt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        CUSTOM FIELDS
                      </h3>
                    </div>

                    {contact?.customFields &&
                    Object.keys(contact.customFields).length > 0 ? (
                      <div className="space-y-4">
                        {Object.entries(contact.customFields).map(
                          ([fieldId, field]) => (
                            <motion.div
                              key={fieldId}
                              variants={cardVariants}
                              initial="hidden"
                              animate="visible"
                              className="border rounded-lg p-4"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <h4 className="font-medium text-gray-900 dark:text-white">
                                      {field.name}
                                    </h4>
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {field.type === "dropdown"
                                        ? "Dropdown"
                                        : "Text Input"}
                                    </Badge>
                                  </div>

                                  {field.type === "dropdown" ? (
                                    <div className="space-y-2">
                                      <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Selected:{" "}
                                        {field.options?.find(
                                          (opt) => opt.value === field.value
                                        )?.label ||
                                          field.value ||
                                          "-"}
                                      </p>
                                      {field.options &&
                                        field.options.length > 0 && (
                                          <div className="text-xs text-gray-500">
                                            Options:{" "}
                                            {field.options
                                              .map((opt) => opt.label)
                                              .join(", ")}
                                          </div>
                                        )}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {field.value || "-"}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-h-[44px] min-w-[44px]"
                                    aria-label={`Edit custom field ${field.name}`}
                                    onClick={() => {
                                      setEditingField({
                                        id: fieldId,
                                        ...field,
                                      });
                                      setIsCustomFieldsOpen(true);
                                    }}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-h-[44px] min-w-[44px]"
                                    aria-label={`Delete custom field ${field.name}`}
                                    onClick={() =>
                                      setDeletingField({
                                        id: fieldId,
                                        ...field,
                                      })
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )
                        )}
                      </div>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center justify-center py-12 text-gray-500"
                      >
                        <div className="text-center">
                          <Settings className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                          <p className="text-sm mb-4">No custom fields yet</p>
                          <p className="text-xs text-gray-400 mb-4">
                            Use the &quot;Add Custom Field&quot; button below to
                            create custom fields
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </TabsContent>

                  {/* Activity Tab */}
                  <TabsContent value="activity" className="space-y-4 mt-6">
                    <motion.div
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      className="rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Activity Timeline
                      </h3>
                      <div className="space-y-4">
                        {contact.lastInteraction && (
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center">
                              <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                              <div className="h-full w-px bg-gray-200 dark:bg-gray-700 mt-2" />
                            </div>
                            <div className="flex-1 pb-4">
                              <p className="text-sm font-medium">
                                Last Interaction
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatDistanceToNow(
                                  new Date(contact.lastInteraction),
                                  { addSuffix: true }
                                )}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(
                                  contact.lastInteraction
                                ).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )}
                        {contact.createdAt && (
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center">
                              <div className="h-2 w-2 rounded-full bg-gray-400 mt-1.5" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                Contact Created
                              </p>
                              <p className="text-xs text-gray-500">
                                {formatDistanceToNow(
                                  new Date(contact.createdAt),
                                  { addSuffix: true }
                                )}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(contact.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Add Custom Field Button - Outside Contact Information Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="w-full"
        >
          <Card className="shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Custom Fields
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Add custom fields to store additional information for this
                    contact
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setEditingField(null);
                    setIsCustomFieldsOpen(true);
                  }}
                  className="transition-all duration-200 hover:scale-105 shrink-0"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Custom Field
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deletingContact}
        onOpenChange={(open) => !open && setDeletingContact(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
              Are you sure you want to delete <strong>{contact?.name}</strong>?
              This action cannot be undone.
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
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
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

      {/* Custom Fields Dialog */}
      <CustomFieldsDialog
        isOpen={isCustomFieldsOpen}
        onClose={() => {
          setIsCustomFieldsOpen(false);
          setEditingField(null);
        }}
        contactId={contactId}
        existingFields={contact?.customFields || {}}
        editingField={editingField}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
          setEditingField(null);
        }}
      />

      {/* Delete Custom Field Dialog */}
      <AlertDialog
        open={!!deletingField}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingField(null);
            setDeleteApplyToAll(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Field?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                Are you sure you want to delete the custom field{" "}
                <strong>{deletingField?.name}</strong>?
              </p>
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="deleteApplyToAll"
                  checked={deleteApplyToAll}
                  onChange={(e) => setDeleteApplyToAll(e.target.checked)}
                  className="rounded"
                />
                <label
                  htmlFor="deleteApplyToAll"
                  className="text-sm cursor-pointer"
                >
                  Delete from all contacts with Contact_Type ={" "}
                  {contact?.Contact_Type || "same type"}
                </label>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletingField) return;

                try {
                  const url = `/api/contacts/${contactId}/custom-fields/${
                    deletingField.id
                  }?applyToAll=${deleteApplyToAll}&contactType=${
                    contact?.Contact_Type || ""
                  }`;
                  const response = await fetch(url, { method: "DELETE" });
                  const result = await response.json();

                  if (result.success) {
                    toast.success("Custom field deleted successfully");
                    queryClient.invalidateQueries({
                      queryKey: ["contact", contactId],
                    });
                    setDeletingField(null);
                    setDeleteApplyToAll(false);
                  } else {
                    toast.error(
                      result.error || "Failed to delete custom field"
                    );
                  }
                } catch {
                  toast.error("Failed to delete custom field");
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
