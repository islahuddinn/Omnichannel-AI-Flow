// src/components/chat/ConversationHeader.jsx

'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Info,
  Pin,
  Star,
  BellOff,
  AlarmClock,
  Mail,
  Phone,
  Copy,
  Check,
  Calendar,
  User,
  Building2,
  MapPin,
  Tag,
  Link as LinkIcon,
  Loader2,
  X,
  Briefcase,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Bot,
  BotOff,
  UserCircle,
  Sparkles,
} from 'lucide-react';
import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import PhoneNumberDisplay from '@/components/shared/PhoneNumberDisplay';
import NumberSelect from '@/components/shared/NumberSelect';
import SalesforceActivityPanel from '@/components/chat/SalesforceActivityPanel';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { useCallCenterStore } from '@/store/useCallCenterStore';
import { useCallCenter } from '@/hooks/useCallCenter';
import { useSocketEvent } from '@/hooks/useSocket';

// ✅ Debug logger - suppressed in production (Bug #1, #15)
const isDev = process.env.NODE_ENV === 'development';
const debugLog = isDev ? console.log.bind(console) : () => {};
const debugWarn = isDev ? console.warn.bind(console) : () => {};

// ✅ Shared helper to get all merged channels (Bug #3 - was duplicated)
const getAllMergedChannels = (conversation) => {
  if (!conversation?.isMerged || !conversation?.mergedConversations?.length) {
    return conversation?.channel ? [conversation.channel] : [];
  }
  const channels = [conversation.channel];
  conversation.mergedConversations.forEach(merged => {
    if (merged.channel && !channels.includes(merged.channel)) {
      channels.push(merged.channel);
    }
  });
  return channels;
};

// Helper function to copy to clipboard
const copyToClipboard = async (text, fieldName, setCopiedField) => {
  try {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  } catch (error) {
    toast.error('Failed to copy to clipboard');
  }
};

// ✅ Memoized component for conversation started date - defined outside to prevent recreation
// Using regular div instead of motion.div to prevent re-animation during typing
const ConversationStartedDateItem = memo(({ formattedDate }) => {
  if (!formattedDate) return null;
  
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-md",
        "bg-muted/50 hover:bg-muted",
        "transition-colors"
      )}
    >
      <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
        <Calendar className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">Conversation Started</p>
        <p className="text-xs sm:text-sm font-medium text-foreground truncate">
          {formattedDate}
        </p>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if formattedDate actually changes
  return prevProps.formattedDate === nextProps.formattedDate;
});

ConversationStartedDateItem.displayName = 'ConversationStartedDateItem';

// ✅ Bug #4: DetailItem extracted outside ContactDetailsContent to prevent re-creation on every render
const DetailItem = memo(({ icon: Icon, label, value, onCopy, copyValue, copiedField, setCopiedField }) => {
  if (!value) return null;

  const isPhoneField = label.toLowerCase().includes('phone') || label.toLowerCase().includes('whatsapp') || label.toLowerCase().includes('sms');

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-md",
        "bg-muted/50 hover:bg-muted",
        "transition-colors cursor-pointer group"
      )}
      onClick={() => onCopy && copyToClipboard(copyValue || value, label, setCopiedField)}
    >
      <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
        <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
        <p className="text-xs sm:text-sm font-medium text-foreground truncate">
          {isPhoneField ? (
            <PhoneNumberDisplay phone={value} />
          ) : (
            value
          )}
        </p>
      </div>
      {onCopy && (
        <div className="flex-shrink-0">
          {copiedField === label ? (
            <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
          ) : (
            <Copy className="h-3 w-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
          )}
        </div>
      )}
    </div>
  );
});
DetailItem.displayName = 'DetailItem';

// Mode Toggle Button Component
function ModeToggleButton({ conversation, isViewOnly = false, isChatDisabled = false }) {
  const queryClient = useQueryClient();
  const [isToggling, setIsToggling] = useState(false);
  
  const currentMode = conversation?.mode || 'auto';
  const isAuto = currentMode === 'auto';
  
  // ✅ Check if department AI bot is enabled
  // Handle both populated object and ObjectId
  const department = conversation?.department;
  const departmentAiBotEnabled = department && typeof department === 'object' && department !== null
    ? department.aiBotEnabled
    : null;
  
  // ✅ If trying to switch to auto mode but department AI bot is disabled, prevent it
  const canSwitchToAuto = departmentAiBotEnabled === true || !department;
  const isDisabled = isToggling || (!isAuto && !canSwitchToAuto) || isViewOnly || isChatDisabled;
  
  const modeMutation = useMutation({
    mutationFn: async (newMode) => {
      const result = await apiClient.patch(`/conversations/${conversation._id}/mode`, { mode: newMode });
      if (!result.success) {
        throw new Error(result.error || 'Failed to update mode');
      }
      return result.data;
    },
    onMutate: async (newMode) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['conversation', conversation._id] });
      const previousConversation = queryClient.getQueryData(['conversation', conversation._id]);
      
      queryClient.setQueryData(['conversation', conversation._id], (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: { ...old.data, mode: newMode },
        };
      });
      
      // Also update in conversations list
      queryClient.setQueriesData({ queryKey: ['conversations'] }, (oldData) => {
        if (!oldData) return oldData;
        
        const updateConversation = (conv) => {
          if (conv._id === conversation._id || conv._id?.toString() === conversation._id?.toString()) {
            return { ...conv, mode: newMode };
          }
          return conv;
        };
        
        if (oldData.pages) {
          // Infinite query structure
          return {
            ...oldData,
            pages: oldData.pages.map(page => ({
              ...page,
              data: Array.isArray(page.data) ? page.data.map(updateConversation) : page.data,
            })),
          };
        } else if (oldData.data) {
          // Regular query structure
          return {
            ...oldData,
            data: Array.isArray(oldData.data) ? oldData.data.map(updateConversation) : oldData.data,
          };
        }
        
        return oldData;
      });
      
      return { previousConversation };
    },
    onError: (error, newMode, context) => {
      // Rollback on error
      if (context?.previousConversation) {
        queryClient.setQueryData(['conversation', conversation._id], context.previousConversation);
      }
      toast.error(error.message || 'Failed to update conversation mode');
    },
    onSuccess: (data, newMode) => {
      toast.success(`Conversation moved to ${newMode === 'auto' ? 'Auto' : 'Manual'} mode`);
      queryClient.invalidateQueries({ queryKey: ['conversation', conversation._id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onSettled: () => {
      setIsToggling(false);
    },
  });
  
  const handleToggle = () => {
    if (isToggling || !conversation?._id || isDisabled) return;
    
    // ✅ Prevent switching to auto mode if department AI bot is disabled
    if (!isAuto && !canSwitchToAuto) {
      const departmentName = department && typeof department === 'object' && department !== null
        ? department.name
        : 'this department';
      toast.error(`Cannot switch to Auto mode. AI Bot is not enabled for ${departmentName}. Please enable AI Bot for this department first.`);
      return;
    }
    
    setIsToggling(true);
    const newMode = isAuto ? 'manual' : 'auto';
    modeMutation.mutate(newMode);
  };
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            type="button"
            onClick={handleToggle}
            disabled={isDisabled}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:cursor-not-allowed",
              isAuto
                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 focus:ring-emerald-500"
                : isDisabled && !canSwitchToAuto
                  ? "bg-muted text-gray-400 dark:text-gray-500 border border-border opacity-60 cursor-not-allowed"
                  : "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 focus:ring-orange-400"
            )}
            whileHover={!isDisabled ? { scale: 1.03 } : {}}
            whileTap={!isDisabled ? { scale: 0.97 } : {}}
          >
            {/* Bot Icon with animations */}
            <div className="relative">
              <AnimatePresence mode="wait">
                {isToggling ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </motion.div>
                ) : isAuto ? (
                  <motion.div
                    key="bot-on"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <Bot className="h-4 w-4" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="bot-off"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <BotOff className="h-4 w-4" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Pulse ring animation when bot is active */}
              {isAuto && !isToggling && (
                <motion.span
                  className="absolute -inset-1 rounded-full bg-emerald-400/30 dark:bg-emerald-400/20"
                  animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>

            <span className="hidden sm:inline">
              {isAuto ? 'AI Bot' : 'Manual'}
            </span>

            {/* Status dot */}
            <motion.span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                isAuto ? "bg-emerald-500" : "bg-orange-400 dark:bg-orange-500"
              )}
              animate={isAuto ? { scale: [1, 1.3, 1] } : {}}
              transition={isAuto ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
            />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-[220px]">
          <div className="flex items-center gap-1.5">
            {isAuto ? (
              <Bot className="h-3 w-3 text-emerald-500" />
            ) : (
              <BotOff className="h-3 w-3 text-gray-400" />
            )}
            <p>
              {isAuto
                ? 'AI Bot is active — Click to switch to Manual'
                : isDisabled && !canSwitchToAuto
                  ? (() => {
                      const departmentName = department && typeof department === 'object' && department !== null
                        ? department.name
                        : 'this department';
                      return `AI Bot not enabled for ${departmentName}`;
                    })()
                  : 'Manual mode — Click to enable AI Bot'}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Contact Details Content Component
export function ContactDetailsContent({ contact, conversation, copiedField, setCopiedField, onWebchatLinkGenerated }) {
  const queryClient = useQueryClient();
  const [messageStats, setMessageStats] = useState(conversation?.messageStats || {
    inboundMessages: 0,
    botMessages: 0,
    manualMessages: 0,
    totalOutbound: 0
  });

  // ✅ Track processed message IDs to prevent duplicate counting
  const processedMessageIds = useRef(new Set());
  // ✅ Track tempId to _id mapping to prevent counting optimistic + real message as two separate messages
  const tempIdToRealIdMap = useRef(new Map());
  
  // ✅ Conversation Summary State
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [displayedSummary, setDisplayedSummary] = useState('');
  const [customerSentiment, setCustomerSentiment] = useState(null);
  const [showSummary, setShowSummary] = useState(false);
  const summaryIntervalRef = useRef(null);
  
  // ✅ Store conversation started date in state, but only update when conversation changes
  // This prevents re-renders during typing animation
  const [conversationStartedDate, setConversationStartedDate] = useState(() => {
    if (conversation?.createdAt) {
      return formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true });
    }
    return null;
  });
  
  const conversationIdRef = useRef(conversation?._id);
  
  // ✅ Only update the date when conversation actually changes (not during typing animation)
  useEffect(() => {
    const currentConversationId = conversation?._id?.toString();
    const previousConversationId = conversationIdRef.current?.toString();
    
    if (currentConversationId !== previousConversationId) {
      conversationIdRef.current = conversation?._id;
      if (conversation?.createdAt) {
        setConversationStartedDate(formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true }));
      } else {
        setConversationStartedDate(null);
      }
    }
  }, [conversation?._id, conversation?.createdAt]);

  // ✅ Update stats when conversation data changes
  useEffect(() => {
    if (conversation?.messageStats) {
      setMessageStats(conversation.messageStats);
      // ✅ Clear processed messages when conversation changes
      processedMessageIds.current.clear();
      tempIdToRealIdMap.current.clear();
    }
  }, [conversation?._id, conversation?.messageStats]);

  // ✅ Cleanup: Limit the size of processed message IDs Set (keep last 1000)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      if (processedMessageIds.current.size > 1000) {
        // ✅ Remove oldest entries (convert to array, keep last 1000)
        const idsArray = Array.from(processedMessageIds.current);
        processedMessageIds.current = new Set(idsArray.slice(-1000));
      }
    }, 60000); // Cleanup every minute

    return () => clearInterval(cleanupInterval);
  }, []);

  // ✅ Cleanup typing effect on unmount or conversation change
  useEffect(() => {
    return () => {
      if (summaryIntervalRef.current) {
        clearInterval(summaryIntervalRef.current);
        summaryIntervalRef.current = null;
      }
    };
  }, [conversation?._id]);

  // ✅ Bug #6: Socket handlers wrapped in useCallback for stable references
  const handleStatsUpdate = useCallback((data) => {
    if (data?.conversationId === conversation?._id?.toString() && data?.messageStats) {
      debugLog('📊 Real-time stats update received:', data.messageStats);
      setMessageStats(data.messageStats);

      queryClient.setQueryData(['conversation', conversation._id], (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: {
            ...old.data,
            messageStats: data.messageStats
          }
        };
      });
    }
  }, [conversation?._id, queryClient]);

  useSocketEvent('conversation:stats:update', handleStatsUpdate);

  // ✅ Bug #6: message:new handler wrapped in useCallback
  const handleMessageNew = useCallback((data) => {
    const newMessage = data?.message || data;
    const messageConvId = String(newMessage?.conversation || newMessage?.conversationId || '');
    const currentConvId = String(conversation?._id || '');

    const realId = newMessage?._id?.toString() || newMessage?.id?.toString();
    const tempId = newMessage?.tempId?.toString() || newMessage?.metadata?.tempId?.toString();
    const messageId = realId || tempId;

    if (!messageId || messageConvId !== currentConvId) return;

    const isInbound = newMessage.direction === 'inbound';
    const isOutbound = newMessage.direction === 'outbound';
    const messageStatus = newMessage.status || 'pending';
    const isOptimistic = newMessage.isOptimistic || (!realId && tempId);

    if (isOutbound && (isOptimistic || messageStatus === 'pending')) {
      debugLog('⏭️ Skipping pending/optimistic outbound message:', { messageId: realId || tempId, status: messageStatus });
      return;
    }

    const idToCheck = realId || tempId;
    if (idToCheck && processedMessageIds.current.has(idToCheck)) {
      debugLog('⏭️ Skipping already processed message:', idToCheck);
      return;
    }

    if (realId && tempId && tempIdToRealIdMap.current.has(tempId)) {
      const mappedRealId = tempIdToRealIdMap.current.get(tempId);
      if (mappedRealId === realId && processedMessageIds.current.has(realId)) return;
    }

    if (realId) {
      processedMessageIds.current.add(realId);
      if (tempId) tempIdToRealIdMap.current.set(tempId, realId);
    } else if (tempId) {
      processedMessageIds.current.add(tempId);
    }

    const isBot = newMessage.metadata?.isBotResponse || newMessage.sendingModule === 'bot';

    debugLog('📊 Processing new message for stats:', {
      messageId: realId || tempId, direction: newMessage.direction, status: messageStatus, isBot
    });

    const updateStats = (prev) => {
      const updated = { ...prev };
      if (isInbound) {
        updated.inboundMessages = (updated.inboundMessages || 0) + 1;
      } else if (isOutbound) {
        if (isBot) {
          updated.botMessages = (updated.botMessages || 0) + 1;
        } else if (newMessage.sender || newMessage.sendingModule === 'manual') {
          updated.manualMessages = (updated.manualMessages || 0) + 1;
        }
        updated.totalOutbound = (updated.botMessages || 0) + (updated.manualMessages || 0);
      }
      return updated;
    };

    setMessageStats(updateStats);

    queryClient.setQueryData(['conversation', conversation._id], (old) => {
      if (!old?.data) return old;
      const currentStats = old.data.messageStats || {
        inboundMessages: 0, botMessages: 0, manualMessages: 0, totalOutbound: 0
      };
      return {
        ...old,
        data: {
          ...old.data,
          messageStats: updateStats(currentStats),
          messageCount: (old.data.messageCount || 0) + 1
        }
      };
    });
  }, [conversation?._id, queryClient]);

  useSocketEvent('message:new', handleMessageNew);
  
  // Fetch deals for this contact
  // ✅ Handle both _id and id formats, and check for SF_id in contact (top-level field)
  const contactId = contact?._id || contact?.id;
  // ✅ Get SF_id from top-level field (NOT from details)
  const sfId = contact?.SF_id;
  const hasSfId = !!sfId;
  
  // ✅ Get Contact_Type from top-level field (NOT from details)
  const contactType = (contact?.Contact_Type || '').toLowerCase().trim();
  
  const { data: dealsData, isLoading: dealsLoading, error: dealsError } = useQuery({
    queryKey: ['contact-deals', contactId, sfId],
    queryFn: async () => {
      if (!contactId || !hasSfId) {
        return { success: true, data: [], count: 0 };
      }
      try {
        debugLog('📥 Fetching deals for contact:', { contactId, sfId });
        const response = await apiClient.get(`/contacts/${contactId}/deals`);
        debugLog('✅ Deals fetched:', { count: response?.data?.length || 0 });
        return response;
      } catch (error) {
        console.error('❌ Error fetching deals:', error.message);
        return { success: false, data: [], count: 0, error: error.message };
      }
    },
    enabled: !!contactId && hasSfId, // Only fetch if contact has ID and SF_id
    staleTime: 300000, // 5 minutes
    refetchOnWindowFocus: false,
  });
  
  // ✅ Handle both response formats: dealsData as array or dealsData.data as array
  // The API returns {success: true, data: [...], count: 1}, but apiClient extracts response.data
  // So dealsData should be {success: true, data: [...], count: 1}
  // But handle case where it might be an array directly
  const deals = useMemo(() => {
    if (!dealsData) return [];
    if (Array.isArray(dealsData)) return dealsData;
    if (dealsData?.data && Array.isArray(dealsData.data)) return dealsData.data;
    return [];
  }, [dealsData]);
  
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  // ✅ Local state to track webchat link for immediate UI update
  const [webchatLink, setWebchatLink] = useState(contact?.webchatLink || null);

  // ✅ Sync webchatLink state when contact prop changes
  useEffect(() => {
    setWebchatLink(contact?.webchatLink || null);
  }, [contact?.webchatLink, contact?._id]);

  // Generate WebChat link mutation
  const generateWebchatLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/webchat/contact-link', {
        contactId: contact._id || contact.id,
      });
      return response.data;
    },
    onSuccess: (data) => {
      const generatedLink = data.data?.contactLink;
      if (generatedLink) {
        // ✅ Update local state immediately for UI
        setWebchatLink(generatedLink);

        // ✅ Bug #14: Removed direct prop mutation — use callback + query invalidation instead
        if (onWebchatLinkGenerated) {
          onWebchatLinkGenerated(generatedLink);
        }

        toast.success('WebChat link generated successfully!');

        // ✅ Invalidate queries to refresh data from server
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        queryClient.invalidateQueries({ queryKey: ['conversation', conversation?._id] });
        queryClient.invalidateQueries({ queryKey: ['contact', contact?._id || contact?.id] });
      }
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to generate WebChat link';
      toast.error(errorMessage);
    },
    onSettled: () => {
      setIsGeneratingLink(false);
    },
  });
  
  const handleGenerateWebchatLink = async () => {
    if (!contact?._id && !contact?.id) {
      toast.error('Contact ID is required to generate WebChat link');
      return;
    }
    setIsGeneratingLink(true);
    generateWebchatLinkMutation.mutate();
  };
  // ✅ CRITICAL: Use same logic as header to get contact name (handle all cases)
  const contactName = contact?.name || 
                     contact?.displayName ||
                     (contact?.firstName && contact?.lastName ? `${contact.firstName} ${contact.lastName}`.trim() : '') ||
                     contact?.email ||
                     contact?.phone ||
                     contact?.identifiers?.email ||
                     contact?.identifiers?.phone ||
                     'Unknown Contact';

  const getInitials = (name) => {
    if (!name || name === 'Unknown Contact') return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // ✅ Bug #3: Use shared getAllMergedChannels helper
  const mergedChannels = useMemo(() => getAllMergedChannels(conversation), [conversation]);

  // State for collapsible sections
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [isConversationStatsOpen, setIsConversationStatsOpen] = useState(false);
  // ✅ Bug #7: React state for avatar error instead of DOM manipulation
  const [avatarError, setAvatarError] = useState(false);

  // ✅ Bug #5: Memoize lastMessageAt relative time
  const lastMessageTimeAgo = useMemo(() => {
    if (!conversation?.lastMessageAt) return null;
    return formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: true });
  }, [conversation?.lastMessageAt]);

  return (
    <div className="space-y-2.5 w-full">
      {/* Contact Header Card - Fully Responsive */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center text-center pb-2.5 px-2"
      >
        {/* Avatar — Bug #7: React state for error instead of DOM manipulation */}
        <div className="relative mb-2.5">
          {contact?.avatar && !avatarError ? (
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full overflow-hidden bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
              <img
                src={contact.avatar}
                alt={contactName}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            </div>
          ) : (
            <div className="mt-4 h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs sm:text-sm font-semibold text-foreground select-none">
                {getInitials(contactName)}
              </span>
            </div>
          )}
        </div>
        
        {/* Contact Name - Responsive */}
        <h2 className="text-sm sm:text-base font-bold text-foreground mb-1.5 px-1 break-words max-w-full">
          {contactName}
        </h2>
        
        {/* Status Badges - Compact (No Channels) */}
        {(conversation?.isPinned || conversation?.isStarred || conversation?.isMuted || conversation?.isSnoozed) && (
          <div className="flex items-center gap-1 flex-wrap justify-center mb-1.5">
            {conversation?.isPinned && (
              <Badge variant="outline" className="gap-0.5 text-[10px] px-1.5 py-0.5">
                <Pin className="h-2.5 w-2.5" />
                Pinned
              </Badge>
            )}
            {conversation?.isStarred && (
              <Badge variant="outline" className="gap-0.5 text-[10px] px-1.5 py-0.5">
                <Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" />
                Starred
              </Badge>
            )}
            {conversation?.isMuted && (
              <Badge variant="outline" className="gap-0.5 text-[10px] px-1.5 py-0.5">
                <BellOff className="h-2.5 w-2.5" />
                Muted
              </Badge>
            )}
            {conversation?.isSnoozed && (
              <Badge variant="outline" className="gap-0.5 text-[10px] px-1.5 py-0.5">
                <AlarmClock className="h-2.5 w-2.5" />
                Snoozed
              </Badge>
            )}
          </div>
        )}

        {/* Last Message Time — Bug #5: memoized */}
        {lastMessageTimeAgo && (
          <p className="text-[10px] sm:text-xs text-muted-foreground px-1">
            Last message {lastMessageTimeAgo}
          </p>
        )}
      </motion.div>

      {/* Salesforce Activity Panel */}
      <div className="mx-1 mb-2 rounded-lg border border-border overflow-hidden">
        <SalesforceActivityPanel conversationId={conversation?._id} />
        {contact?.SF_id && (
          <div className="px-3 py-1.5 bg-muted/30 flex items-center justify-between border-t border-border">
            <span className="text-[10px] text-muted-foreground">SF: {contact.SF_id}</span>
            <a
              href={`${process.env.NEXT_PUBLIC_SALESFORCE_INSTANCE_URL || 'https://hmi1--dev1uat.sandbox.my.salesforce.com'}/${contact.SF_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[#00a884] hover:underline"
            >
              Open in Salesforce
            </a>
          </div>
        )}
      </div>

      {/* Contact Information - Collapsible */}
      <Collapsible open={isContactInfoOpen} onOpenChange={setIsContactInfoOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between p-2 sm:p-2.5 rounded-md hover:bg-muted/50 transition-colors">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground/80">
            Contact Information
          </h3>
          {isContactInfoOpen ? (
            <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground flex-shrink-0" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-1.5 sm:space-y-2 pt-1.5 sm:pt-2">
          {/* Email */}
          {contact?.email && (
            <DetailItem
              icon={Mail}
              label="Email"
              value={contact.email}
              onCopy={true}
              copyValue={contact.email}
              copiedField={copiedField}
              setCopiedField={setCopiedField}
            />
          )}
          
          {/* Phone */}
          {(contact?.phone || contact?.identifiers?.phone) && (
            <DetailItem
              icon={Phone}
              label="Phone"
              value={contact.phone || contact.identifiers?.phone}
              onCopy={true}
              copyValue={contact.phone || contact.identifiers?.phone}
              copiedField={copiedField}
              setCopiedField={setCopiedField}
            />
          )}

          {/* WhatsApp */}
          {contact?.identifiers?.whatsapp && (
            <DetailItem
              icon={Phone}
              label="WhatsApp"
              value={contact.identifiers.whatsapp}
              onCopy={true}
              copyValue={contact.identifiers.whatsapp}
              copiedField={copiedField}
              setCopiedField={setCopiedField}
            />
          )}

          {/* SMS */}
          {contact?.identifiers?.sms && (
            <DetailItem
              icon={Phone}
              label="SMS"
              value={contact.identifiers.sms}
              onCopy={true}
              copyValue={contact.identifiers.sms}
              copiedField={copiedField}
              setCopiedField={setCopiedField}
            />
          )}

          {/* WebChat Link */}
          {(webchatLink || contact?.webchatLink) ? (
            <DetailItem
              icon={LinkIcon}
              label="WebChat Link"
              value={webchatLink || contact?.webchatLink || ''}
              onCopy={true}
              copyValue={webchatLink || contact?.webchatLink || ''}
              copiedField={copiedField}
              setCopiedField={setCopiedField}
            />
          ) : (
            <div
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-md",
                "bg-muted/50 hover:bg-muted",
                "transition-colors"
              )}
            >
              <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                <LinkIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-0.5">WebChat Link</p>
                <p className="text-xs sm:text-sm text-muted-foreground">No link generated</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateWebchatLink}
                disabled={isGeneratingLink}
                className="flex-shrink-0 text-[10px] sm:text-xs h-6 px-2"
              >
                {isGeneratingLink ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    <span className="hidden sm:inline">Generating...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  'Generate'
                )}
              </Button>
            </div>
          )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Additional Details — Bug #11: Made collapsible + consistent styling; Bug #12: Skip redundant name */}
      {(contact?.company || contact?.address || (contact?.tags && contact.tags.length > 0)) && (
        <Collapsible>
          <CollapsibleTrigger className="w-full flex items-center justify-between p-2 sm:p-2.5 rounded-md hover:bg-muted/50 transition-colors">
            <h3 className="text-xs sm:text-sm font-semibold text-foreground/80">
              Additional Information
            </h3>
            <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground flex-shrink-0" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-1.5 sm:space-y-2 pt-1.5 sm:pt-2">
              {/* Company */}
              {contact?.company && (
                <DetailItem
                  icon={Building2}
                  label="Company"
                  value={contact.company}
                  copiedField={copiedField}
                  setCopiedField={setCopiedField}
                />
              )}

              {/* Address */}
              {contact?.address && (
                <DetailItem
                  icon={MapPin}
                  label="Address"
                  value={contact.address}
                  copiedField={copiedField}
                  setCopiedField={setCopiedField}
                />
              )}

              {/* Tags */}
              {contact?.tags && contact.tags.length > 0 && (
                <div className="p-1.5 sm:p-2 rounded-md bg-muted/50">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Tag className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-medium text-muted-foreground">Tags</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {contact.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="text-[10px] sm:text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Conversation Stats - Collapsible */}
      <Collapsible open={isConversationStatsOpen} onOpenChange={setIsConversationStatsOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between p-2 sm:p-2.5 rounded-md hover:bg-muted/50 transition-colors">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground/80">
            Conversation Statistics
          </h3>
          {isConversationStatsOpen ? (
            <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground flex-shrink-0" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-1.5 sm:space-y-2 pt-1.5 sm:pt-2">
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15 }}
                className="p-1.5 sm:p-2 rounded-md bg-muted/50 text-center"
              >
                <p className="text-base sm:text-lg font-bold text-primary">{conversation?.messageCount || 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Messages</p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15 }}
                className="p-1.5 sm:p-2 rounded-md bg-muted/50 text-center"
              >
                <p className="text-base sm:text-lg font-bold text-primary">{conversation?.unreadCount || 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Unread</p>
              </motion.div>
            </div>

            {/* Inbound Messages */}
            <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15, delay: 0.1 }}
                className="p-1.5 sm:p-2 rounded-md bg-purple-50 dark:bg-purple-900/20 text-center border border-purple-200 dark:border-purple-800"
              >
                <p className="text-base sm:text-lg font-bold text-purple-600 dark:text-purple-400">
                  {messageStats?.inboundMessages || conversation?.messageStats?.inboundMessages || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Received Messages</p>
              </motion.div>
            </div>

            {/* Outbound Messages (Bot and Manual) */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15, delay: 0.15 }}
                className="p-1.5 sm:p-2 rounded-md bg-blue-50 dark:bg-blue-900/20 text-center border border-blue-200 dark:border-blue-800"
              >
                <p className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400">
                  {messageStats?.botMessages || conversation?.messageStats?.botMessages || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Bot Messages</p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.15, delay: 0.2 }}
                className="p-1.5 sm:p-2 rounded-md bg-green-50 dark:bg-green-900/20 text-center border border-green-200 dark:border-green-800"
              >
                <p className="text-base sm:text-lg font-bold text-green-600 dark:text-green-400">
                  {messageStats?.manualMessages || conversation?.messageStats?.manualMessages || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Manual Messages</p>
              </motion.div>
            </div>

            {/* Created Date - Using memoized component with state to prevent re-renders during typing animation */}
            <ConversationStartedDateItem formattedDate={conversationStartedDate} />

            {/* Generate Conversation Summary Button */}
            <div className="pt-2 border-t border-border">
              <Button
                onClick={async () => {
                  if (isGeneratingSummary) return;

                  // ✅ Bug #10: Clear old interval first, don't flash empty text during API call
                  if (summaryIntervalRef.current) {
                    clearInterval(summaryIntervalRef.current);
                    summaryIntervalRef.current = null;
                  }

                  setIsGeneratingSummary(true);
                  setShowSummary(true);
                  setCustomerSentiment(null);

                  try {
                    const response = await apiClient.post(`/conversations/${conversation._id}/summary`);

                    if (response.success && response.data) {
                      const adminSummary = response.data.admin_summary || '';
                      const sentiment = response.data.customer_sentiment || null;

                      setSummaryText(adminSummary);
                      setCustomerSentiment(sentiment);

                      // ✅ Reset displayed text only when new response arrives (no flash)
                      let currentIndex = 0;
                      setDisplayedSummary('');
                      
                      summaryIntervalRef.current = setInterval(() => {
                        if (currentIndex < adminSummary.length) {
                          setDisplayedSummary(adminSummary.slice(0, currentIndex + 1));
                          currentIndex++;
                        } else {
                          if (summaryIntervalRef.current) {
                            clearInterval(summaryIntervalRef.current);
                            summaryIntervalRef.current = null;
                          }
                        }
                      }, 15); // Typing speed - adjust for faster/slower
                    } else {
                      toast.error('Failed to generate summary');
                      setShowSummary(false);
                    }
                  } catch (error) {
                    console.error('Error generating summary:', error);
                    toast.error('Failed to generate conversation summary');
                    setShowSummary(false);
                  } finally {
                    setIsGeneratingSummary(false);
                  }
                }}
                disabled={isGeneratingSummary}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm py-1.5 sm:py-2"
                variant="default"
              >
                {isGeneratingSummary ? (
                  <>
                    <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5" />
                    Generate Conversation Summary
                  </>
                )}
              </Button>
            </div>

            {/* Summary Display */}
            {showSummary && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="pt-2 border-t border-border mt-2"
              >
                {/* Sentiment Display */}
                {customerSentiment && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-3 p-2 sm:p-2.5 rounded-md bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-foreground/80">
                        Sentiment:
                      </span>
                      <span className="text-xs sm:text-sm font-medium text-foreground capitalize">
                        {customerSentiment}
                      </span>
                      {/* Bug #21: Normalize to lowercase for consistent emoji matching */}
                      <span className="text-base sm:text-lg">
                        {customerSentiment?.toLowerCase() === 'positive' && '😊'}
                        {customerSentiment?.toLowerCase() === 'negative' && '😞'}
                        {customerSentiment?.toLowerCase() === 'neutral' && '😐'}
                        {!['positive', 'negative', 'neutral'].includes(customerSentiment?.toLowerCase()) && '💭'}
                      </span>
                    </div>
                  </motion.div>
                )}

                {/* Summary Text with Typing Effect */}
                <div className="relative">
                  <div className="max-h-[300px] sm:max-h-[400px] overflow-y-auto p-2 sm:p-3 rounded-md bg-muted/50 border border-border scrollbar-thin">
                    <div className="text-xs sm:text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                      {displayedSummary}
                      {/* Bug #9: Show cursor while typing interval is active, not just while API loading */}
                      {(isGeneratingSummary || displayedSummary.length < summaryText.length) && summaryText.length > 0 && (
                        <span className="inline-block w-1 h-3 sm:h-4 bg-primary animate-pulse ml-0.5">|</span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Deals Section */}
      {/* Bug #17: Aligned condition with query's `enabled: hasSfId` which only checks contact?.SF_id */}
      {hasSfId && (
        <div className="space-y-1.5 sm:space-y-2 pt-1.5 sm:pt-2 border-t border-border">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs sm:text-sm font-semibold text-foreground/80">
                Deals
              </h3>
              {!dealsLoading && deals.length > 0 && (
                <Badge variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
                  {deals.length}
                </Badge>
              )}
            </div>
            {dealsLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-gray-400 flex-shrink-0" />
            )}
          </div>

          {dealsLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          ) : deals.length === 0 ? (
            <div className="text-center py-3 px-2 rounded-md bg-muted/50">
              <Briefcase className="h-5 w-5 mx-auto mb-1 text-gray-400" />
              <p className="text-xs text-muted-foreground">No deals found</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {deals.map((deal) => (
                <motion.div
                  key={deal._id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => {
                    // Open deal details page in a new tab
                    window.open(`/c/deals/${deal._id}`, '_blank', 'noopener,noreferrer');
                  }}
                  className="p-2 rounded-md bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border border-border hover:border-primary/50 dark:hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Deal Name */}
                      <div className="flex items-center gap-1.5 mb-1">
                        <Briefcase className="h-3 w-3 text-primary flex-shrink-0" />
                        <h4 className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors">
                          {deal.name || deal.details?.Name || 'Unnamed Deal'}
                        </h4>
                      </div>

                      {/* Deal Details - Only Name, Stage, and Status */}
                      <div className="space-y-1 ml-4.5">
                        {/* Stage */}
                        {deal.stage && (
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3 w-3 text-gray-400 flex-shrink-0" />
                            <span className="text-[10px] text-muted-foreground">
                              Stage: <span className="font-medium">{deal.stage}</span>
                            </span>
                          </div>
                        )}

                        {/* Status */}
                        {deal.status && (
                          <div className="flex items-center gap-1.5">
                            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                              deal.status?.toLowerCase() === 'won' ? 'bg-green-500' :
                              deal.status?.toLowerCase() === 'lost' ? 'bg-red-500' :
                              'bg-yellow-500'
                            }`} />
                            <span className="text-[10px] text-muted-foreground">
                              Status: <span className="font-medium capitalize">{deal.status}</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Badge */}
                    {deal.status && (
                      <Badge
                        variant={
                          deal.status?.toLowerCase() === 'won' ? 'default' :
                          deal.status?.toLowerCase() === 'lost' ? 'destructive' :
                          'secondary'
                        }
                        className="flex-shrink-0 text-[10px] px-1.5 py-0"
                      >
                        {deal.status}
                      </Badge>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConversationHeader({
  conversation,
  isLoading = false, // ✅ Loading state from parent
  onToggleDetails, // ✅ Callback to toggle details sidebar
  showDetailsSidebar = false, // ✅ Whether details sidebar is open
  isViewOnly = false, // ✅ Disable actions when view-only
  isChatDisabled = false, // ✅ Disable all actions when chat is disabled
}) {
  const [copiedField, setCopiedField] = useState(null);
  const { user } = useAuth();
  
  // Fetch user profile for call center settings
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const response = await apiClient.get('/users/profile');
      return response;
    },
    // enabled: !!user,
    staleTime: 300000, // 5 minutes
  });
  
 
  // Get call center state from store
  const selectedExtension = useCallCenterStore((state) => state.selectedExtension);
  const registrationStatuses = useCallCenterStore((state) => state.registrationStatuses);
  const availableOutboundNumbers = useCallCenterStore((state) => state.availableOutboundNumbers);
  const selectedOutboundNumber = useCallCenterStore((state) => state.selectedOutboundNumber);
  const activeCallIds = useCallCenterStore((state) => state.activeCallIds);
  const phoneNumbers = useCallCenterStore((state) => state.phoneNumbers);
  
  // Get call center actions
  const { handleMakeCall } = useCallCenter();
  
  // Helper function to normalize phone numbers for comparison
  const normalizePhoneForComparison = useCallback((phone) => {
    if (!phone) return '';
    return phone.replace(/\D/g, '').replace(/^0+/, '');
  }, []);

  // ✅ Bug #2: Memoize call state computations instead of recalculating on every render
  const numberAlreadyCalled = useMemo(() => {
    const contactPhone = conversation?.contact?.phone ||
                         conversation?.contact?.identifiers?.phone ||
                         conversation?.contact?.identifiers?.sms;
    if (!contactPhone) return false;
    const normalizedContactPhone = normalizePhoneForComparison(contactPhone);
    for (const [sessionId, phoneNumber] of phoneNumbers.entries()) {
      if (activeCallIds.includes(sessionId)) {
        const normalizedCallPhone = normalizePhoneForComparison(phoneNumber);
        if (normalizedContactPhone && normalizedCallPhone &&
            normalizedContactPhone === normalizedCallPhone) {
          return true;
        }
      }
    }
    return false;
  }, [conversation?.contact, phoneNumbers, activeCallIds, normalizePhoneForComparison]);

  const callEnabled = useMemo(() => {
    const hasCallPermissions = userProfile?.role === "agent" &&
      userProfile?.call_center === "on" &&
      userProfile?.outbound_calls === "yes";
    const hasRegisteredExtension = registrationStatuses
      ? Array.from(registrationStatuses.values()).some(status => status === 'registered')
      : false;
    const hasOutboundNumbers = availableOutboundNumbers.length > 0;
    const hasSelectedOutboundNumber = selectedOutboundNumber !== null;
    const maxActiveCalls = Number(userProfile?.waiting_in_line) || 0;
    const hasReachedCallLimit = activeCallIds.length >= maxActiveCalls;

    return hasCallPermissions && hasRegisteredExtension && hasOutboundNumbers && hasSelectedOutboundNumber && !hasReachedCallLimit && !numberAlreadyCalled;
  }, [userProfile, registrationStatuses, availableOutboundNumbers, selectedOutboundNumber, activeCallIds, numberAlreadyCalled]);

  const showNumberSelect = useMemo(() => {
    const hasCallPermissions = userProfile?.role === "agent" &&
      userProfile?.call_center === "on";
    return hasCallPermissions &&
      (userProfile?.outbound_calls === "yes" || userProfile?.inbound_calls === "yes");
  }, [userProfile]);

  // Handle making a call with proper validation and error handling
  const handleCallClick = useCallback(() => {
    debugLog('Call button clicked');

    if (!selectedExtension) {
      toast.error("No extension is available for making calls");
      return;
    }

    const registrationStatus = registrationStatuses.get(selectedExtension.extension);
    if (registrationStatus !== 'registered') {
      toast.error(`Extension ${selectedExtension.extension} is ${registrationStatus}. Please wait for registration.`);
      return;
    }

    if (!selectedOutboundNumber) {
      toast.error("Please select an outbound number from the dropdown");
      return;
    }

    const contactPhone = conversation?.contact?.phone ||
                         conversation?.contact?.identifiers?.phone ||
                         conversation?.contact?.identifiers?.sms;

    if (!contactPhone) {
      toast.error("No valid phone number found for this contact");
      return;
    }

    debugLog(`Making call to ${contactPhone} using extension ${selectedExtension.extension} and outbound number ${selectedOutboundNumber}`);

    handleMakeCall({
      phoneNumber: contactPhone,
      customOutboundNumber: selectedOutboundNumber
    });
  }, [selectedExtension, registrationStatuses, selectedOutboundNumber, conversation?.contact, handleMakeCall]);

  // Get call status tooltip message — uses memoized values
  const callTooltipMessage = useMemo(() => {
    if (!callEnabled) {
      if (!selectedExtension) return 'No extension available';
      if (!Array.from(registrationStatuses?.values() || []).some(status => status === 'registered')) return 'Extension not registered';
      if (!availableOutboundNumbers.length) return 'No outbound numbers available';
      if (!selectedOutboundNumber) return 'Please select an outbound number';
      if (activeCallIds.length >= Number(userProfile?.waiting_in_line || 0)) return `You have reached the maximum allowed active calls (${userProfile?.waiting_in_line})`;
      if (numberAlreadyCalled) {
        const contactPhone = conversation?.contact?.phone || conversation?.contact?.identifiers?.phone || conversation?.contact?.identifiers?.sms;
        return `Call to ${contactPhone} is already active`;
      }
      return 'Call not available';
    }
    const contactPhone = conversation?.contact?.phone || conversation?.contact?.identifiers?.phone || conversation?.contact?.identifiers?.sms;
    return `Call ${contactPhone} from ${selectedOutboundNumber}`;
  }, [callEnabled, selectedExtension, registrationStatuses, availableOutboundNumbers, selectedOutboundNumber, activeCallIds, userProfile, numberAlreadyCalled, conversation?.contact]);
  
  // ✅ Show loader if conversation is loading or doesn't exist
  // ✅ CRITICAL: Only show loader if conversation is truly missing, not if contact is missing
  // This ensures we always show something in the header, even if contact data is loading
  if (!conversation) {
    return (
      <div className="bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
              <div className="h-3 w-48 bg-muted rounded animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-9 h-9 rounded bg-muted animate-pulse" />
            <div className="w-9 h-9 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    );
  }
  
  // ✅ CRITICAL: Always show conversation header, even if contact is missing
  // Use fallback values instead of showing "Unknown" or "No contact info"
  
  return (
    <>
      <div className={cn(
        "bg-card w-full",
        "transition-all duration-300 ease-in-out"
      )}>
        <div className={cn(
          "flex items-center justify-between w-full",
          showDetailsSidebar ? "gap-1 sm:gap-1.5" : "gap-2 sm:gap-3"
        )}>
          {/* Left: Avatar & Info */}
          <div className={cn(
            "flex items-center flex-1 min-w-0 overflow-hidden",
            showDetailsSidebar ? "gap-1.5 sm:gap-2" : "gap-2 sm:gap-3"
          )}>
            <Avatar className={cn(
              "flex-shrink-0",
              showDetailsSidebar ? "h-9 w-9 sm:h-10 sm:w-10" : "h-10 w-10 sm:h-11 sm:w-11"
            )}>
              <AvatarImage src={conversation.contact?.avatar} />
              <AvatarFallback className={cn(
                "font-semibold bg-gradient-to-br from-primary/20 to-primary/10 text-primary",
                showDetailsSidebar ? "text-sm" : "text-base"
              )}>
                {(() => {
                  // ✅ CRITICAL: Always show a proper initial, never just "U"
                  if (isLoading) return '...';
                  
                  const initial = conversation.contact?.name?.[0]?.toUpperCase() ||
                                 conversation.contact?.displayName?.[0]?.toUpperCase() ||
                                 conversation.contact?.email?.[0]?.toUpperCase() ||
                                 conversation.contact?.phone?.[0]?.toUpperCase() ||
                                 (conversation.channel === 'email' ? 'E' : 
                                  conversation.channel === 'whatsapp' ? 'W' :
                                  conversation.channel === 'sms' ? 'S' :
                                  'C');
                  
                  return initial;
                })()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className={cn(
                "flex items-center mb-0.5 sm:mb-1",
                showDetailsSidebar ? "gap-1" : "gap-1 sm:gap-1.5"
              )}>
                {/* ✅ Action Icons - Responsive sizing */}
                <div className={cn(
                  "flex items-center flex-shrink-0",
                  showDetailsSidebar ? "gap-0.5" : "gap-0.5 sm:gap-1"
                )}>
                  {conversation.isPinned && (
                    <Pin className={cn(
                      "text-blue-600 dark:text-blue-400 flex-shrink-0",
                      showDetailsSidebar ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5 sm:h-4 sm:w-4"
                    )} fill="currentColor" />
                  )}
                  {conversation.isStarred && (
                    <Star className={cn(
                      "text-yellow-500 flex-shrink-0",
                      showDetailsSidebar ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5 sm:h-4 sm:w-4"
                    )} fill="currentColor" />
                  )}
                  {conversation.isMuted && (
                    <BellOff className={cn(
                      "text-muted-foreground flex-shrink-0",
                      showDetailsSidebar ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5 sm:h-4 sm:w-4"
                    )} />
                  )}
                  {conversation.isSnoozed && (
                    <AlarmClock className={cn(
                      "text-orange-500 flex-shrink-0",
                      showDetailsSidebar ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5 sm:h-4 sm:w-4"
                    )} />
                  )}
                </div>
                
                {(() => {
                  // ✅ CRITICAL: Always show a proper name, never "Unknown"
                  if (isLoading) {
                    return (
                      <h2 className={cn(
                        "font-semibold truncate text-foreground min-w-0",
                        showDetailsSidebar ? "text-xs sm:text-sm" : "text-sm sm:text-base"
                      )}>
                        Loading...
                      </h2>
                    );
                  }
                  
                  const contact = conversation.contact || {};
                  const phoneNumber = contact.phone || contact.identifiers?.phone || contact.identifiers?.sms;
                  const shouldFormatPhone = !contact.name && !contact.displayName && phoneNumber && (conversation.channel === 'sms' || conversation.channel === 'whatsapp');
                  
                  if (shouldFormatPhone) {
                    return (
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <PhoneNumberDisplay phone={phoneNumber} />
                      </div>
                    );
                  }
                  
                  // ✅ Priority: name > displayName > email > phone > identifier
                  // Never show generic names like "WhatsApp User", "SMS User", "Email User"
                  const contactName = contact.name || 
                                     contact.displayName ||
                                     contact.email ||
                                     contact.phone ||
                                     contact.identifiers?.email ||
                                     contact.identifiers?.whatsapp ||
                                     contact.identifiers?.sms ||
                                     contact.identifiers?.phone ||
                                     contact.identifiers?.webchat ||
                                     'Contact';
                  
                  return (
                    <h2 className={cn(
                      "font-semibold truncate text-foreground min-w-0",
                      showDetailsSidebar ? "text-xs sm:text-sm" : "text-sm sm:text-base"
                    )}>
                      {contactName}
                    </h2>
                  );
                })()}
              </div>
              
              <div className={cn(
                "flex items-center flex-wrap",
                showDetailsSidebar ? "gap-1 text-[9px] sm:text-[10px]" : "gap-1.5 sm:gap-2 text-[10px] sm:text-xs"
              )}>
                {/* ✅ Bug #3: Use shared getAllMergedChannels helper */}
                {getAllMergedChannels(conversation).map((channel, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className={cn(
                      "border-primary/20 text-primary bg-primary/5 dark:bg-primary/10 dark:text-primary flex-shrink-0",
                      showDetailsSidebar ? "text-[8px] px-1 py-0" : "text-[9px] sm:text-[10px] px-1.5 py-0.5"
                    )}
                  >
                    {channel?.toUpperCase() || 'UNKNOWN'}
                  </Badge>
                ))}
                <span className={cn(
                  "text-muted-foreground truncate min-w-0",
                  showDetailsSidebar ? "max-w-[80px] sm:max-w-[120px] md:max-w-[150px]" : ""
                )}>
                  {(() => {
                    // ✅ CRITICAL: Always show contact info, never "No contact info"
                    if (isLoading) {
                      return 'Loading...';
                    }
                    
                    // ✅ Priority: phone > email > identifier > channel-specific info
                    const contactInfo = conversation.contact?.phone ||
                    conversation.contact?.email ||
                                       conversation.contact?.identifiers?.phone ||
                                       conversation.contact?.identifiers?.email ||
                                       (conversation.channel === 'email' && conversation.contact?.identifiers?.email) ||
                                       (conversation.channel === 'whatsapp' && conversation.contact?.identifiers?.phone) ||
                                       (conversation.channel && `${conversation.channel} conversation`);
                    
                    return contactInfo || 'Contact';
                  })()}
                </span>
              </div>
            </div>
          </div>
          
          {/* Right: Actions - Responsive spacing */}
          <div className={cn(
            "flex items-center flex-shrink-0",
            showDetailsSidebar ? "gap-0.5 sm:gap-1" : "gap-1 sm:gap-2"
          )}>
            {/* Call Center Controls - Responsive */}
            {userProfile && showNumberSelect && (
              <>
                {/* Number Select - Hide on very small screens when sidebar is open */}
                <div className={cn(
                  showDetailsSidebar ? "hidden md:block" : "block"
                )}>
                  <NumberSelect isFromUserProfile={false} userId={userProfile?.user_id} />
                </div>

                {/* Call Button - Only show for outbound calls */}
                {userProfile?.outbound_calls === "yes" && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          type="button"
                          onClick={handleCallClick}
                          disabled={!callEnabled}
                          aria-label={callTooltipMessage}
                          className={cn(
                            "rounded-full flex items-center justify-center transition-all duration-200",
                            "shadow-sm hover:shadow-md flex-shrink-0",
                            !callEnabled
                              ? "bg-gray-400 dark:bg-gray-600 opacity-50 cursor-not-allowed"
                              : "bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700",
                            showDetailsSidebar ? "p-1.5 sm:p-1.5" : "p-2"
                          )}
                          whileHover={{ scale: callEnabled ? 1.05 : 1 }}
                          whileTap={{ scale: callEnabled ? 0.95 : 1 }}
                        >
                          <Phone className={cn(
                            "text-white flex-shrink-0",
                            showDetailsSidebar ? "w-4 h-4" : "w-4 h-4 sm:w-5 sm:h-5"
                          )} />
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">{callTooltipMessage}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </>
            )}
            

            {/* Auto/Manual Mode Toggle - Responsive */}
            <div className={cn(
              "flex-shrink-0 overflow-hidden",
              showDetailsSidebar ? "mr-2 sm:mr-2.5" : "mr-2.5 sm:mr-3"
            )}>
              <ModeToggleButton 
                conversation={conversation} 
                isViewOnly={isViewOnly}
                isChatDisabled={isChatDisabled}
              />
            </div>
            
            {/* Details button - Hidden when sidebar is open */}
            {!showDetailsSidebar && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex-shrink-0 -ml-2 sm:-ml-3"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (onToggleDetails) {
                      onToggleDetails();
                    }
                  }}
                  className={cn(
                    "transition-all duration-200 flex-shrink-0",
                    "hover:bg-primary/10 dark:hover:bg-primary/20",
                    "h-8 w-8 sm:h-9 sm:w-9 p-0 mx-4"
                  )}
                  aria-label="Show details"
                >
                  <Info className="flex-shrink-0 h-4 w-4 sm:h-5 sm:w-5" />
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
      
    </>
  );
}