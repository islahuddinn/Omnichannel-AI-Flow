// src/app/c/admin/message-logs/page.js
"use client";

import { useState, useEffect } from "react";
import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfToday,
  formatISO,
  parseISO,
} from "date-fns";
import {
  FileText,
  Filter,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Send,
  MessageSquare,
  Mail,
  Phone,
  MessageCircle,
  RefreshCw,
  CalendarIcon,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/api/client";
import { toast } from "sonner";
import Pagination from "@/components/shared/Pagination";

import PhoneNumberDisplay from "@/components/shared/PhoneNumberDisplay";
import { ACTIVE_TAB_CLASSES } from "@/constants/ui";

const EVENT_TYPE_COLORS = {
  created: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  queued: "bg-muted text-muted-foreground",
  sending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", // ✅ Changed from green to blue
  delivered:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  read: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  failed: "bg-destructive/10 text-destructive",
  resend:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  status_updated:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  error: "bg-destructive/10 text-destructive",
  webhook_received:
    "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  api_call: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  api_response:
    "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  // ✅ Incoming message events
  received: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  inbound: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
};

const CHANNEL_ICONS = {
  whatsapp: MessageSquare,
  sms: Phone,
  email: Mail,
  facebook: MessageCircle,
  instagram: MessageCircle,
  webchat: MessageCircle,
};

export default function MessageLogsPage() {
  // ✅ Set default date range to last 7 days to show more logs
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const todayStr = formatISO(startOfToday()).split("T")[0];
  const sevenDaysAgoStr = formatISO(sevenDaysAgo).split("T")[0];

  const [filters, setFilters] = useState({
    messageId: "",
    conversationId: "",
    contactName: "",
    channel: "all",
    eventType: "all",
    status: "all",
    logType: "all",
    startDate: sevenDaysAgoStr,
    endDate: todayStr,
  });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isStartDateOpen, setIsStartDateOpen] = useState(false);
  const [isEndDateOpen, setIsEndDateOpen] = useState(false);

  // Count active filters (excluding defaults)
  const activeFilterCount = [
    filters.messageId,
    filters.conversationId,
    filters.contactName,
    filters.channel !== 'all' ? filters.channel : '',
    filters.eventType !== 'all' ? filters.eventType : '',
    filters.status !== 'all' ? filters.status : '',
  ].filter(Boolean).length;

  // toggleExpandAll and exportCSV are defined after useQuery below

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["message-logs", filters, page, limit],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      // ✅ Only add non-empty, non-'all' filters
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== "" && value !== "all") {
          // ✅ For dates, send as ISO strings with timezone
          if (key === "startDate" || key === "endDate") {
            // ✅ Handle both YYYY-MM-DD format and ISO strings
            let dateObj;
            if (value.includes("T")) {
              // Already an ISO string
              dateObj = new Date(value);
            } else {
              // YYYY-MM-DD format - parse as UTC date (treat as calendar date)
              const [year, month, day] = value.split("-").map(Number);
              dateObj = new Date(Date.UTC(year, month - 1, day));
            }

            if (key === "startDate") {
              // Set to start of day in UTC (00:00:00.000)
              dateObj.setUTCHours(0, 0, 0, 0);
            } else {
              // Set to end of day in UTC (23:59:59.999)
              dateObj.setUTCHours(23, 59, 59, 999);
            }
            params.append(key, dateObj.toISOString());
          } else {
            params.append(key, value);
          }
        }
      });

      const response = await apiClient.get(`/admin/logs?${params}`);
      return response;
    },
  });

  // Derived data — must be after useQuery
  const logs = data?.data?.logs || [];
  const pagination = data?.data?.pagination || {};

  // Expand/collapse all rows
  const toggleExpandAll = () => {
    if (expandedRows.size > 0) {
      setExpandedRows(new Set());
    } else {
      const allIds = new Set(logs.map((_, i) => i));
      setExpandedRows(allIds);
    }
  };

  // Export logs to CSV
  const exportCSV = () => {
    if (!logs.length) return;
    const headers = ['Time', 'Contact', 'Channel', 'Event', 'Status', 'Description', 'Message ID'];
    const rows = logs.map(log => [
      log.createdAt ? new Date(log.createdAt).toISOString() : '',
      log.contactId?.name || log.data?.contactName || '',
      log.channel || '',
      log.eventType || '',
      log.status || '',
      log.message || '',
      log.messageId?._id || log.messageId || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exported to CSV');
  };

  const toggleRow = (logId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedRows(newExpanded);
  };

  const getChannelIcon = (channel) => {
    const Icon = CHANNEL_ICONS[channel] || MessageSquare;
    return <Icon className="h-4 w-4" />;
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case "success":
      case "sent":
      case "delivered":
      case "read":
        return (
          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        );
      case "error":
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "warning":
        return (
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        );
      case "pending":
      case "sending":
      case "queued":
        return (
          <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        );
      case "info":
      default:
        return (
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        );
    }
  };

  // Helper function to format log details in user-friendly way
  const renderLogDetails = (log) => {
    const sections = [];

    // Details Section - Include ALL available information
    if (
      log.details ||
      log.eventType ||
      log.channel ||
      log.status ||
      log.previousStatus ||
      log.triggeredBy ||
      log.createdAt
    ) {
      const detailItems = [];

      // Basic event information
      if (log.eventType) {
        detailItems.push({ label: "Event Type", value: log.eventType });
      }
      if (log.status) {
        detailItems.push({ label: "Current Status", value: log.status });
      }
      if (log.previousStatus) {
        detailItems.push({
          label: "Previous Status",
          value: log.previousStatus,
        });
      }
      if (log.channel) {
        detailItems.push({ label: "Channel", value: log.channel });
      }
      if (log.direction) {
        detailItems.push({ label: "Direction", value: log.direction });
      }
      if (log.triggeredBy) {
        detailItems.push({ label: "Triggered By", value: log.triggeredBy });
      }
      if (log.createdAt) {
        detailItems.push({
          label: "Created At",
          value: format(new Date(log.createdAt), "MMM dd, yyyy hh:mm:ss a"),
        });
      }

      // Details from log.details object
      if (log.details) {
        if (log.details.channelType) {
          detailItems.push({
            label: "Channel Type",
            value: log.details.channelType,
          });
        }
        if (log.details.channelAccountId) {
          detailItems.push({
            label: "Account ID",
            value: log.details.channelAccountId,
          });
        }
        if (log.details.channelAccountName) {
          detailItems.push({
            label: "Account Name",
            value: log.details.channelAccountName,
          });
        }
        if (log.details.contactId) {
          detailItems.push({
            label: "Contact ID",
            value: log.details.contactId,
          });
        }
        if (log.details.contactName) {
          detailItems.push({
            label: "Contact Name",
            value: log.details.contactName,
          });
        }
        if (log.details.targetPhone || log.details.targetIdentifier) {
          const recipientValue =
            log.details.targetPhone || log.details.targetIdentifier;
          // ✅ Check if it's a phone number (contains digits and possibly +)
          const isPhoneNumber = /^[\d\s\+\-\(\)]+$/.test(recipientValue);
          detailItems.push({
            label: "Recipient",
            value: recipientValue,
            isPhoneNumber: isPhoneNumber,
          });
        }
        if (log.details.conversationId) {
          detailItems.push({
            label: "Conversation ID",
            value: log.details.conversationId,
          });
        }
        if (log.details.messageType) {
          detailItems.push({
            label: "Message Type",
            value: log.details.messageType,
          });
        }
        if (log.details.content !== undefined) {
          detailItems.push({
            label: "Message Content",
            value:
              typeof log.details.content === "string"
                ? log.details.content
                : JSON.stringify(log.details.content),
          });
        }
        if (log.details.hasAttachments !== undefined) {
          detailItems.push({
            label: "Has Attachments",
            value: log.details.hasAttachments
              ? `Yes (${log.details.attachmentCount || 0})`
              : "No",
          });
        }
        if (log.details.attachmentCount) {
          detailItems.push({
            label: "Attachment Count",
            value: log.details.attachmentCount.toString(),
          });
        }
        if (log.details.queueId) {
          detailItems.push({ label: "Queue ID", value: log.details.queueId });
        }
        if (log.details.updateSource) {
          detailItems.push({
            label: "Update Source",
            value: log.details.updateSource,
          });
        }
        if (log.details.source) {
          detailItems.push({ label: "Source", value: log.details.source });
        }
        if (log.details.providerMessageId) {
          detailItems.push({
            label: "Provider Message ID",
            value: log.details.providerMessageId,
          });
        }
        if (log.details.deliveredAt) {
          detailItems.push({
            label: "Delivered At",
            value: format(
              new Date(log.details.deliveredAt),
              "MMM dd, yyyy hh:mm:ss a"
            ),
          });
        }
        if (log.details.readAt) {
          detailItems.push({
            label: "Read At",
            value: format(
              new Date(log.details.readAt),
              "MMM dd, yyyy hh:mm:ss a"
            ),
          });
        }
        if (log.details.sentAt) {
          detailItems.push({
            label: "Sent At",
            value: format(
              new Date(log.details.sentAt),
              "MMM dd, yyyy hh:mm:ss a"
            ),
          });
        }
        if (log.details.userId) {
          detailItems.push({ label: "User ID", value: log.details.userId });
        }
        if (log.details.isTemplate !== undefined) {
          detailItems.push({
            label: "Is Template",
            value: log.details.isTemplate ? "Yes" : "No",
          });
        }
        if (log.details.templateName) {
          detailItems.push({
            label: "Template Name",
            value: log.details.templateName,
          });
        }
        if (log.details.resendAttempts) {
          detailItems.push({
            label: "Resend Attempts",
            value: log.details.resendAttempts.toString(),
          });
        }
        if (log.details.eventType) {
          detailItems.push({
            label: "Webhook Event Type",
            value: log.details.eventType,
          });
        }
        if (log.details.webhookType) {
          detailItems.push({
            label: "Webhook Type",
            value: log.details.webhookType,
          });
        }

        // Add any other properties from details that aren't already captured
        Object.keys(log.details).forEach((key) => {
          if (
            ![
              "channelType",
              "channelAccountId",
              "channelAccountName",
              "contactId",
              "contactName",
              "targetPhone",
              "targetIdentifier",
              "conversationId",
              "messageType",
              "content",
              "hasAttachments",
              "attachmentCount",
              "queueId",
              "updateSource",
              "source",
              "providerMessageId",
              "deliveredAt",
              "readAt",
              "sentAt",
              "userId",
              "isTemplate",
              "templateName",
              "resendAttempts",
              "eventType",
              "webhookType",
              "webhookPayload",
              "payload",
            ].includes(key)
          ) {
            const value = log.details[key];
            if (value !== null && value !== undefined && value !== "") {
              detailItems.push({
                label:
                  key.charAt(0).toUpperCase() +
                  key
                    .slice(1)
                    .replace(/([A-Z])/g, " $1")
                    .trim(),
                value:
                  typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value),
              });
            }
          }
        });
      }

      // Automation-specific fields
      if (log.logType === "automation") {
        if (log.automationId?._id || log.automationId) {
          const automationId =
            typeof log.automationId === "object"
              ? log.automationId._id
              : log.automationId;
          detailItems.push({
            label: "Automation ID",
            value: automationId.toString(),
          });
        }
        if (log.automationId?.name) {
          detailItems.push({
            label: "Automation Name",
            value: log.automationId.name,
          });
        }
        if (log.data?.automationName) {
          detailItems.push({
            label: "Automation Name",
            value: log.data.automationName,
          });
        }
        if (log.data?.timingType) {
          detailItems.push({
            label: "Timing Type",
            value: log.data.timingType,
          });
        }
        if (log.data?.scheduledFor) {
          detailItems.push({
            label: "Scheduled For",
            value: format(
              new Date(log.data.scheduledFor),
              "MMM dd, yyyy hh:mm:ss a"
            ),
          });
        }
        if (log.data?.sent !== undefined) {
          detailItems.push({
            label: "Messages Sent",
            value: log.data.sent.toString(),
          });
        }
        if (log.data?.failed !== undefined) {
          detailItems.push({
            label: "Messages Failed",
            value: log.data.failed.toString(),
          });
        }
        if (log.data?.contactCount !== undefined) {
          detailItems.push({
            label: "Contacts Found",
            value: log.data.contactCount.toString(),
          });
        }
      }

      // Message and Conversation IDs
      if (log.messageId?._id || log.messageId) {
        const messageId =
          typeof log.messageId === "object" ? log.messageId._id : log.messageId;
        detailItems.push({ label: "Message ID", value: messageId.toString() });
      }
      if (log.conversationId?._id || log.conversationId) {
        const conversationId =
          typeof log.conversationId === "object"
            ? log.conversationId._id
            : log.conversationId;
        detailItems.push({
          label: "Conversation ID",
          value: conversationId.toString(),
        });
      }
      if (log.contactId?._id || log.contactId) {
        const contactId =
          typeof log.contactId === "object" ? log.contactId._id : log.contactId;
        detailItems.push({ label: "Contact ID", value: contactId.toString() });
        if (log.contactId?.name) {
          detailItems.push({
            label: "Contact Name",
            value: log.contactId.name,
          });
        }
        if (log.contactId?.email) {
          detailItems.push({
            label: "Contact Email",
            value: log.contactId.email,
          });
        }
        if (log.contactId?.phone) {
          detailItems.push({
            label: "Contact Phone",
            value: log.contactId.phone,
            isPhoneNumber: true,
          });
        }
      }
      if (log.tenantId) {
        detailItems.push({
          label: "Tenant ID",
          value: log.tenantId.toString(),
        });
      }
      if (log.providerMessageId) {
        detailItems.push({
          label: "Provider Message ID",
          value: log.providerMessageId,
        });
      }

      if (detailItems.length > 0) {
        sections.push({
          title: "Details",
          items: detailItems,
        });
      }
    }

    // API Request Section
    if (log.apiRequest) {
      const requestItems = [];
      if (log.apiRequest.method) {
        requestItems.push({ label: "Method", value: log.apiRequest.method });
      }
      if (log.apiRequest.url) {
        requestItems.push({ label: "Endpoint", value: log.apiRequest.url });
      }
      if (log.apiRequest.body?.to) {
        requestItems.push({
          label: "Recipient",
          value: log.apiRequest.body.to,
        });
      }
      if (log.apiRequest.body?.content?.text) {
        requestItems.push({
          label: "Message",
          value: log.apiRequest.body.content.text,
        });
      }
      if (log.apiRequest.body?.content?.type) {
        requestItems.push({
          label: "Content Type",
          value: log.apiRequest.body.content.type,
        });
      }
      if (log.apiRequest.timestamp) {
        requestItems.push({
          label: "Request Time",
          value: format(
            new Date(log.apiRequest.timestamp),
            "MMM dd, yyyy hh:mm:ss a"
          ),
        });
      }

      if (requestItems.length > 0) {
        sections.push({
          title: "API Request Details",
          items: requestItems,
        });
      }
    }

    // API Response Section
    if (log.apiResponse) {
      const responseItems = [];
      if (log.apiResponse.status) {
        responseItems.push({
          label: "Status Code",
          value: `${log.apiResponse.status} ${
            log.apiResponse.statusText || ""
          }`.trim(),
        });
      }
      if (log.apiResponse.duration) {
        responseItems.push({
          label: "Response Time",
          value: `${log.apiResponse.duration}ms`,
        });
      }
      if (log.apiResponse.body?.messageId) {
        responseItems.push({
          label: "Message ID",
          value: log.apiResponse.body.messageId,
        });
      }
      if (log.apiResponse.body?.whatsappMessageId) {
        responseItems.push({
          label: "WhatsApp Message ID",
          value: log.apiResponse.body.whatsappMessageId,
        });
      }
      if (log.apiResponse.body?.recipientId) {
        responseItems.push({
          label: "Recipient",
          value: log.apiResponse.body.recipientId,
        });
      }
      if (log.apiResponse.timestamp) {
        responseItems.push({
          label: "Response Time",
          value: format(
            new Date(log.apiResponse.timestamp),
            "MMM dd, yyyy hh:mm:ss a"
          ),
        });
      }

      if (responseItems.length > 0) {
        sections.push({
          title: "API Response Details",
          items: responseItems,
        });
      }
    }

    // Error Section
    if (log.error) {
      sections.push({
        title: "Error Information",
        items: [
          {
            label: "Error Message",
            value: log.error.message || "Unknown error",
          },
          ...(log.error.code
            ? [{ label: "Error Code", value: log.error.code }]
            : []),
          ...(log.error.details
            ? [
                {
                  label: "Details",
                  value: JSON.stringify(log.error.details, null, 2),
                },
              ]
            : []),
        ],
        isError: true,
      });
    }

    // Provider Response Section
    if (log.providerResponse) {
      const providerItems = [];
      if (log.providerResponse.messaging_product) {
        providerItems.push({
          label: "Service",
          value: log.providerResponse.messaging_product,
        });
      }
      if (log.providerResponse.messages?.[0]?.id) {
        providerItems.push({
          label: "Provider Message ID",
          value: log.providerResponse.messages[0].id,
        });
      }
      if (log.providerResponse.contacts?.[0]?.wa_id) {
        providerItems.push({
          label: "WhatsApp ID",
          value: log.providerResponse.contacts[0].wa_id,
        });
      }

      if (providerItems.length > 0) {
        sections.push({
          title: "Provider Response",
          items: providerItems,
        });
      }
    }

    // Webhook Payload (simplified)
    if (log.details?.webhookPayload) {
      const webhookItems = [];
      if (log.details.webhookPayload.type) {
        webhookItems.push({
          label: "Event Type",
          value: log.details.webhookPayload.type,
        });
      }
      if (log.details.webhookPayload.messageId) {
        webhookItems.push({
          label: "Message ID",
          value: log.details.webhookPayload.messageId,
        });
      }
      if (log.details.webhookPayload.status) {
        webhookItems.push({
          label: "Status",
          value: log.details.webhookPayload.status,
        });
      }
      if (log.details.webhookPayload.timestamp) {
        const timestamp =
          typeof log.details.webhookPayload.timestamp === "string"
            ? new Date(log.details.webhookPayload.timestamp)
            : new Date(parseInt(log.details.webhookPayload.timestamp) * 1000);
        webhookItems.push({
          label: "Timestamp",
          value: format(timestamp, "MMM dd, yyyy hh:mm:ss a"),
        });
      }

      if (webhookItems.length > 0) {
        sections.push({
          title: "Webhook Information",
          items: webhookItems,
        });
      }
    }

    return sections;
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Message Logs</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Track all message activities and events
            <span className="text-muted-foreground/60 ml-1">(showing last 7 days by default)</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportCSV} variant="outline" size="sm" disabled={!logs.length}>
            Export CSV
          </Button>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
          </Button>
        </div>
      </div>

      {/* Date Quick Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Quick:</span>
        {[
          { label: 'Today', days: 0 },
          { label: '24h', days: 1 },
          { label: '7 Days', days: 7 },
          { label: '30 Days', days: 30 },
          { label: '90 Days', days: 90 },
        ].map(preset => {
          const presetStart = new Date();
          presetStart.setDate(presetStart.getDate() - preset.days);
          const isActive = filters.startDate === formatISO(presetStart).split('T')[0] ||
            (preset.days === 7 && filters.startDate === sevenDaysAgoStr);
          return (
            <Button
              key={preset.label}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => {
                const start = new Date();
                start.setDate(start.getDate() - preset.days);
                setFilters(prev => ({
                  ...prev,
                  startDate: formatISO(start).split('T')[0],
                  endDate: todayStr,
                }));
                setPage(1);
              }}
            >
              {preset.label}
            </Button>
          );
        })}
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="text-[10px] ml-2">
            {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
          </Badge>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Filters</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setPage(1);
                  refetch();
                }}
              >
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                Apply
                  </Button>
                  <Button
                    onClick={() => {
                      // ✅ Reset to last 7 days instead of just today
                      const today = new Date();
                      const sevenDaysAgo = new Date(today);
                      sevenDaysAgo.setDate(today.getDate() - 7);

                      const todayStr = formatISO(startOfToday()).split("T")[0];
                      const sevenDaysAgoStr =
                        formatISO(sevenDaysAgo).split("T")[0];

                      setFilters({
                        messageId: "",
                        conversationId: "",
                        contactName: "",
                        channel: "all",
                        eventType: "all",
                        status: "all",
                        logType: "all",
                        startDate: sevenDaysAgoStr,
                        endDate: todayStr,
                      });
                      setPage(1);
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* First Row: Search, Message ID, Conversation ID, Channel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Contact Name</label>
                  <Input
                    placeholder="Search by name..."
                    aria-label="Contact Name"
                    value={filters.contactName}
                    onChange={(e) => setFilters({ ...filters, contactName: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Message ID</label>
                  <Input
                    placeholder="Enter message ID"
                    aria-label="Message ID"
                    value={filters.messageId}
                    onChange={(e) => setFilters({ ...filters, messageId: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Conversation ID</label>
                  <Input
                    placeholder="Enter conversation ID"
                    aria-label="Conversation ID"
                    value={filters.conversationId}
                    onChange={(e) => setFilters({ ...filters, conversationId: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Channel
                  </label>
                  <Select
                    value={filters.channel || "all"}
                    onValueChange={(value) =>
                      setFilters({
                        ...filters,
                        channel: value === "all" ? "all" : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Channels</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="webchat">Web Chat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Second Row: Event Type, Status, Start Date, End Date */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Event Type
                  </label>
                  <Select
                    value={filters.eventType || "all"}
                    onValueChange={(value) =>
                      setFilters({
                        ...filters,
                        eventType: value === "all" ? "all" : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                    <SelectContent side="bottom">
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="created">Created</SelectItem>
                      <SelectItem value="queued">Queued</SelectItem>
                      <SelectItem value="sending">Sending</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="read">Read</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="resend">Resend</SelectItem>
                      <SelectItem value="status_updated">
                        Status Updated
                      </SelectItem>
                      <SelectItem value="webhook_received">
                        Webhook Received
                      </SelectItem>
                      <SelectItem value="api_call">API Call</SelectItem>
                      <SelectItem value="api_response">API Response</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Status
                  </label>
                  <Select
                    value={filters.status || "all"}
                    onValueChange={(value) =>
                      setFilters({
                        ...filters,
                        status: value === "all" ? "all" : value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Start Date
                  </label>
                  <Popover
                    open={isStartDateOpen}
                    onOpenChange={setIsStartDateOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !filters.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.startDate ? (
                          (() => {
                            // ✅ Parse date string and format for display
                            // Handle both YYYY-MM-DD format and ISO strings
                            const dateStr = filters.startDate;
                            let displayDate;
                            if (dateStr.includes("T")) {
                              displayDate = format(
                                parseISO(dateStr),
                                "MMM dd, yyyy"
                              );
                            } else {
                              // YYYY-MM-DD format - parse as local date to match user's selection
                              const [year, month, day] = dateStr
                                .split("-")
                                .map(Number);
                              const date = new Date(year, month - 1, day);
                              displayDate = format(date, "MMM dd, yyyy");
                            }
                            return displayDate;
                          })()
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          filters.startDate
                            ? (() => {
                                // ✅ Parse date string correctly for calendar
                                const dateStr = filters.startDate;
                                if (dateStr.includes("T")) {
                                  return parseISO(dateStr);
                                } else {
                                  // YYYY-MM-DD format - parse as local date to match user's calendar selection
                                  // This ensures the calendar shows the correct date the user selected
                                  const [year, month, day] = dateStr
                                    .split("-")
                                    .map(Number);
                                  return new Date(year, month - 1, day);
                                }
                              })()
                            : undefined
                        }
                        onSelect={(date) => {
                          if (date) {
                            // ✅ Extract year, month, day from the selected date (treat as calendar date)
                            // Use local date methods to get the calendar date the user selected
                            // This ensures "Nov 20" means "Nov 20" regardless of timezone
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(
                              2,
                              "0"
                            );
                            const day = String(date.getDate()).padStart(2, "0");
                            const dateStr = `${year}-${month}-${day}`;

                            setFilters({
                              ...filters,
                              startDate: dateStr,
                            });
                            setIsStartDateOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    End Date
                  </label>
                  <Popover open={isEndDateOpen} onOpenChange={setIsEndDateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !filters.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.endDate ? (
                          (() => {
                            // ✅ Parse date string and format for display
                            // Handle both YYYY-MM-DD format and ISO strings
                            const dateStr = filters.endDate;
                            let displayDate;
                            if (dateStr.includes("T")) {
                              displayDate = format(
                                parseISO(dateStr),
                                "MMM dd, yyyy"
                              );
                            } else {
                              // YYYY-MM-DD format - parse as local date to match user's selection
                              const [year, month, day] = dateStr
                                .split("-")
                                .map(Number);
                              const date = new Date(year, month - 1, day);
                              displayDate = format(date, "MMM dd, yyyy");
                            }
                            return displayDate;
                          })()
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={
                          filters.endDate
                            ? (() => {
                                // ✅ Parse date string correctly for calendar
                                const dateStr = filters.endDate;
                                if (dateStr.includes("T")) {
                                  return parseISO(dateStr);
                                } else {
                                  // YYYY-MM-DD format - parse as local date to match user's calendar selection
                                  // This ensures the calendar shows the correct date the user selected
                                  const [year, month, day] = dateStr
                                    .split("-")
                                    .map(Number);
                                  return new Date(year, month - 1, day);
                                }
                              })()
                            : undefined
                        }
                        onSelect={(date) => {
                          if (date) {
                            // ✅ Extract year, month, day from the selected date (treat as calendar date)
                            // Use local date methods to get the calendar date the user selected
                            // This ensures "Nov 20" means "Nov 20" regardless of timezone
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(
                              2,
                              "0"
                            );
                            const day = String(date.getDate()).padStart(2, "0");
                            const dateStr = `${year}-${month}-${day}`;

                            setFilters({
                              ...filters,
                              endDate: dateStr,
                            });
                            setIsEndDateOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Logs Table */}
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Message Logs</CardTitle>
                  <CardDescription>
                    {data?.data?.pagination?.total || 0} total logs
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12" role="status">
                  <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-muted-foreground" />
                  <span className="sr-only">Loading logs...</span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-destructive">
                  <AlertTriangle className="h-8 w-8" />
                  <p>Failed to load logs. Please try again.</p>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Retry
                  </Button>
                </div>
              ) : !data ||
                !data.data ||
                !data.data.logs ||
                data.data.logs.length === 0 ? (
                <div className="text-center py-12">
                  <div className="flex flex-col items-center gap-4">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        No logs found
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {filters.startDate || filters.endDate
                          ? `No logs found for the selected date range (${filters.startDate} to ${filters.endDate}). Try adjusting your filters or expanding the date range.`
                          : "No logs found for the selected filters. Try adjusting your search criteria or clear filters to see all logs."}
                      </p>
                      <p className="text-xs text-muted-foreground mt-3">
                        <strong>Note:</strong> Logs are only created for
                        messages sent/received after the logging feature was
                        enabled. If you have existing messages, they won&apos;t
                        have logs unless you send a new message.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Table controls */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-xs text-muted-foreground">
                      {pagination?.total || 0} logs found
                    </p>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleExpandAll}>
                      {expandedRows.size > 0 ? 'Collapse All' : 'Expand All'}
                    </Button>
                  </div>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead className="text-xs">Time</TableHead>
                          <TableHead className="text-xs">Contact</TableHead>
                          <TableHead className="text-xs">Identifier</TableHead>
                          <TableHead className="text-xs">Channel</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                          <TableHead className="text-xs">Message ID</TableHead>
                          <TableHead className="text-xs">Conversation</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.data.logs.map((log) => (
                          <React.Fragment key={log._id}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleRow(log._id)}
                            >
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="min-h-[44px] min-w-[44px]"
                                  aria-label={expandedRows.has(log._id) ? "Collapse log details" : "Expand log details"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRow(log._id);
                                  }}
                                >
                                  {expandedRows.has(log._id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {format(
                                  new Date(log.createdAt),
                                  "MMM dd, HH:mm:ss"
                                )}
                              </TableCell>
                              <TableCell>
                                {log.contactId?.name ||
                                  log.data?.contactName ||
                                  log.details?.contactName ||
                                  "N/A"}
                              </TableCell>
                              <TableCell>
                                {(() => {
                                  // ✅ Get identifier (phone or email) from various sources
                                  const phone =
                                    log.contactId?.phone ||
                                    log.data?.targetPhone ||
                                    log.details?.targetPhone ||
                                    log.data?.contactPhone ||
                                    log.details?.contactPhone;
                                  const email =
                                    log.contactId?.email ||
                                    log.data?.targetEmail ||
                                    log.details?.targetEmail ||
                                    log.data?.contactEmail ||
                                    log.details?.contactEmail;

                                  // ✅ Prioritize phone if available, otherwise email
                                  if (phone) {
                                    return <PhoneNumberDisplay phone={phone} />;
                                  } else if (email) {
                                    return (
                                      <span className="text-sm">{email}</span>
                                    );
                                  } else {
                                    return (
                                      <span className="text-sm text-muted-foreground">
                                        N/A
                                      </span>
                                    );
                                  }
                                })()}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getChannelIcon(log.channel)}
                                  <span className="capitalize">
                                    {log.channel}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {log.status ? (
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon(log.status)}
                                    <span className="capitalize">
                                      {log.status}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    {getStatusIcon("info")}
                                    <span className="capitalize text-muted-foreground">
                                      N/A
                                    </span>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="max-w-md truncate">
                                {log.message ||
                                  log.description ||
                                  log.data?.description ||
                                  (log.eventType === "created"
                                    ? `Message created: ${
                                        log.data?.messageType || "text"
                                      }`
                                    : "") ||
                                  (log.eventType === "sent"
                                    ? "Message sent successfully"
                                    : "") ||
                                  (log.eventType === "delivered"
                                    ? "Message delivered"
                                    : "") ||
                                  (log.eventType === "read"
                                    ? "Message read"
                                    : "") ||
                                  (log.eventType === "failed"
                                    ? log.data?.error || "Message failed"
                                    : "") ||
                                  (log.eventType === "queued"
                                    ? "Message queued for sending"
                                    : "") ||
                                  (log.eventType === "sending"
                                    ? "Message sending"
                                    : "") ||
                                  (log.eventType === "status_updated"
                                    ? `Status updated to ${log.status}`
                                    : "") ||
                                  "N/A"}
                              </TableCell>
                              <TableCell className="font-mono text-xs max-w-xs break-all">
                                {(() => {
                                  const msgId =
                                    log.messageId?._id?.toString() ||
                                    (typeof log.messageId === "string"
                                      ? log.messageId
                                      : log.messageId?.toString()) ||
                                    log.message?._id?.toString() ||
                                    log.data?.messageId?.toString();
                                  return msgId || "N/A";
                                })()}
                              </TableCell>
                              <TableCell className="font-mono text-xs max-w-xs break-all">
                                {(() => {
                                  const convId =
                                    log.conversationId?._id?.toString() ||
                                    (typeof log.conversationId === "string"
                                      ? log.conversationId
                                      : log.conversationId?.toString()) ||
                                    log.conversation?._id?.toString() ||
                                    log.data?.conversationId?.toString();
                                  return convId || "N/A";
                                })()}
                              </TableCell>
                            </TableRow>
                            {expandedRows.has(log._id) && (
                              <TableRow>
                                <TableCell
                                  colSpan={9}
                                  className="bg-muted/50 p-0"
                                >
                                  <div className="p-6 space-y-6 border-t border-border">
                                    {renderLogDetails(log).map(
                                      (section, idx) => (
                                        <div
                                          key={idx}
                                          className={cn(
                                            "bg-card rounded-lg p-4 border",
                                            section.isError
                                              ? "border-destructive/30"
                                              : "border-border"
                                          )}
                                        >
                                          <h4
                                            className={cn(
                                              "font-semibold mb-4 text-base flex items-center gap-2",
                                              section.isError
                                                ? "text-destructive"
                                                : "text-foreground"
                                            )}
                                          >
                                            {section.isError && (
                                              <AlertCircle className="h-5 w-5" />
                                            )}
                                            {section.title}
                                          </h4>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {section.items.map(
                                              (item, itemIdx) => (
                                                <div
                                                  key={itemIdx}
                                                  className="space-y-1"
                                                >
                                                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                    {item.label}
                                                  </div>
                                                  <div
                                                    className={cn(
                                                      "text-sm font-medium",
                                                      section.isError
                                                        ? "text-destructive"
                                                        : "text-foreground",
                                                      item.isPhoneNumber &&
                                                        "flex items-center gap-1"
                                                    )}
                                                  >
                                                    {item.isPhoneNumber ? (
                                                      <PhoneNumberDisplay
                                                        phone={item.value}
                                                      />
                                                    ) : typeof item.value ===
                                                        "string" &&
                                                      item.value.length >
                                                        100 ? (
                                                      <div className="space-y-1">
                                                        <div className="break-words">
                                                          {item.value.substring(
                                                            0,
                                                            100
                                                          )}
                                                          ...
                                                        </div>
                                                        <details>
                                                          <summary className="text-xs text-primary hover:underline cursor-pointer">
                                                            Show full content
                                                          </summary>
                                                          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                                                            {item.value}
                                                          </pre>
                                                        </details>
                                                      </div>
                                                    ) : (
                                                      <div className="break-words">
                                                        {item.value}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      )
                                    )}

                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {data?.data?.pagination && data.data.pagination.total > 0 && (
                    <div className="mt-4">
                      <Pagination
                        pagination={{
                          page: data.data.pagination.page || page,
                          limit: data.data.pagination.limit || limit,
                          total: data.data.pagination.total || 0,
                          pages: data.data.pagination.totalPages || 1,
                        }}
                        onPageChange={(newPage) => {
                          setPage(newPage);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        onLimitChange={(newLimit) => {
                          setLimit(newLimit);
                          setPage(1);
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
    </div>
  );
}
