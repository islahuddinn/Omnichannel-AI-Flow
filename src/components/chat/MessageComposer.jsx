
// src/components/chat/MessageComposer.jsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery,useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { 
  Send, 
  Paperclip, 
  Smile, 
  FileText, 
  AlertTriangle, 
  X,
  Mic,
  Image as ImageIcon,
  Video as VideoIcon,
  File as FileIcon,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  MessageCircle,
  Instagram,
  Share2
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import TemplateSelectionModal from '@/components/modals/TemplateSelectionModal';
import EmojiPicker from './EmojiPicker';
import VoiceRecorder from './VoiceRecorder';
import AttachmentPreview from './AttachmentPreview';
import ChannelIcon from '@/components/shared/ChannelIcon';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { useSocket, useSocketEvent } from '@/hooks/useSocket';
export default function MessageComposer({
  availableAccounts: propAvailableAccounts, // ✅ Accept availableAccounts from props for new conversations 
  conversationId, 
  conversation, 
  onMessageSent,
  contactData,
  channelAccount,
  replyTo,
  onCancelReply,
  disabled = false // ✅ Accept disabled prop to disable all actions
}) {
  const [message, setMessage] = useState('');
  const [emailSubject, setEmailSubject] = useState(''); // Email subject field
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [showTemplateWarning, setShowTemplateWarning] = useState(false);
  const [pendingTemplateMessage, setPendingTemplateMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerPosition, setEmojiPickerPosition] = useState({ top: 0, left: 0 });
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [attachments, setAttachments] = useState([]); // Preview files, not uploaded yet
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false); // Track session check state
  
  const MAX_ATTACHMENTS = 10;
  const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20MB
  
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const sendingRef = useRef(false);
  // Bug 6 fix: Separate file input refs for filtered file pickers
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const queryClient = useQueryClient();
  
  // ✅ Socket connection for real-time updates
  const socketData = useSocket();
  const { socket, isConnected } = socketData;

  // ✅ Valid channel types (for validation)
  const validChannels = ['whatsapp', 'sms', 'email', 'facebook', 'instagram', 'webchat'];
  
  // ✅ Channel colors for styling (icons now come from ChannelIcon component)
  const channelColors = {
    whatsapp: 'text-green-500',
    sms: 'text-blue-500',
    email: 'text-gray-500',
    facebook: 'text-blue-600',
    instagram: 'text-pink-500',
    webchat: 'text-purple-500'
  };
  
  const channelNames = {
    whatsapp: 'WhatsApp',
    sms: 'SMS',
    email: 'Email',
    facebook: 'Facebook',
    instagram: 'Instagram',
    webchat: 'Webchat'
  };

  // ✅ Determine channel type (for new conversations, check channelAccount prop)
  const effectiveChannel = conversation?.channel || channelAccount?.type;
  // ✅ Check if it's an email conversation - use direct channel check for reliability
  const isEmailChannel = effectiveChannel === 'email' || conversation?.channel === 'email';
  // ✅ Call conversations: no text/voice input — show disabled state only
  // BUT if conversation is merged with a messaging-capable channel (whatsapp, sms, email, etc.),
  // allow messaging since the user can send messages via the merged channel
  const isCallConversation = (() => {
    if (conversation?.channel !== 'call') return false;
    // Check if merged with any messaging-capable channel
    if (conversation?.isMerged && conversation?.mergedConversations?.length > 0) {
      const hasMessagingChannel = conversation.mergedConversations.some(
        merged => merged?.channel && validChannels.includes(merged.channel)
      );
      if (hasMessagingChannel) return false; // Allow messaging via merged channel
    }
    return true; // Pure call conversation — disable messaging
  })();

  // ✅ Extract departmentId from the conversation to filter accounts by department
  // department can be a populated object { _id, name } or a raw ObjectId string
  const conversationDepartmentId = (() => {
    const dept = conversation?.department;
    if (!dept) return null;
    if (typeof dept === 'object' && dept._id) return dept._id.toString();
    if (typeof dept === 'string') return dept;
    return dept.toString();
  })();
  
  // ✅ Check if conversation is merged
  const isMerged = conversation?.isMerged && conversation?.mergedConversations?.length > 0;
  
  // ✅ CRITICAL: Also check conversation cache directly for real-time updates
  // This ensures isMerged updates immediately when cache is updated via socket events
  const cachedConversation = queryClient.getQueryData(['conversation', conversationId]);
  const effectiveIsMerged = cachedConversation?.data?.isMerged && 
                            cachedConversation?.data?.mergedConversations?.length > 0;
  const finalIsMerged = effectiveIsMerged || isMerged;
  
  // ✅ Use cached conversation data if available and more up-to-date
  const effectiveConversation = cachedConversation?.data || conversation;
  
  // ✅ Get all unique merged channels (primary + merged)
  const mergedChannels = finalIsMerged ? (() => {
    const channels = new Map();
    // Add primary conversation channel
    if (effectiveConversation?.channel && validChannels.includes(effectiveConversation.channel)) {
      channels.set(effectiveConversation.channel, {
        channel: effectiveConversation.channel,
        channelAccount: effectiveConversation.channelAccount
      });
    }
    // Add all merged conversation channels
    if (effectiveConversation?.mergedConversations) {
      effectiveConversation.mergedConversations.forEach(merged => {
        if (merged?.channel && validChannels.includes(merged.channel) && !channels.has(merged.channel)) {
          channels.set(merged.channel, {
            channel: merged.channel,
            channelAccount: merged.channelAccount
          });
        }
      });
    }
    return Array.from(channels.values());
  })() : [];
  
  // ✅ State for merged channel accounts (updated via sockets, no API calls)
  const [mergedAccountsState, setMergedAccountsState] = useState([]);
  const [loadingMergedAccounts, setLoadingMergedAccounts] = useState(false);
  
  // ✅ For merged conversations, also resolve departmentId from cached conversation
  const effectiveDepartmentId = (() => {
    const dept = effectiveConversation?.department;
    if (!dept) return conversationDepartmentId;
    if (typeof dept === 'object' && dept._id) return dept._id.toString();
    if (typeof dept === 'string') return dept;
    return dept.toString();
  })();

  // ✅ Get available accounts for merged conversations - fetch accounts for ALL merged channels (only once on mount)
  // ✅ Filter by conversation's departmentId so only that department's accounts appear
  const { data: mergedAccountsData, isLoading: loadingMergedAccountsInitial, error: mergedAccountsError } = useQuery({
    queryKey: ['merged-channel-accounts', mergedChannels.map(c => c.channel).sort().join(','), effectiveDepartmentId],
    queryFn: async () => {
      setLoadingMergedAccounts(true);
      try {
        console.log('🔄 Fetching accounts for merged channels:', mergedChannels.map(c => c.channel), 'departmentId:', effectiveDepartmentId);
        
        // Fetch accounts for all merged channels in parallel
        const accountPromises = mergedChannels.map(async (mergedChannel) => {
          try {
            const params = { type: mergedChannel.channel, status: 'active' };
            if (effectiveDepartmentId) {
              params.departmentId = effectiveDepartmentId;
            }
            const response = await apiClient.get('/channels', { params });
            console.log(`✅ Fetched accounts for ${mergedChannel.channel}:`, response?.data?.length || 0);
            return {
              channel: mergedChannel.channel,
              accounts: response?.data || []
            };
          } catch (error) {
            console.error(`❌ Error fetching accounts for channel ${mergedChannel.channel}:`, error);
            return {
              channel: mergedChannel.channel,
              accounts: []
            };
          }
        });
        const results = await Promise.all(accountPromises);
        // Flatten all accounts with their channel info
        const allAccounts = [];
        results.forEach(result => {
          result.accounts.forEach(account => {
            allAccounts.push({
              ...account,
              channel: result.channel // ✅ Add channel info to each account
            });
          });
        });
        console.log(`✅ Total merged accounts loaded: ${allAccounts.length}`);
        setMergedAccountsState(allAccounts);
        return allAccounts;
      } catch (error) {
        console.error('❌ Error fetching merged accounts:', error);
        setMergedAccountsState([]);
        return [];
      } finally {
        setLoadingMergedAccounts(false);
      }
    },
    enabled: finalIsMerged && mergedChannels.length > 0 && conversationId !== 'new',
    staleTime: 30000, // ✅ Reduced from Infinity to allow refresh if needed
    gcTime: 600000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: 2, // ✅ Retry failed requests
    retryDelay: 1000, // ✅ Wait 1s between retries
  });
  
  // ✅ Listen to channel account updates via sockets (no API calls)
  useSocketEvent('channel:accounts:updated', useCallback((data) => {
    if (!finalIsMerged || !data) return;
    
    // ✅ Update accounts for the specific channel
    const { channel, accounts } = data;
    if (channel && accounts) {
      setMergedAccountsState(prev => {
        // Remove old accounts for this channel
        const filtered = prev.filter(acc => (acc.channel || acc.type) !== channel);
        // Add new accounts with channel info
        const newAccounts = accounts.map(account => ({
          ...account,
          channel: channel
        }));
        return [...filtered, ...newAccounts];
      });
    }
  }, [finalIsMerged]));
  
  // Get available accounts (ONCE, then cache forever via Socket.IO updates)
  // ✅ Always fetch for existing conversations, and for new conversations only if channelAccount not provided
  // ✅ Filter by conversation's departmentId so only that department's accounts appear
  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ['channel-accounts', effectiveChannel, conversationDepartmentId],
    queryFn: () => {
      const params = { type: effectiveChannel, status: 'active' };
      if (conversationDepartmentId) {
        params.departmentId = conversationDepartmentId;
      }
      return apiClient.get('/channels', { params });
    },
    enabled: !!effectiveChannel && !finalIsMerged && (conversationId !== 'new' || !channelAccount), // ✅ Only fetch for non-merged conversations OR new conversations without channelAccount
    staleTime: Infinity, // ✅ Never refetch automatically
    gcTime: 600000, // Cache for 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // ✅ For merged conversations, use accounts from socket state OR initial query data
  // For new conversations, use propAvailableAccounts if provided (from API response), otherwise fall back to channelAccount or fetched accounts
  const availableAccounts = finalIsMerged 
    ? (mergedAccountsState.length > 0 
        ? mergedAccountsState 
        : (mergedAccountsData && Array.isArray(mergedAccountsData) && mergedAccountsData.length > 0 
            ? mergedAccountsData 
            : [])) // ✅ Use socket-updated accounts or initial data, ensure it's always an array
    : (conversationId === 'new' && propAvailableAccounts && Array.isArray(propAvailableAccounts) && propAvailableAccounts.length > 0
      ? propAvailableAccounts // ✅ Use availableAccounts from API response (all accounts for the channel type)
      : (conversationId === 'new' && channelAccount
        ? [channelAccount] // ✅ Fallback to single channelAccount if availableAccounts not provided
        : (accountsData?.data || []))); // ✅ For existing conversations, use fetched accounts
  
  // ✅ Determine loading state - don't show loading if we have cached data or socket state
  const isLoadingAllAccounts = finalIsMerged 
    ? (loadingMergedAccountsInitial && !mergedAccountsData && mergedAccountsState.length === 0 && !mergedAccountsError)
    : (loadingAccounts && !accountsData);
  
  // ✅ For merged conversations OR email conversations, ALWAYS show "Send from"
  // For other channels, show "Send from" if multiple accounts are available OR if only one account but user wants to see it
  // ✅ Check directly from conversation.channel first for reliability
  const shouldShowSendFrom = finalIsMerged || effectiveConversation?.channel === 'email' 
    ? true  // Always show for merged conversations and email conversations
    : (effectiveChannel && availableAccounts.length > 0); // ✅ Show for ANY channel if accounts are available

  // ✅ Helper: Resolve the correct channelAccountId for a given channel in a merged conversation
  // Prefers the account stored in mergedConversations (the actual account used for that channel)
  // Falls back to first matching account from API-fetched availableAccounts
  const resolveAccountForChannel = useCallback((channel, allAccounts) => {
    if (!channel || !finalIsMerged) return null;

    // ✅ PRIORITY 1: Use the channelAccount from mergedChannels (from conversation data)
    // This is the CORRECT account that was originally used for this channel
    const mergedChannelEntry = mergedChannels.find(c => c.channel === channel);
    if (mergedChannelEntry?.channelAccount) {
      const preferredId = mergedChannelEntry.channelAccount?._id || mergedChannelEntry.channelAccount;
      const preferredIdStr = String(preferredId);

      // Verify it exists in available accounts
      const matchInAccounts = allAccounts?.find(acc => String(acc._id) === preferredIdStr);
      if (matchInAccounts) {
        return matchInAccounts._id;
      }
      // If not in fetched accounts list, still use it (it's the conversation's actual account)
      return preferredIdStr;
    }

    // ✅ PRIORITY 2: First API-fetched account for this channel
    if (allAccounts?.length > 0) {
      const channelAccounts = allAccounts.filter(acc => {
        const accChannel = acc.channel || acc.type;
        return accChannel === channel;
      });
      if (channelAccounts.length > 0) {
        return channelAccounts[0]._id;
      }
    }

    return null;
  }, [finalIsMerged, mergedChannels]);

  // ✅ CRITICAL: Track manual channel selection to prevent auto-updates
  const [isManualChannelSelection, setIsManualChannelSelection] = useState(false);
  
  // ✅ CRITICAL: Track manual account selection to prevent auto-updates
  const [isManualAccountSelection, setIsManualAccountSelection] = useState(false);

  // Track whether selectedChannel was set from lastMessage (to avoid overriding with fallback)
  const [channelSetFromLastMessage, setChannelSetFromLastMessage] = useState(false);

  // Bug 12 fix: Pre-fill email subject with "Re:" when replying to an email
  useEffect(() => {
    if (replyTo && isEmailChannel && replyTo.emailData?.subject) {
      const subject = replyTo.emailData.subject;
      // Only add "Re:" prefix if not already present
      const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
      setEmailSubject(reSubject);
    }
  }, [replyTo, isEmailChannel]);

  // Auto-focus composer textarea when reply is triggered
  useEffect(() => {
    if (replyTo && textareaRef.current) {
      // Small delay to ensure DOM has updated with reply preview
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  }, [replyTo]);

  // Reset manual selections when conversation changes
  useEffect(() => {
    setIsManualChannelSelection(false);
    setIsManualAccountSelection(false);
    setChannelSetFromLastMessage(false);
    // ✅ CRITICAL: Don't auto-clear template warning when conversation changes
    // Only clear if user explicitly dismisses or sends a template
    // The warning state will be managed by explicit user actions or template send success
  }, [conversationId]);
  
  // ✅ CRITICAL: Get the LATEST message from conversation - ONLY on mount/reconnect, NO polling
  // Socket updates handle real-time message updates, no need for polling
  const { data: lastMessageData } = useQuery({
    queryKey: ['last-message', conversationId],
    queryFn: async () => {
      // ✅ Fetch the latest message (most recent by createdAt, regardless of direction)
      const response = await apiClient.get(`/messages/${conversationId}?limit=1&sort=-createdAt`);
      return response;
    },
    enabled: !!conversationId && conversationId !== 'new',
    staleTime: 300000, // ✅ 5 minutes - socket updates handle real-time
    gcTime: 600000, // Cache for 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true, // ✅ Only refetch on mount
    refetchOnReconnect: true, // ✅ Only refetch on reconnect
    // ❌ REMOVED: refetchInterval - NO polling, socket updates handle real-time
  });
  
  // ✅ State for last message (updated via sockets)
  const [lastMessageState, setLastMessageState] = useState(null);
  
  // ✅ For merged conversations, determine default channel based on last message
  const [selectedChannel, setSelectedChannel] = useState(null);
  
  // ✅ Listen to new messages via sockets to update default channel in real-time
  // BUT: Only auto-update if user hasn't manually selected a channel
  useSocketEvent('message:new', useCallback((data) => {
    if (!data) return;
    
    // ✅ Extract message from event data
    const messageData = data.message || data;
    const messageConvId = String(data.conversationId || messageData.conversation || messageData.conversationId || '');
    const currentConvId = String(conversationId || '');
    
    // ✅ Check if message is for this conversation (including merged conversations)
    const isFromMergedConversation = finalIsMerged && 
      effectiveConversation?.mergedConversations?.some(mc => String(mc.conversationId) === messageConvId);
    const isDirectMatch = messageConvId === currentConvId;
    const shouldProcess = isDirectMatch || isFromMergedConversation;
    
    if (!shouldProcess) return;
    
    // ✅ CRITICAL: Determine message channel - USE ONLY THE ACTUAL CHANNEL FIELD
    // The backend now ALWAYS includes the channel field, so we should trust it completely
    // Fallback detection caused issues (WhatsApp messages being detected as email)
    let detectedChannel = messageData.channel;
    
    // ✅ ONLY use fallback detection if channel field is truly missing (shouldn't happen with backend fix)
    if (!detectedChannel || detectedChannel === 'undefined' || detectedChannel === 'null' || detectedChannel === undefined) {
      // ✅ First check channelAccount type (most reliable fallback)
      if (messageData.channelAccount?.type) {
        detectedChannel = messageData.channelAccount.type;
        console.log('⚠️ Channel field missing, using channelAccount.type:', detectedChannel);
      }
      // ✅ NEVER use emailData as indicator - it can be present in non-email messages
      // ✅ Fallback to conversation channel for merged conversations
      else if (finalIsMerged && effectiveConversation?.channel) {
        detectedChannel = effectiveConversation.channel;
        console.log('⚠️ Channel field missing, using conversation.channel:', detectedChannel);
      }
      // ✅ Last resort: don't change channel if we can't detect it
      else {
        console.warn('⚠️ Cannot detect channel from message, keeping current selection');
        return; // Don't update channel if we can't detect it reliably
      }
    }
    
    // ✅ VALIDATION: Ensure detected channel matches the actual message
    // WhatsApp messages should NEVER be detected as email
    if (detectedChannel === 'email' && messageData.channel === 'whatsapp') {
      console.error('❌ CRITICAL: WhatsApp message incorrectly detected as email! Using actual channel.');
      detectedChannel = 'whatsapp';
    }
    
    console.log('🔄 MessageComposer: New message received, updating channel selection:', {
      messageChannel: detectedChannel,
      originalChannel: messageData.channel,
      hasEmailData: !!messageData.emailData,
      channelAccountType: messageData.channelAccount?.type,
      currentSelectedChannel: selectedChannel,
      isManualSelection: isManualChannelSelection,
      isMerged: finalIsMerged,
      conversationId: currentConvId,
      messageConvId
    });
    
    // ✅ Update last message state when new message arrives (with detected channel)
    const messageWithChannel = {
      ...messageData,
      channel: detectedChannel || messageData.channel
    };
    setLastMessageState(messageWithChannel);
    
    // ✅ CRITICAL: Auto-select channel from latest message ONLY if user hasn't manually selected
    // If user manually selected a channel, respect their choice and don't auto-update
    if (!isManualChannelSelection && detectedChannel && finalIsMerged) {
      // ✅ For merged conversations, ALWAYS update channel if it's in merged channels
      const isValidChannel = mergedChannels.some(c => c.channel === detectedChannel);
      if (isValidChannel && detectedChannel !== selectedChannel) {
        // ✅ Update channel IMMEDIATELY - no conditions, just update
        setSelectedChannel(detectedChannel);
        console.log('✅ AUTO-Updated selectedChannel for merged conversation:', detectedChannel);
      }
    } else if (!isManualChannelSelection && detectedChannel && !finalIsMerged) {
      // ✅ For non-merged conversations, also update if channel matches conversation
      if (detectedChannel === effectiveConversation?.channel && detectedChannel !== selectedChannel) {
        setSelectedChannel(detectedChannel);
        console.log('✅ AUTO-Updated selectedChannel for non-merged conversation:', detectedChannel);
      }
    } else if (isManualChannelSelection) {
      console.log('ℹ️ Manual channel selection active, skipping auto-update');
    }
    
    // ✅ CRITICAL: Auto-select account from incoming message (ALWAYS, regardless of manual selection)
    // This ensures the account that received the message is automatically selected
    // Use detectedChannel (which may be detected from emailData or channelAccount)
    const channelForAccount = detectedChannel || (messageData.channelAccount?.type);
    
    // ✅ CRITICAL: For both merged and non-merged conversations, auto-select account from incoming message
    // This ensures the account that received the message is automatically selected
    if (messageData.channelAccount && messageData.direction === 'inbound') {
      const messageAccountId = messageData.channelAccount._id || messageData.channelAccount;
      
      // ✅ Check if this account is available in availableAccounts
      const allAvailableAccounts = finalIsMerged 
        ? (mergedAccountsState.length > 0 ? mergedAccountsState : (mergedAccountsData || []))
        : availableAccounts;
      
      const matchingAccount = allAvailableAccounts.find(acc => 
        acc._id === messageAccountId || 
        String(acc._id) === String(messageAccountId) ||
        acc._id === messageAccountId
      );
      
      if (matchingAccount && matchingAccount._id !== selectedAccountId) {
        setSelectedAccountId(matchingAccount._id);
        // ✅ Reset manual selection flag when auto-selecting from incoming message
        // This allows future incoming messages to auto-update the account
        setIsManualAccountSelection(false);
        console.log('✅ AUTO-Updated selectedAccountId to match incoming message channel account:', {
          accountId: matchingAccount._id,
          accountName: matchingAccount.name,
          channel: matchingAccount.channel || matchingAccount.type,
          isMerged: finalIsMerged,
          conversationId: currentConvId
        });
      }
    } else if (finalIsMerged && channelForAccount) {
      // ✅ Fallback for merged conversations: select first account for the channel
      const allAvailableAccounts = mergedAccountsState.length > 0 
        ? mergedAccountsState 
        : (mergedAccountsData || []);
      
      if (allAvailableAccounts.length > 0) {
        const channelAccounts = allAvailableAccounts.filter(acc => {
          const accChannel = acc.channel || acc.type;
          return accChannel === channelForAccount;
        });
        
        if (channelAccounts.length > 0 && !isManualAccountSelection) {
          // ✅ Only auto-update account if user hasn't manually selected one
          const matchingAccount = messageData.channelAccount 
            ? channelAccounts.find(acc => 
                acc._id === messageData.channelAccount?._id || 
                acc._id === messageData.channelAccount
              )
            : null;
          
          if (matchingAccount && matchingAccount._id !== selectedAccountId) {
            setSelectedAccountId(matchingAccount._id);
            setIsManualAccountSelection(false);
            console.log('✅ AUTO-Updated selectedAccountId to match message channel account:', matchingAccount._id);
          } else if (channelAccounts[0] && channelAccounts[0]._id !== selectedAccountId) {
            setSelectedAccountId(channelAccounts[0]._id);
            setIsManualAccountSelection(false);
            console.log('✅ AUTO-Updated selectedAccountId to first available account for channel:', channelAccounts[0]._id);
          }
        }
      }
    }
  }, [finalIsMerged, conversationId, effectiveConversation?.mergedConversations, mergedChannels, mergedAccountsState, mergedAccountsData, selectedChannel, selectedAccountId, isManualChannelSelection, isManualAccountSelection]));

  // ✅ CRITICAL: Get the most recent message - PRIORITIZE socket state (real-time) over query data
  // Socket state has the latest message we just received/sent, query data may be stale
  const lastMessage = lastMessageState || lastMessageData?.data?.[0];
  
  // ✅ Also watch for lastMessage changes via socket to ensure we always have the latest
  useEffect(() => {
    // This effect ensures lastMessageState is always the most recent
    if (lastMessageState) {
      console.log('🔄 LastMessageState updated:', {
        channel: lastMessageState.channel,
        hasEmailData: !!lastMessageState.emailData,
        channelAccountType: lastMessageState.channelAccount?.type
      });
    }
  }, [lastMessageState]);
  
  // ✅ Determine default channel and account based on last message
  const defaultChannel = lastMessage?.channel || conversation?.channel || effectiveChannel;
  const defaultChannelAccountId = lastMessage?.channelAccount?._id || lastMessage?.channelAccount;

  // Listen to conversation merge updates via sockets
  useSocketEvent('conversation:merged', useCallback((data) => {
    if (!data || String(data.primaryConversationId) !== String(conversationId)) return;

    const { updatedPrimaryConversation } = data;
    if (!updatedPrimaryConversation) return;

    // Update conversation cache immediately so isMerged and mergedChannels update
    queryClient.setQueryData(['conversation', conversationId], (old) => {
      if (!old) return old;
      return {
        ...old,
        data: {
          ...old.data,
          ...updatedPrimaryConversation,
          isMerged: true,
          mergedConversations: updatedPrimaryConversation.mergedConversations || []
        }
      };
    });

    // Extract all unique channels from the merged conversation
    const mergedChannelsList = [];
    if (updatedPrimaryConversation.channel && validChannels.includes(updatedPrimaryConversation.channel)) {
      mergedChannelsList.push(updatedPrimaryConversation.channel);
    }
    if (updatedPrimaryConversation.mergedConversations) {
      updatedPrimaryConversation.mergedConversations.forEach(mc => {
        if (mc?.channel && validChannels.includes(mc.channel) && !mergedChannelsList.includes(mc.channel)) {
          mergedChannelsList.push(mc.channel);
        }
      });
    }

    // Directly fetch accounts for all merged channels so the UI updates instantly
    if (mergedChannelsList.length > 0) {
      const deptId = updatedPrimaryConversation.department?._id || updatedPrimaryConversation.department || effectiveDepartmentId;
      Promise.all(
        mergedChannelsList.map(async (ch) => {
          try {
            const params = { type: ch, status: 'active' };
            if (deptId) params.departmentId = deptId;
            const response = await apiClient.get('/channels', { params });
            return (response?.data || []).map(acc => ({ ...acc, channel: ch }));
          } catch { return []; }
        })
      ).then(results => {
        const allAccounts = results.flat();
        setMergedAccountsState(allAccounts);
        const sortedKey = mergedChannelsList.sort().join(',');
        queryClient.setQueryData(['merged-channel-accounts', sortedKey, deptId || ''], allAccounts);
      });

      // Set default channel to last message's channel or primary channel
      if (!isManualChannelSelection) {
        const lastMsgChannel = lastMessage?.channel || lastMessage?.channelAccount?.type;
        const defaultCh = (lastMsgChannel && mergedChannelsList.includes(lastMsgChannel))
          ? lastMsgChannel
          : mergedChannelsList[0];
        setSelectedChannel(defaultCh);
      }
    }
  }, [conversationId, queryClient, effectiveDepartmentId, isManualChannelSelection, lastMessage]));

  // Initialize selectedChannel from last message or conversation channel (for merged conversations)
  useEffect(() => {
    if (isManualChannelSelection || !finalIsMerged) return;

    // Detect last message's channel
    let channelFromLastMessage = lastMessage?.channel;
    if ((!channelFromLastMessage || channelFromLastMessage === 'undefined' || channelFromLastMessage === 'null') && lastMessage?.channelAccount?.type) {
      channelFromLastMessage = lastMessage.channelAccount.type;
    }

    // If lastMessage channel is valid in mergedChannels, always prefer it
    if (channelFromLastMessage && mergedChannels.some(c => c.channel === channelFromLastMessage)) {
      if (channelFromLastMessage !== selectedChannel) {
        setSelectedChannel(channelFromLastMessage);
        setChannelSetFromLastMessage(true);
      }
      return;
    }

    // Fallback: only set from conversation channel if lastMessage hasn't been loaded yet
    // and we haven't set from lastMessage before
    if (!selectedChannel && !channelSetFromLastMessage && effectiveConversation?.channel) {
      setSelectedChannel(effectiveConversation.channel);
    }
  }, [finalIsMerged, effectiveConversation?.channel, selectedChannel, isManualChannelSelection, lastMessage, mergedChannels, channelSetFromLastMessage]);
  
  // Set default account and channel based on last message
  useEffect(() => {
    // ✅ CRITICAL: Don't auto-update channel if user has manually selected one
    if (isManualChannelSelection) {
      console.log('ℹ️ Manual channel selection active, skipping auto-update from last message');
      return;
    }
    
    if (availableAccounts.length > 0 || finalIsMerged) {
      let defaultAccountId = '';
      let defaultChannelValue = null;
      
      // ✅ For new conversations, use channelAccount if provided
      if (conversationId === 'new' && channelAccount?._id) {
        defaultAccountId = channelAccount._id;
        defaultChannelValue = channelAccount.type;
        
        // ✅ CRITICAL: For new WhatsApp conversations, show template warning immediately
        // Don't check session (it will always be false for new conversations)
        // Just show the warning so user knows they need a template
        if (channelAccount.type === 'whatsapp' || channelAccount.channel === 'whatsapp') {
          // Only set warning if not already set (to prevent flickering)
          if (!showTemplateWarning) {
            setShowTemplateWarning(true);
            console.log('✅ Showing template warning for new WhatsApp conversation');
          }
        }
      } 
      // ✅ For merged conversations: use last message's channel and account if available
      else if (finalIsMerged) {
        // ✅ CRITICAL: Always use last message's channel if available (real-time updates)
        // PRIORITIZE the actual channel field first, then use fallbacks
        let lastMessageChannel = lastMessage?.channel;
        
        // ✅ ONLY use fallback detection if channel field is truly missing
        if ((!lastMessageChannel || lastMessageChannel === 'undefined' || lastMessageChannel === 'null') && lastMessage) {
          // ✅ First check channelAccount type (more reliable)
          if (lastMessage.channelAccount?.type) {
            lastMessageChannel = lastMessage.channelAccount.type;
          }
          // ✅ Then check if it's an email by looking for emailData (ONLY if channelAccount.type is missing)
          // Email messages have emailData, WhatsApp messages don't
          else if (!lastMessage.channelAccount?.type && lastMessage.emailData) {
            lastMessageChannel = 'email';
          }
        }
        
        if (lastMessageChannel) {
          defaultChannelValue = lastMessageChannel;
          console.log('🔄 Setting channel from last message:', defaultChannelValue);
          
          // ✅ Update selectedChannel immediately when lastMessage changes (only if not manually selected)
          if (defaultChannelValue !== selectedChannel) {
            setSelectedChannel(defaultChannelValue);
            console.log('✅ AUTO-Updated selectedChannel from last message:', defaultChannelValue);
          }
        } else {
          // Fallback to conversation channel if no last message
          defaultChannelValue = conversation?.channel || defaultChannel;
        }
        
        // ✅ Find account matching last message's channel
        if (availableAccounts.length > 0 && defaultChannelValue) {
          const matchingAccount = availableAccounts.find(acc => {
            const accChannel = acc.channel || acc.type;
            return accChannel === defaultChannelValue && 
                   (acc._id === defaultChannelAccountId || 
                    acc._id === (lastMessage?.channelAccount?._id || lastMessage?.channelAccount));
          });
          
          if (matchingAccount) {
            defaultAccountId = matchingAccount._id;
          } else {
            // ✅ Fallback: Find any account matching the last message's channel
            const channelAccountMatch = availableAccounts.find(acc => {
              const accChannel = acc.channel || acc.type;
              return accChannel === defaultChannelValue;
            });
            if (channelAccountMatch) {
              defaultAccountId = channelAccountMatch._id;
            }
          }
        }
      }
      // ✅ For non-merged conversations: use last message's channel account if available
      else if (defaultChannelAccountId && availableAccounts.some(acc => acc._id === defaultChannelAccountId)) {
        defaultAccountId = defaultChannelAccountId;
      } 
      // ✅ CRITICAL: Always prioritize last inbound message's account (the account that received the message)
      else if (lastMessage?.direction === 'inbound' && lastMessage?.channelAccount) {
        defaultAccountId = lastMessage.channelAccount._id || lastMessage.channelAccount;
      } 
      // ✅ Fallback to conversation's channel account
      else if (conversation?.channelAccount) {
        defaultAccountId = conversation.channelAccount._id || conversation.channelAccount;
      } 
      // ✅ Final fallback: first available account
      else if (availableAccounts[0]?._id) {
        defaultAccountId = availableAccounts[0]._id;
        defaultChannelValue = availableAccounts[0].channel || availableAccounts[0].type;
      }

      // ✅ CRITICAL: Auto-update account from last message if it's an inbound message (received message)
      // This ensures the account that received the latest message is always selected
      // Works for both merged and non-merged conversations
      if (lastMessage?.direction === 'inbound' && lastMessage?.channelAccount && !isManualAccountSelection) {
        const lastMessageAccountId = lastMessage.channelAccount._id || lastMessage.channelAccount;
        
        // ✅ Check in appropriate accounts list based on conversation type
        const accountsToCheck = finalIsMerged 
          ? (mergedAccountsState.length > 0 ? mergedAccountsState : (mergedAccountsData || []))
          : availableAccounts;
        
        if (lastMessageAccountId && accountsToCheck.some(acc => 
          acc._id === lastMessageAccountId || 
          String(acc._id) === String(lastMessageAccountId)
        )) {
          setSelectedAccountId(lastMessageAccountId);
          console.log('✅ AUTO-Updated selectedAccountId from last inbound message:', {
            accountId: lastMessageAccountId,
            isMerged: finalIsMerged,
            conversationId
          });
        }
      } else if (!isManualAccountSelection) {
        // ✅ Fallback: Use default account if no inbound message
        if (defaultAccountId && availableAccounts.length > 0 && availableAccounts.some(acc => acc._id === defaultAccountId)) {
          setSelectedAccountId(defaultAccountId);
          // ✅ CRITICAL: For new WhatsApp conversations, ensure template warning is shown
          if (conversationId === 'new' && defaultChannelValue === 'whatsapp' && !showTemplateWarning) {
            setShowTemplateWarning(true);
            console.log('✅ Showing template warning for new WhatsApp conversation (default account)');
          }
        } else if (defaultAccountId && finalIsMerged && defaultChannelValue) {
          // ✅ For merged conversations, set account even if accounts are still loading
          setSelectedAccountId(defaultAccountId);
          // ✅ CRITICAL: Don't auto-clear template warning when account is auto-selected
        }
      } else {
        console.log('ℹ️ Manual account selection active, skipping auto-update from last message');
      }
      
      // ✅ CRITICAL: For merged conversations, ALWAYS update channel from last message INSTANTLY (real-time)
      // This ensures channel updates even when socket event hasn't fired yet
      // BUT: Only if user hasn't manually selected a channel
      if (finalIsMerged && lastMessage && !isManualChannelSelection) {
        // ✅ Determine channel from last message - PRIORITIZE actual channel field
        let lastMessageChannel = lastMessage.channel;
        
        // ✅ ONLY use fallback detection if channel field is truly missing
        if (!lastMessageChannel || lastMessageChannel === 'undefined' || lastMessageChannel === 'null') {
          // ✅ First check channelAccount type (more reliable)
          if (lastMessage.channelAccount?.type) {
            lastMessageChannel = lastMessage.channelAccount.type;
          }
          // ✅ Then check if it's an email by looking for emailData (ONLY if channelAccount.type is missing)
          // Email messages have emailData, WhatsApp messages don't
          else if (!lastMessage.channelAccount?.type && lastMessage.emailData) {
            lastMessageChannel = 'email';
          }
          // ✅ Fallback to conversation channel
          else if (conversation?.channel) {
            lastMessageChannel = conversation.channel;
          }
        }
        
        if (lastMessageChannel) {
          const isValidChannel = mergedChannels.some(c => c.channel === lastMessageChannel);
          if (isValidChannel && lastMessageChannel !== selectedChannel) {
            setSelectedChannel(lastMessageChannel);
            console.log('✅ AUTO-Updated selectedChannel from lastMessage effect:', lastMessageChannel);
          }
        }
      } else if (finalIsMerged && lastMessage && isManualChannelSelection) {
        console.log('ℹ️ Manual channel selection active, skipping auto-update from lastMessage effect');
      } else if (defaultChannelValue && !selectedChannel) {
        // Set default channel if not set yet (non-merged)
        setSelectedChannel(defaultChannelValue);
      }
    }
  }, [availableAccounts, lastMessage, effectiveConversation, defaultChannelAccountId, finalIsMerged, selectedChannel, defaultChannel, mergedChannels, isManualChannelSelection, isManualAccountSelection]);
  
  // ✅ When channel changes in merged conversation, update available accounts and selected account INSTANTLY
  useEffect(() => {
    if (finalIsMerged && selectedChannel) {
      // ✅ Get accounts from both state and query data for immediate updates
      const allAvailableAccounts = mergedAccountsState.length > 0
        ? mergedAccountsState
        : (mergedAccountsData || []);

      // ✅ Check if current account already matches selected channel
      const currentAccount = allAvailableAccounts.find(acc => String(acc._id) === String(selectedAccountId));
      const currentChannel = currentAccount ? (currentAccount.channel || currentAccount.type) : null;

      // ✅ Only update if current account doesn't match selected channel
      if (!currentAccount || currentChannel !== selectedChannel) {
        if (!isManualAccountSelection || (isManualAccountSelection && currentChannel !== selectedChannel)) {
          // ✅ CRITICAL: Use resolveAccountForChannel to get the CORRECT account
          // This prefers the account from mergedConversations (the actual account for this channel)
          const resolvedAccountId = resolveAccountForChannel(selectedChannel, allAvailableAccounts);

          if (resolvedAccountId && String(resolvedAccountId) !== String(selectedAccountId)) {
            setSelectedAccountId(resolvedAccountId);
            // ✅ If manually selected account didn't match channel, reset manual flag
            if (isManualAccountSelection && currentChannel !== selectedChannel) {
              setIsManualAccountSelection(false);
            }
            console.log('✅ INSTANTLY Updated account when channel changed:', {
              newChannel: selectedChannel,
              newAccountId: resolvedAccountId,
              wasManual: isManualAccountSelection
            });
          }
        } else {
          console.log('ℹ️ Manual account selection active and account matches channel, skipping auto-update');
        }
      }
    }
  }, [selectedChannel, finalIsMerged, mergedAccountsState, mergedAccountsData, selectedAccountId, isManualAccountSelection, resolveAccountForChannel]);

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Upload file mutation with progress tracking
  const uploadFileMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', file.type);

      setIsUploading(true);
      setUploadProgress(0);

      const response = await apiClient.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setUploadProgress(percent);
        },
      });

      setIsUploading(false);
      setUploadProgress(100);
      return response.data;
    },
    onError: () => {
      setIsUploading(false);
      setUploadProgress(0);
    },
  });

  // Send message mutation with optimistic updates
  const sendMessageMutation = useMutation({
    mutationFn: (data) => apiClient.post('/messages/send', data),
    onMutate: async (newMessage) => {
      // Optimistically add message to UI
      // Use tempId from metadata if provided, otherwise generate one
      const tempId = newMessage.metadata?.tempId || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // ✅ Extract content text properly (handle both string and object)
      let contentText = '';
      if (newMessage.content) {
        if (typeof newMessage.content === 'string') {
          contentText = newMessage.content;
        } else if (typeof newMessage.content === 'object' && newMessage.content.text) {
          contentText = newMessage.content.text;
        }
      }
      
      // ✅ Determine current channel (for merged conversations, use selectedChannel)
      const currentChannel = finalIsMerged && selectedChannel ? selectedChannel : (effectiveConversation?.channel || effectiveChannel || 'whatsapp');
      
      // ✅ Get contact email for optimistic message - check multiple sources
      let contactEmail = null;
      if (contactData) {
        contactEmail = contactData.email || contactData.identifiers?.email;
      }
      // ✅ Fallback: Get email from conversation's contact if available
      if (!contactEmail && effectiveConversation?.contact) {
        if (typeof effectiveConversation.contact === 'object') {
          contactEmail = effectiveConversation.contact.email || effectiveConversation.contact.identifiers?.email;
        }
      }
      // ✅ Fallback: Get email from newMessage identifier if it's an email
      if (!contactEmail && newMessage.identifier && currentChannel === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(newMessage.identifier)) {
          contactEmail = newMessage.identifier;
        }
      }
      // ✅ Final fallback: Get email from conversation identifier if available
      if (!contactEmail && effectiveConversation?.identifier && currentChannel === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(effectiveConversation.identifier)) {
          contactEmail = effectiveConversation.identifier;
        }
      }
      
      // ✅ Add email data to optimistic message if email channel
      const optimisticEmailData = currentChannel === 'email' && newMessage.emailData 
        ? {
            subject: newMessage.emailData.subject || 'No Subject',
            from: selectedAccount?.identifier || selectedAccount?.name || 'Unknown',
            to: [contactEmail || 'Unknown'], // ✅ Use resolved contactEmail
          }
        : undefined;

      const optimisticMessage = {
        _id: tempId,
        tempId, // ✅ Used to match with real message from server
        content: contentText || newMessage.content,
        type: newMessage.attachments?.length > 0 
          ? (newMessage.attachments[0].type || 'image')
          : (newMessage.content?.type || 'text'),
        attachments: newMessage.attachments || [],
        conversation: conversationId,
        channel: currentChannel, // ✅ Use currentChannel (selectedChannel for merged, conversation.channel otherwise)
        direction: 'outbound',
        status: 'pending', // ⏰ Initial status - shows clock icon (pending)
        createdAt: new Date().toISOString(),
        sender: null, // Will be filled by actual response
        replyTo: newMessage.metadata?.replyToId ? replyTo : null,
        isOptimistic: true,
        // ✅ Include email data for email messages
        ...(optimisticEmailData && { emailData: optimisticEmailData })
      };

      // Send optimistic message to parent
      onMessageSent?.(optimisticMessage);
      
      return { optimisticMessage, tempId };
    },
    onSuccess: (response, variables, context) => {
      // Clear input
      setMessage('');
      setAttachments([]);
      setShowTemplateWarning(false);
      setPendingTemplateMessage('');
      
      // ✅ Clear reply after sending
      if (onCancelReply) {
        onCancelReply();
      }
      
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }

      // ✅ For new conversations, pass conversationId to onMessageSent for redirect
      if (conversationId === 'new' && response?.data?.conversationId) {
        onMessageSent?.({
          conversationId: response.data.conversationId,
          messageId: response.data.messageId,
          data: response.data
        });
      }

      // ✅ Update optimistic message with real ID and status from API response
      // This ensures the message doesn't stay "pending" if socket event is delayed
      if (context?.optimisticMessage && response?.data) {
        const realId = response.data.messageId || response.data._id;
        const realStatus = response.data.status || 'sent';
        if (realId) {
          onMessageSent?.({
            ...context.optimisticMessage,
            _id: realId,
            status: realStatus,
            isOptimistic: false
          });
        }
      }
    },
    onError: (error, variables, context) => {
      const errorData = error.response?.data;

      if (errorData?.requiresTemplate) {
        // ✅ Remove optimistic message from UI (don't display it)
        if (context?.optimisticMessage) {
          // Send a removal signal - use a special status or null
          onMessageSent?.({
            ...context.optimisticMessage,
            status: 'removed', // Special status to indicate removal
            shouldRemove: true
          });
        }
        
        // ✅ Clear textarea immediately
        setMessage('');
        if (textareaRef.current) {
          textareaRef.current.value = '';
          textareaRef.current.style.height = 'auto';
        }
        
        setShowTemplateWarning(true);
        setPendingTemplateMessage(message);
        toast.error('Template message required to start conversation');
        return;
      }
      
      // Update optimistic message to failed status with error details
      if (context?.optimisticMessage) {
        onMessageSent?.({
          ...context.optimisticMessage,
          status: 'failed',
          errorMessage: errorData?.message || error.message || 'Failed to send message'
        });
      }

      setShowTemplateWarning(false);
      toast.error(errorData?.message || error.message || 'Failed to send message');
    },
    onSettled: () => {
      // Reset send guard after mutation completes (success or error)
      sendingRef.current = false;
    }
  });

  // Send template mutation
  const sendTemplateMutation = useMutation({
    mutationFn: (data) => {
      // ✅ Extract tempId from context if available (from onMutate)
      const tempId = data.tempId || data.metadata?.tempId || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const renderedText = data.renderedText || data.templateBody || '';
      
      // ✅ Determine channel type for template
      // Priority: 1. data.channel (from template modal), 2. selectedChannel (for merged), 3. conversation.channel
      let templateChannelType = null;
      if (data.channel) {
        // ✅ First priority: channel from template modal (most reliable)
        templateChannelType = data.channel;
      } else if (finalIsMerged && selectedChannel) {
        // ✅ Second priority: selectedChannel for merged conversations
        templateChannelType = selectedChannel;
      } else if (conversationId === 'new' && conversation?.channel) {
        // ✅ Third priority: conversation.channel for new conversations
        templateChannelType = conversation.channel;
      } else if (effectiveConversation?.channel) {
        // ✅ Fourth priority: effectiveConversation.channel
        templateChannelType = effectiveConversation.channel;
      } else if (selectedChannel) {
        // ✅ Fifth priority: selectedChannel (fallback)
        templateChannelType = selectedChannel;
      }
      
      // ✅ Determine channel account ID
      let templateChannelAccountId = data.channelAccountId || selectedAccountId;
      
      // ✅ CRITICAL: Validate that channelType is determined
      if (!templateChannelType) {
        const errorMsg = `Cannot determine channel type for template. Please ensure a channel is selected.`;
        console.error('❌ Template send error:', {
          conversationId,
          isMerged: finalIsMerged,
          selectedChannel,
          dataChannel: data.channel,
          conversationChannel: conversation?.channel,
          effectiveChannel: effectiveConversation?.channel
        });
        throw new Error(errorMsg);
      }
      
      console.log('📋 Sending template message:', {
        conversationId,
        templateChannelType,
        templateChannelAccountId,
        isMerged: finalIsMerged,
        selectedChannel,
        dataChannel: data.channel,
        conversationChannel: conversation?.channel
      });
      
      return apiClient.post('/messages/send', {
        conversationId,
        content: {
          type: 'template',
          templateName: data.templateName,
          templateLanguage: data.templateLanguage,
          parameters: data.parameters,
          ...(renderedText && { text: renderedText, renderedText, body: data.templateBody })
        },
        // ✅ CRITICAL: Always include channelType (required for merged conversations)
        channelType: templateChannelType,
        channelAccountId: templateChannelAccountId,
        // ✅ Add emailData for email templates
        ...(templateChannelType === 'email' && data.emailData && {
          emailData: data.emailData
        }),
        ...(conversationId === 'new' && contactData && channelAccount && {
          identifier: contactData.identifiers?.[conversation?.channel] || 
                     contactData.phone || 
                     contactData.email,
          contactId: contactData._id
        }),
        // ✅ Include tempId for matching optimistic messages
        metadata: {
          tempId: tempId,
          ...(renderedText && { renderedText, templateBody: data.templateBody }),
          // ✅ Pass contactName in metadata so it's saved when creating contact
          contactMetadata: {
            name: contactData?.name || contactData?.displayName || null,
            contactName: contactData?.name || contactData?.displayName || null
          }
        }
      });
    },
    onMutate: async (data) => {
      // ✅ Use tempId from data if available, otherwise generate one
      const tempId = data.tempId || data.metadata?.tempId || `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // ✅ Use channel from data if provided, otherwise fallback to currentChannel
      const templateChannel = data.channel || (finalIsMerged && selectedChannel ? selectedChannel : (effectiveConversation?.channel || effectiveChannel || 'whatsapp'));
      
      // ✅ Get contact email for optimistic message - check multiple sources
      let contactEmail = null;
      if (contactData) {
        contactEmail = contactData.email || contactData.identifiers?.email;
      }
      // ✅ Fallback: Get email from conversation's contact if available
      if (!contactEmail && effectiveConversation?.contact) {
        if (typeof effectiveConversation.contact === 'object') {
          contactEmail = effectiveConversation.contact.email || effectiveConversation.contact.identifiers?.email;
        }
      }
      // ✅ Fallback: Get email from conversation identifier if available
      if (!contactEmail && effectiveConversation?.identifier && templateChannel === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(effectiveConversation.identifier)) {
          contactEmail = effectiveConversation.identifier;
        }
      }
      
      // ✅ Add email data to optimistic message if email channel
      const optimisticEmailData = templateChannel === 'email' && data.emailData 
        ? {
            subject: data.emailData.subject || 'No Subject',
            from: selectedAccount?.identifier || selectedAccount?.name || 'Unknown',
            to: [contactEmail || 'Unknown'], // ✅ Use resolved contactEmail
          }
        : undefined;

      const renderedText = data.renderedText || data.templateBody || null;

      // ✅ For WhatsApp templates, show only template name (not "📋 Template: name")
      // For other channels, prefer rendered text/body
      let templateContent;
      if (templateChannel === 'whatsapp') {
        templateContent = data.templateName;
      } else if (renderedText) {
        templateContent = renderedText;
      } else {
        templateContent = `📋 Template: ${data.templateName}`;
      }
      
      const optimisticMessage = {
        _id: tempId,
        tempId,
        content: templateContent,
        type: 'template',
        templateName: data.templateName,
        conversation: conversationId,
        channel: templateChannel, // ✅ Use templateChannel
        direction: 'outbound',
        status: 'pending',
        createdAt: new Date().toISOString(),
        sender: null,
        isOptimistic: true,
        // ✅ Include email data for email templates
        ...(optimisticEmailData && { emailData: optimisticEmailData }),
        // ✅ Include metadata with tempId for matching
        metadata: {
          tempId,
          templateName: data.templateName,
          templateLanguage: data.templateLanguage,
          originalContent: {
            type: 'template',
            templateName: data.templateName,
            templateLanguage: data.templateLanguage,
            parameters: data.parameters
          }
        }
      };

      // Send optimistic message to parent
      onMessageSent?.(optimisticMessage);
      
      return { optimisticMessage, tempId };
    },
    onSuccess: (response, variables, context) => {
      setShowTemplateWarning(false);
      setPendingTemplateMessage('');
      toast.success('Template sent');
      
      // ✅ For new conversations, pass conversationId to onMessageSent for redirect
      if (conversationId === 'new' && response?.data?.conversationId) {
        onMessageSent?.({
          conversationId: response.data.conversationId,
          messageId: response.data.messageId,
          data: response.data
        });
      }
      
      // The real message will be emitted via socket, UI will update automatically
    },
    onError: (error, variables, context) => {
      const errorData = error.response?.data;
      
      // ✅ Check if session is not active (requiresTemplate or similar error)
      const isSessionError = errorData?.requiresTemplate || 
                            error.message?.includes('session') ||
                            error.message?.includes('template required') ||
                            error.message?.includes('24-hour') ||
                            error.message?.includes('Cannot send message');
      
      if (isSessionError) {
        // ✅ Remove optimistic message from UI (don't display it)
        if (context?.optimisticMessage) {
          onMessageSent?.({
            ...context.optimisticMessage,
            status: 'removed',
            shouldRemove: true
          });
        }
        
        // ✅ Clear textarea immediately
        setMessage('');
        if (textareaRef.current) {
          textareaRef.current.value = '';
          textareaRef.current.style.height = 'auto';
        }
        
        toast.error(errorData?.message || error.message || 'Template message required. Session is not active.');
        return;
      }
      
      // Update optimistic message to failed status with error details
      if (context?.optimisticMessage) {
        onMessageSent?.({
          ...context.optimisticMessage,
          status: 'failed',
          errorMessage: errorData?.message || error.message || 'Failed to send template'
        });
      }
      toast.error(errorData?.message || error.message || 'Failed to send template');
    }
  });

  // ✅ Helper function to process files (used by file input, paste, and drag-drop)
  const processFiles = useCallback((files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    // Validation: Max 10 attachments
    if (attachments.length + fileArray.length > MAX_ATTACHMENTS) {
      toast.error(`Maximum ${MAX_ATTACHMENTS} attachments allowed per message`);
      return;
    }

    // Validation: Check total size
    const currentTotalSize = attachments.reduce((sum, file) => sum + file.size, 0);
    const newFilesSize = fileArray.reduce((sum, file) => sum + file.size, 0);
    const totalSize = currentTotalSize + newFilesSize;

    if (totalSize > MAX_TOTAL_SIZE) {
      const remainingSize = MAX_TOTAL_SIZE - currentTotalSize;
      toast.error(`Total size exceeds 20MB limit. You can add ${(remainingSize / (1024 * 1024)).toFixed(1)}MB more.`);
      return;
    }

    // Add files to preview (not uploading yet)
    const newAttachments = fileArray.map(file => ({
      file, // Store original File object for later upload
      type: file.type.startsWith('image/') ? 'image' :
            file.type.startsWith('video/') ? 'video' :
            file.type.startsWith('audio/') ? 'audio' : 'document',
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      name: file.name || `image-${Date.now()}.png`, // Default name for pasted images
          size: file.size,
      mimeType: file.type
    }));

    setAttachments(prev => [...prev, ...newAttachments]);
    toast.success(`${fileArray.length} file(s) attached. Ready to send.`);
  }, [attachments]);

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    processFiles(files);

    // Reset file inputs (all of them)
      [fileInputRef, imageInputRef, videoInputRef, docInputRef].forEach(ref => {
        if (ref.current) ref.current.value = '';
      });
  };

  // ✅ Handle paste event for images (will be assigned after handlePasteWithSMSValidation is defined)
  // Note: handlePaste is assigned later after handlePasteWithSMSValidation is defined

  // ✅ Handle drag and drop
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  }, [processFiles]);

  // Bug 9 fix: Revoke blob URL before removing to prevent memory leak
  const handleRemoveAttachment = (index) => {
    setAttachments(prev => {
      const removed = prev[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSendVoice = async (audioBlob, duration) => {
    // ✅ Hide recorder UI immediately
    setIsRecordingVoice(false);
    
    try {
      // Determine file extension based on blob type
      const blobType = audioBlob.type || 'audio/webm';
      let extension = 'webm';
      if (blobType.includes('ogg')) {
        extension = 'ogg';
      } else if (blobType.includes('wav')) {
        extension = 'wav';
      } else if (blobType.includes('mpeg') || blobType.includes('mp3')) {
        extension = 'mp3';
      }

      // Create FormData for audio upload
      const formData = new FormData();
      formData.append('file', audioBlob, `voice-message.${extension}`);
      formData.append('type', blobType);

      // ✅ Upload in background - don't wait
      const uploadPromise = apiClient.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // ✅ Create optimistic message immediately with blob URL
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const blobUrl = typeof window !== 'undefined' && typeof URL !== 'undefined' 
        ? URL.createObjectURL(audioBlob) 
        : '';
      
      const optimisticMessage = {
        _id: tempId,
        tempId,
        content: '🎤 Voice message',
        type: 'audio',
        attachments: [{
          type: 'audio',
          url: blobUrl, // Use blob URL for instant display
          name: `voice-message.${extension}`,
          size: audioBlob.size,
          mimeType: blobType,
          duration: duration, // Duration in seconds
        }],
        conversation: conversationId,
        channel: finalIsMerged && selectedChannel ? selectedChannel : (conversation?.channel || 'whatsapp'),
        direction: 'outbound',
        status: 'pending',
        createdAt: new Date().toISOString(),
        isOptimistic: true,
      };

      // Send optimistic message to parent
      onMessageSent?.(optimisticMessage);

      // Upload and update in background
      try {
        const uploadResponse = await uploadPromise;
      const audioFile = uploadResponse.data;

      const sendData = {
        conversationId,
        content: {
          type: 'audio',
          text: '🎤 Voice message'
        },
        attachments: [{
          type: 'audio',
          url: audioFile.url,
            name: `voice-message.${extension}`,
          size: audioBlob.size,
            mimeType: audioFile.mimeType || blobType,
          duration: duration
        }],
          metadata: {
            tempId, // ✅ Include tempId for matching
          },
        };

        // ✅ For merged conversations, use selected channel and account (with validation)
        if (finalIsMerged && selectedChannel) {
          sendData.channelType = selectedChannel;

          // ✅ CRITICAL: Validate account matches channel before sending voice message
          let accountIdToUse = selectedAccountId;
          if (accountIdToUse) {
            const allAccounts = mergedAccountsState.length > 0
              ? mergedAccountsState
              : (mergedAccountsData || availableAccounts);
            const currentAccount = allAccounts.find(acc => String(acc._id) === String(accountIdToUse));
            const accountChannel = currentAccount ? (currentAccount.channel || currentAccount.type) : null;
            if (accountChannel && accountChannel !== selectedChannel) {
              const resolvedId = resolveAccountForChannel(selectedChannel, allAccounts);
              if (resolvedId) accountIdToUse = resolvedId;
            }
          }
          if (!accountIdToUse) {
            const allAccounts = mergedAccountsState.length > 0
              ? mergedAccountsState
              : (mergedAccountsData || availableAccounts);
            accountIdToUse = resolveAccountForChannel(selectedChannel, allAccounts);
          }
          sendData.channelAccountId = accountIdToUse;
        } else if (conversationId !== 'new' && selectedAccountId) {
          sendData.channelAccountId = selectedAccountId;
        }

        if (conversationId === 'new' && contactData && channelAccount) {
          sendData.channelType = conversation?.channel;
          sendData.channelAccountId = channelAccount._id;
          sendData.identifier = contactData.identifiers?.[conversation?.channel] ||
                               contactData.phone ||
                               contactData.email;
          sendData.contactId = contactData._id;
          sendData.departmentId = contactData.department || conversation?.department;
          // ✅ Pass contactName in metadata so it's saved when creating contact
          sendData.metadata = {
            ...sendData.metadata,
            contactMetadata: {
              name: contactData?.name || contactData?.displayName || null,
              contactName: contactData?.name || contactData?.displayName || null
            }
          };
        }

        if (replyTo) {
          sendData.replyToId = replyTo._id;
        }

      await sendMessageMutation.mutateAsync(sendData);
        
        // Revoke blob URL after upload
        if (blobUrl && typeof window !== 'undefined' && typeof URL !== 'undefined') {
          URL.revokeObjectURL(blobUrl);
        }
      } catch (uploadError) {
        console.error('Upload error:', uploadError);
        toast.error('Failed to upload voice message');
        // Remove optimistic message on error
        // The parent component should handle this via onMessageSent callback
      }
    } catch (error) {
      toast.error('Failed to send voice message');
      console.error('Voice send error:', error);
    }
  };

  const handleSend = async () => {
    if (sendingRef.current || sendMessageMutation.isPending) return;
    sendingRef.current = true;

    const captionText = message.trim();
    if (!captionText && attachments.length === 0) { sendingRef.current = false; return; }

    if (conversationId !== 'new' && !selectedAccountId) {
      toast.error('Please select a sender account');
      sendingRef.current = false;
      return;
    }

    // ✅ CRITICAL: Check WhatsApp session before sending if account is WhatsApp
    if (conversationId !== 'new' && selectedAccountId) {
      // ✅ Get the correct accounts list (merged or regular)
      const accountsToCheck = finalIsMerged 
        ? (mergedAccountsState.length > 0 ? mergedAccountsState : (mergedAccountsData || []))
        : availableAccounts;
      
      const currentAccount = accountsToCheck.find(acc => acc._id === selectedAccountId);
      const accountChannel = currentAccount?.channel || currentAccount?.type;
      
      if (accountChannel === 'whatsapp') {
        // ✅ Check if template warning is showing (session not active)
        if (showTemplateWarning) {
          toast.error('WhatsApp session is not active. Please use a template message.');
          setIsTemplateModalOpen(true);
          sendingRef.current = false;
          return;
        }
        
        // ✅ Double-check session before sending (in case it changed)
        setCheckingSession(true);
        try {
          const sessionCheck = await checkWhatsAppSession(selectedAccountId);
          
          if (!sessionCheck.hasActiveSession) {
            setShowTemplateWarning(true);
            setPendingTemplateMessage(captionText);
            toast.error('WhatsApp session is not active. Please use a template message.');
            setIsTemplateModalOpen(true);
            setCheckingSession(false);
            sendingRef.current = false;
            return;
          }
        } catch (error) {
          console.error('❌ Error checking WhatsApp session before send:', error);
          // ✅ Continue with send if check fails (backend will validate)
        } finally {
          setCheckingSession(false);
        }
      }
    }

    // ✅ WhatsApp-style: Upload in background, send message immediately with attachments
    // The message will show as "sending" and update when upload completes
    try {
      let uploadedAttachments = [];

      // Upload attachments in background (no loading toast - WhatsApp style)
      if (attachments.length > 0) {
        setUploadingFiles(true);

        try {
          const uploadPromises = attachments.map(async (attachment) => {
            const formData = new FormData();
            formData.append('file', attachment.file);
            formData.append('type', attachment.mimeType);

            const response = await apiClient.post('/upload', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });

            return {
              type: attachment.type,
              url: response.data.url,
              name: attachment.name,
              size: attachment.size,
              mimeType: attachment.mimeType
            };
          });

          uploadedAttachments = await Promise.all(uploadPromises);
        } catch (uploadError) {
          console.error('File upload failed:', uploadError);
          toast.error('Failed to upload file. Please try again.');
          setUploadingFiles(false);
          sendingRef.current = false;
          return; // Don't send message if upload failed
        }
        setUploadingFiles(false);
      }

      // ✅ Create unique tempId for matching with real message from server
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // ✅ Send message with proper content format (API requires object, not string)
      // Even if caption is empty, we need to send an object for attachment messages
    const sendData = {
      conversationId,
        content: uploadedAttachments.length > 0 
          ? {
              // For attachment messages: use media object with optional caption text
              media: {
                type: uploadedAttachments[0].type || 'image',
              },
              ...(captionText && { text: captionText }), // Only include text if caption exists
              type: uploadedAttachments[0].type || 'image',
            }
          : captionText
            ? {
                // For text messages: content object with type and text
                type: 'text',
                text: captionText,
                replyToId: replyTo?._id || null,
              }
            : {
                // Fallback: empty text message (shouldn't happen due to validation)
                type: 'text',
                text: '',
              },
        metadata: {
          replyToId: replyTo?._id || null,
          tempId, // ✅ Include tempId for matching optimistic updates
        }
      };

      // ✅ Add email-specific data if channel is email (check selected channel for merged, or conversation channel)
      const currentChannel = finalIsMerged && selectedChannel ? selectedChannel : (effectiveConversation?.channel || effectiveChannel);
      if (currentChannel === 'email') {
        sendData.emailData = {
          subject: emailSubject.trim() || 'No Subject', // Default to "No Subject" if empty
        };
      }

      // ✅ Add attachments if present
      if (uploadedAttachments.length > 0) {
        sendData.attachments = uploadedAttachments;
      }

      // ✅ For merged conversations, use selected channel and account
      if (finalIsMerged && selectedChannel) {
        sendData.channelType = selectedChannel;

        // ✅ CRITICAL: Validate that selectedAccountId matches selectedChannel before sending
        // This prevents the "Channel account type mismatch" error
        let accountIdToUse = selectedAccountId;
        if (accountIdToUse) {
          const allAccounts = mergedAccountsState.length > 0
            ? mergedAccountsState
            : (mergedAccountsData || availableAccounts);
          const currentAccount = allAccounts.find(acc => String(acc._id) === String(accountIdToUse));
          const accountChannel = currentAccount ? (currentAccount.channel || currentAccount.type) : null;

          if (accountChannel && accountChannel !== selectedChannel) {
            // ✅ Account doesn't match channel — resolve the correct one
            console.warn(`⚠️ Send: Account ${accountIdToUse} is ${accountChannel}, but sending via ${selectedChannel}. Resolving correct account...`);
            const resolvedId = resolveAccountForChannel(selectedChannel, allAccounts);
            if (resolvedId) {
              accountIdToUse = resolvedId;
              console.log(`✅ Send: Resolved correct account for ${selectedChannel}: ${accountIdToUse}`);
            }
          }
        }
        // ✅ Final fallback: if no account yet, try resolving from mergedChannels
        if (!accountIdToUse) {
          const allAccounts = mergedAccountsState.length > 0
            ? mergedAccountsState
            : (mergedAccountsData || availableAccounts);
          accountIdToUse = resolveAccountForChannel(selectedChannel, allAccounts);
        }

        sendData.channelAccountId = accountIdToUse;
      } else if (conversationId !== 'new' && selectedAccountId) {
        sendData.channelAccountId = selectedAccountId;
      }

      if (conversationId === 'new' && contactData && channelAccount) {
        sendData.channelType = conversation?.channel;
        sendData.channelAccountId = channelAccount._id;
        sendData.identifier = contactData.identifiers?.[conversation?.channel] ||
                             contactData.phone ||
                             contactData.email;
        sendData.contactId = contactData._id;
        sendData.departmentId = contactData.department || conversation?.department;
        // ✅ Pass contactName in metadata so it's saved when creating contact
        sendData.metadata = {
          ...sendData.metadata,
          contactMetadata: {
            name: contactData?.name || contactData?.displayName || null,
            contactName: contactData?.name || contactData?.displayName || null
          }
        };
      }

      sendMessageMutation.mutate(sendData);

      // Clear attachments and caption after sending
      setAttachments([]);
      setMessage('');
      setEmailSubject(''); // Clear email subject after sending
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      sendingRef.current = false;
      setUploadingFiles(false);
      toast.error('Failed to send message');
      console.error('Send error:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji) => {
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = message;
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    setMessage(before + emoji + after);
    // ✅ Don't close emoji picker automatically - allow multiple selections
    // setShowEmojiPicker(false);
    
    // Set cursor position after emoji
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    }, 0);
  };

  // ✅ Calculate emoji picker position when it opens
  useEffect(() => {
    if (showEmojiPicker && emojiButtonRef.current) {
      const buttonRect = emojiButtonRef.current.getBoundingClientRect();
      const pickerHeight = 400; // Approximate height of emoji picker
      const pickerWidth = 320; // Width of emoji picker
      const margin = 8; // Margin from button
      
      // Calculate initial position above the button, aligned to left
      let top = buttonRect.top - pickerHeight - margin;
      let left = buttonRect.left;
      
      // Adjust if picker would go above viewport
      if (top < margin) {
        top = buttonRect.bottom + margin; // Show below button instead
      }
      
      // Adjust if picker would go off right edge
      if (left + pickerWidth > window.innerWidth - margin) {
        left = window.innerWidth - pickerWidth - margin;
      }
      
      // Adjust if picker would go off left edge
      if (left < margin) {
        left = margin;
      }
      
      setEmojiPickerPosition({ top, left });
    }
  }, [showEmojiPicker]);

  // ✅ Handle click outside emoji picker to close it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEmojiPicker) {
        const pickerElement = document.getElementById('emoji-picker-portal');
        const buttonElement = emojiButtonRef.current;
        
        if (
          pickerElement && 
          !pickerElement.contains(event.target) &&
          buttonElement &&
          !buttonElement.contains(event.target)
        ) {
          setShowEmojiPicker(false);
        }
      }
    };

    if (showEmojiPicker) {
      // Add event listener with a small delay to avoid immediate closure
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showEmojiPicker]);

  const autoResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  // ✅ SMS Character Counting Utilities
  // Bug 5 fix: Use codePointAt instead of charCodeAt to correctly handle emojis (surrogate pairs)
  const isGSM7Only = (text) => {
    if (!text) return true;
    for (let i = 0; i < text.length; i++) {
      const code = text.codePointAt(i);
      // Skip low surrogate (already handled by high surrogate via codePointAt)
      if (code > 0xFFFF) i++; // Surrogate pair - skip the next code unit
      if (code <= 0x7F) continue;
      // Check for emoji ranges (now correctly detected with codePointAt)
      if (code >= 0x1F300 && code <= 0x1F9FF) return false;
      if (code >= 0x1F600 && code <= 0x1F64F) return false; // Emoticons
      if (code >= 0x1F680 && code <= 0x1F6FF) return false; // Transport/map
      if (code >= 0x2600 && code <= 0x27BF) return false;   // Misc symbols
      if (code >= 0xFE00 && code <= 0xFE0F) return false;   // Variation selectors
      if (code >= 0x200D && code <= 0x200D) continue;       // ZWJ (skip, part of emoji sequence)
      if (code >= 0xE0020 && code <= 0xE007F) return false;  // Tags
      // Check for non-Latin scripts
      if (
        (code >= 0x0400 && code <= 0x04FF) || // Cyrillic
        (code >= 0x0600 && code <= 0x06FF) || // Arabic
        (code >= 0x4E00 && code <= 0x9FFF) || // CJK
        (code >= 0x3040 && code <= 0x309F) || // Hiragana
        (code >= 0x30A0 && code <= 0x30FF)    // Katakana
      ) return false;
      // Any other non-ASCII character is not GSM-7
      if (code > 0x7F) return false;
    }
    return true;
  };

  const calculateSMSParts = (text) => {
    if (!text) return { parts: 1, encoding: 'GSM-7', charsPerPart: 160, totalChars: 0 };
    const isGSM7 = isGSM7Only(text);
    const encoding = isGSM7 ? 'GSM-7' : 'UCS-2';
    const singlePartLimit = isGSM7 ? 160 : 70;
    const multiPartLimit = isGSM7 ? 153 : 67;
    const textLength = text.length;
    
    if (textLength <= singlePartLimit) {
      return { parts: 1, encoding, charsPerPart: singlePartLimit, totalChars: textLength };
    }
    const parts = Math.ceil(textLength / multiPartLimit);
    return { parts, encoding, charsPerPart: multiPartLimit, totalChars: textLength };
  };

  // ✅ Get current channel for SMS validation
  const getCurrentChannel = () => {
    if (finalIsMerged && selectedChannel) return selectedChannel;
    return effectiveConversation?.channel || channelAccount?.type || effectiveChannel;
  };

  // ✅ Check if SMS channel is active
  const isSMSChannel = getCurrentChannel() === 'sms';
  
  // ✅ Calculate SMS info for current message
  const smsInfo = isSMSChannel ? calculateSMSParts(message) : null;
  const maxSMSParts = 3;
  const maxSMSChars = smsInfo?.encoding === 'GSM-7' ? (maxSMSParts * 153) : (maxSMSParts * 67);
  const isSMSLimitExceeded = isSMSChannel && smsInfo && smsInfo.parts > maxSMSParts;

  // ✅ Handle paste event for images and SMS text validation (moved after SMS utilities)
  const handlePasteWithSMSValidation = useCallback(async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    // ✅ Check for text paste if SMS channel
    const currentChannel = getCurrentChannel();
    if (currentChannel === 'sms') {
      const pastedText = e.clipboardData.getData('text');
      if (pastedText) {
        const newText = message + pastedText;
        const newSMSInfo = calculateSMSParts(newText);
        const maxParts = 3;
        const maxChars = newSMSInfo.encoding === 'GSM-7' ? (maxParts * 153) : (maxParts * 67);
        if (newSMSInfo.parts > maxParts) {
          e.preventDefault();
          toast.error(`Cannot paste! Message would exceed ${maxParts} SMS parts limit (${maxChars} characters for ${newSMSInfo.encoding}).`);
          return;
        }
      }
    }

    const imageFiles = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if item is an image
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault(); // Prevent default paste behavior
      processFiles(imageFiles);
    }
  }, [processFiles, message]);

  // ✅ Assign handlePaste after handlePasteWithSMSValidation is defined
  const handlePaste = handlePasteWithSMSValidation;

  const getPlaceholder = () => {
    if (isRecordingVoice) return 'Recording voice message...';
    if (conversationId === 'new') return 'Type your first message...';
    // Check if last message is inbound for WhatsApp session check
    const lastInboundMessage = lastMessage?.direction === 'inbound' ? lastMessage : null;
    
    if (conversation?.channel === 'whatsapp' && !lastInboundMessage) {
      return 'Type a message (template may be required for first message)...';
    }
    return 'Type a message...';
  };

  const selectedAccount = availableAccounts.find(acc => acc._id === selectedAccountId || String(acc._id) === String(selectedAccountId));
  const isSendDisabled = (!message.trim() && attachments.length === 0) ||
                        sendMessageMutation.isPending ||
                        sendTemplateMutation.isPending ||
                        uploadingFiles ||
                        checkingSession ||
                        (conversationId !== 'new' && !selectedAccountId) ||
                        (isSMSChannel && isSMSLimitExceeded);

  // ✅ Check WhatsApp session status for a specific account
  const checkWhatsAppSession = useCallback(async (accountId) => {
    if (!conversationId || conversationId === 'new' || !accountId) {
      return { hasActiveSession: true }; // Default to true for new conversations
    }

    try {
      // ✅ Check if there's an inbound message from this account within 24 hours
      // Bug 13 fix: Fetch only inbound messages with minimal fields instead of 50 full messages
      const response = await apiClient.get(`/messages/${conversationId}`, {
        params: {
          limit: 10, // Only need recent inbound messages
          sort: '-createdAt',
          direction: 'inbound', // Only fetch inbound messages
          select: 'direction,createdAt,channelAccount,status' // Minimal fields
        }
      });

      const messages = response?.data || [];
      
      // ✅ Filter for inbound messages from this specific account
      // ✅ CRITICAL: Don't filter by status - inbound messages can have any status
      let inboundMessagesFromAccount = messages.filter(msg => 
        msg.direction === 'inbound' && 
        (msg.channelAccount?._id === accountId || 
         msg.channelAccount === accountId ||
         String(msg.channelAccount?._id) === String(accountId))
      );
      
      // ✅ Fallback: If no inbound message found with account filter, check any inbound message
      // This handles cases where channelAccount might not be set correctly
      if (inboundMessagesFromAccount.length === 0) {
        console.log('🔍 No inbound messages found with account filter, checking all inbound messages...');
        inboundMessagesFromAccount = messages.filter(msg => msg.direction === 'inbound');
        
        if (inboundMessagesFromAccount.length > 0) {
          console.log('✅ Found inbound messages without account filter:', {
            count: inboundMessagesFromAccount.length,
            firstMessageAccount: inboundMessagesFromAccount[0].channelAccount,
            requestedAccountId: accountId
          });
        }
      }
      
      if (inboundMessagesFromAccount.length === 0) {
        console.log('📭 No inbound messages found in conversation at all');
        return { hasActiveSession: false };
      }

      // ✅ Get the most recent inbound message (sorted by createdAt desc, so first item is latest)
      const lastInboundMessage = inboundMessagesFromAccount.sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
      )[0];
      
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const messageDate = new Date(lastInboundMessage.createdAt);
      const hasActiveSession = messageDate > twentyFourHoursAgo;

      console.log('🔍 WhatsApp session check:', {
        accountId,
        hasActiveSession,
        lastMessageDate: messageDate,
        lastMessageAccount: lastInboundMessage.channelAccount,
        hoursSinceLastMessage: (Date.now() - messageDate.getTime()) / (1000 * 60 * 60),
        messageStatus: lastInboundMessage.status,
        messageDirection: lastInboundMessage.direction
      });

      return { hasActiveSession };
    } catch (error) {
      console.error('❌ Error checking WhatsApp session:', error);
      // ✅ Default to true on error to avoid blocking messages
      return { hasActiveSession: true };
    }
  }, [conversationId]);

  if (isRecordingVoice) {
    return (
      <VoiceRecorder 
        onSend={handleSendVoice}
        onCancel={() => setIsRecordingVoice(false)}
      />
    );
  }

  return (
    <>
      <div className="bg-card flex-shrink-0 w-full max-w-full overflow-hidden" style={{ paddingLeft: 'clamp(0.5rem, 1.5vw, 1rem)', paddingRight: 'clamp(0.5rem, 1.5vw, 1rem)', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
        {/* Reply Preview - WhatsApp Style (hidden for call conversations) */}
        {!isCallConversation && replyTo && (
          <div className="mb-1.5 rounded-xl overflow-hidden bg-muted/60 flex items-stretch">
            {/* Colored left accent bar */}
            <div className="w-1 bg-primary flex-shrink-0 rounded-l-xl" />
            <div className="flex-1 min-w-0 px-3 py-2">
              {/* Sender name */}
              {replyTo.senderName && (
                <p className="text-xs font-semibold text-primary mb-0.5 truncate">
                  {replyTo.senderName}
                </p>
              )}
              {/* Message preview - max 1 line */}
              <p className="text-xs text-muted-foreground truncate">
                {(() => {
                  const typeLabel = replyTo.type === 'image' ? 'Image' : replyTo.type === 'video' ? 'Video' : replyTo.type === 'audio' ? 'Audio' : 'Media';
                  let contentText = `[${typeLabel}]`;
                  if (replyTo.content) {
                    if (typeof replyTo.content === 'string') {
                      contentText = replyTo.content;
                    } else if (typeof replyTo.content === 'object' && replyTo.content.text) {
                      contentText = replyTo.content.text;
                    } else if (typeof replyTo.content === 'object' && replyTo.content.type) {
                      contentText = `[${replyTo.content.type}]`;
                    }
                  } else if (replyTo.attachments?.length > 0) {
                    contentText = '[Media]';
                  }
                  return contentText;
                })()}
              </p>
            </div>
            {/* Close button */}
            <button
              type="button"
              className="flex-shrink-0 px-2.5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              onClick={onCancelReply}
              aria-label="Cancel reply"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Attachment Previews - WhatsApp Style (hidden for call conversations) */}
        {!isCallConversation && attachments.length > 0 && (
          <div className="mb-2 relative">
            <AttachmentPreview
              attachments={attachments}
              onRemove={handleRemoveAttachment}
              totalSize={attachments.reduce((sum, file) => sum + file.size, 0)}
              caption={message}
              onCaptionChange={setMessage}
            />
            {/* Upload progress overlay */}
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg z-20">
                <div className="relative h-14 w-14">
                  <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="24" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="3" />
                    <circle
                      cx="28" cy="28" r="24" fill="none" stroke="white" strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 24}`}
                      strokeDashoffset={`${2 * Math.PI * 24 * (1 - uploadProgress / 100)}`}
                      className="transition-all duration-300"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                    {uploadProgress}%
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Template Required Warning (hidden for call conversations) */}
        {!isCallConversation && showTemplateWarning && (
          <div className="mb-2 p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Template Required</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowTemplateWarning(false)}
                    className="h-6 px-2 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300"
                  >
                    Dismiss
                  </Button>
                </div>
                <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                  This WhatsApp conversation requires a template message for the first contact.
                </p>
                <Button 
                  size="sm" 
                  onClick={() => setIsTemplateModalOpen(true)}
                  className="bg-orange-600 hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-600 text-white h-7 text-xs mt-2"
                >
                  Select Template
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ✅ Call conversation: show only a disabled notice — no text/voice input */}
        {isCallConversation ? (
          <div className="relative bg-muted rounded-2xl border border-border px-4 py-3 max-w-full">
            <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
              <Phone className="h-5 w-5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
              <p className="text-sm">
                Call conversation — text and voice messaging are not available for this channel.
              </p>
            </div>
          </div>
        ) : (
        <>
        {/* ✅ Redesigned Compact Input Area - Professional WhatsApp Style */}
        <div className="relative bg-background rounded-2xl border border-border shadow-sm max-w-full overflow-hidden">
          {/* ✅ Main Input Row - Compact horizontal layout */}
          <div className="flex items-end gap-1.5 px-2 py-1.5 max-w-full overflow-hidden">
            {/* Left Side: Attachment & Emoji Buttons */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Attachment Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost"
                size="icon"
                disabled={disabled || uploadingFiles}
                    className="h-8 w-8 min-h-[44px] min-w-[44px] rounded-full hover:bg-muted text-muted-foreground"
                    aria-label="Attach file"
              >
                    <Paperclip className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {/* Bug 6 fix: Each menu item opens a filtered file picker */}
              <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="mr-2 h-4 w-4" />
                Photos & Images
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => videoInputRef.current?.click()}>
                <VideoIcon className="mr-2 h-4 w-4" />
                Videos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => docInputRef.current?.click()}>
                <FileIcon className="mr-2 h-4 w-4" />
                Documents
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bug 6 fix: Separate hidden file inputs with appropriate accept filters */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            multiple
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <input
            ref={docInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.ppt,.pptx"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Emoji Picker Button */}
          <div className="relative">
            <Button 
              ref={emojiButtonRef}
              variant="ghost"
              size="icon"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              disabled={disabled}
              className="h-8 w-8 min-h-[44px] min-w-[44px] rounded-full hover:bg-muted text-muted-foreground cursor-pointer"
              aria-label="Open emoji picker"
            >
              <Smile className="h-4 w-4" />
            </Button>
              </div>
          
          {/* Emoji Picker Portal - Rendered at body level to avoid clipping */}
          {showEmojiPicker && typeof window !== 'undefined' && createPortal(
            <div
              id="emoji-picker-portal"
              ref={emojiPickerRef}
              className="fixed z-[99999]"
              style={{
                top: `${emojiPickerPosition.top}px`,
                left: `${emojiPickerPosition.left}px`,
              }}
            >
              <EmojiPicker onSelect={handleEmojiSelect} />
            </div>,
            document.body
          )}

          {/* Template Button */}
          <Button 
            variant="ghost"
            size="icon"
            onClick={() => setIsTemplateModalOpen(true)}
            aria-label="Send template"
                disabled={disabled || (() => {
                  if (conversationId === 'new') {
                    return !channelAccount && !effectiveChannel;
                  }
                  if (finalIsMerged) {
                    return !selectedChannel && !effectiveConversation?.channel;
                  }
                  return !conversation?.channel && !effectiveChannel;
                })()}
                className="h-8 w-8 min-h-[44px] min-w-[44px] rounded-full hover:bg-muted text-muted-foreground"
              >
                <FileText className="h-4 w-4" />
          </Button>
            </div>

            {/* Center: Text Input Area */}
            <div className="flex-1 min-w-0 flex flex-col gap-1 max-w-full overflow-hidden focus-within:border-blue-500 dark:focus-within:border-blue-400">
              {/* ✅ Send from dropdown - Compact inline above textarea */}
              {shouldShowSendFrom && (
                <div className="flex items-center gap-1.5 px-1">
                  <Select
                    value={String(selectedAccountId || '')}
                    onValueChange={async (value) => {
                      // ✅ Mark as manual selection when user changes account
                      setIsManualAccountSelection(true);
                      
                      // ✅ Get the correct accounts list (merged or regular)
                      const accountsToCheck = finalIsMerged 
                        ? (mergedAccountsState.length > 0 ? mergedAccountsState : (mergedAccountsData || []))
                        : availableAccounts;
                      
                      // ✅ Check if this is a WhatsApp account and verify session
                      const newAccount = accountsToCheck.find(acc => acc._id === value);
                      const accountChannel = newAccount?.channel || newAccount?.type;
                      
                      if (accountChannel === 'whatsapp' && conversationId !== 'new') {
                        setCheckingSession(true);
                        try {
                          const sessionCheck = await checkWhatsAppSession(value);
                          
                          if (!sessionCheck.hasActiveSession) {
                            // ✅ Session not active - show template dialog
                            setSelectedAccountId(value); // Set the account first
                            setShowTemplateWarning(true);
                            setPendingTemplateMessage(message); // Preserve current message
                            toast.error('WhatsApp session is not active. Please use a template message.');
                            setCheckingSession(false);
                            return;
                          } else {
                            // ✅ Session is active - clear template warning since this account has an active session
                            setShowTemplateWarning(false);
                            setPendingTemplateMessage('');
                          }
                        } catch (error) {
                          console.error('❌ Error checking WhatsApp session:', error);
                          // ✅ Continue with account change even if check fails
                          // Don't clear warning on error - keep it showing if it was already showing
                        } finally {
                          setCheckingSession(false);
                        }
                      } else {
                        // ✅ Not WhatsApp - clear template warning since templates don't apply
                        setShowTemplateWarning(false);
                        setPendingTemplateMessage('');
                      }
                      
                      setSelectedAccountId(value);
                      console.log('👤 Manual account selection:', value);
                    }}
                    disabled={disabled || isLoadingAllAccounts || checkingSession}
                  >
                    <SelectTrigger className="h-6 px-2 py-0 bg-transparent border-0 hover:bg-muted text-xs font-medium text-muted-foreground focus:ring-0">
                      <SelectValue>
                        {selectedAccount ? (
                          <div className="flex items-center gap-1.5">
                            {finalIsMerged && (() => {
                              const accountChannel = selectedAccount.channel || selectedAccount.type;
                              return accountChannel ? (
                                <ChannelIcon type={accountChannel} className="h-3 w-3" />
                              ) : null;
                            })()}
                            <span className="truncate max-w-[120px]">{selectedAccount.name}</span>
                            <span className="text-gray-400 dark:text-gray-500 text-[10px] truncate max-w-[100px] hidden sm:inline">
                              ({selectedAccount.identifier})
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500 text-xs">
                            {isLoadingAllAccounts ? "Loading..." : "Select account"}
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-card">
                      {(() => {
                        const accountsToShow = finalIsMerged && selectedChannel
                          ? availableAccounts.filter(acc => {
                              const accChannel = acc.channel || acc.type;
                              return accChannel === selectedChannel;
                            })
                          : availableAccounts;

                        return accountsToShow.length > 0 ? (
                          accountsToShow.map((account) => {
                            const accountChannel = account.channel || account.type;
                            const accountIdStr = String(account._id);
                            return (
                              <SelectItem key={accountIdStr} value={accountIdStr} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                <div className="flex items-center gap-2">
                                  {accountChannel && (
                                    <ChannelIcon type={accountChannel} className="h-4 w-4 flex-shrink-0" />
                                  )}
                                  <div className="flex flex-col">
                                    <span className="font-medium text-gray-900 dark:text-gray-100">{account.name}</span>
                                    <span className="text-gray-500 dark:text-gray-400 text-sm">{account.identifier}</span>
                                  </div>
                                </div>
                              </SelectItem>
                            );
                          })
                        ) : (
                          <div className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                            {isLoadingAllAccounts ? "Loading accounts..." : "No accounts available"}
                          </div>
                        );
                      })()}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* ✅ Email Subject Field - Display below company account dropdown */}
              {(() => {
                const currentChannel = finalIsMerged && selectedChannel ? selectedChannel : (effectiveConversation?.channel || channelAccount?.type || effectiveChannel);
                const isEmailSelected = currentChannel === 'email';
                return isEmailSelected && (
                  <div className="px-2 pb-1 border-b-2 border-border focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-colors duration-200">
                    <Input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value.slice(0, 200))}
                      maxLength={200}
                      placeholder="Email subject..."
                      className="h-7 !bg-transparent dark:!bg-transparent !border-0 dark:!border-0 !border-transparent dark:!border-transparent focus:ring-0 focus-visible:ring-0 focus-visible:!border-transparent dark:focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!shadow-none px-0 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                      disabled={disabled || sendMessageMutation.isPending || sendTemplateMutation.isPending || uploadingFiles}
                    />
                  </div>
                );
              })()}

          {/* Message Input */}
              {attachments.length === 0 && (
                <div 
                  className={cn(
                    "relative px-1 rounded-md focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 focus-within:ring-inset transition-all duration-200",
                    isDragging && "ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-50 dark:bg-blue-900/20"
                  )}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              const newValue = e.target.value;
              
              // ✅ SMS Character Limit Validation - Prevent typing beyond 3 SMS parts
              if (isSMSChannel) {
                const newSMSInfo = calculateSMSParts(newValue);
                if (newSMSInfo.parts > maxSMSParts) {
                  // Prevent typing beyond 3 SMS parts - truncate to max allowed
                  const maxAllowedChars = maxSMSChars;
                  const truncatedValue = Array.from(newValue).slice(0, maxAllowedChars).join('');
                  
                  // Only show toast if user is actively typing (not just loading existing message)
                  if (newValue.length > message.length) {
                    toast.error(`Message limit exceeded! Maximum ${maxSMSParts} SMS parts allowed (${maxAllowedChars} characters for ${newSMSInfo.encoding}).`);
                  }
                  
                  // Set truncated value
                  setMessage(truncatedValue);
                  if (textareaRef.current) {
                    textareaRef.current.value = truncatedValue;
                    autoResize(e);
                  }
                  return;
                }
              }
              
              setMessage(newValue);
              autoResize(e);
            }}
            onKeyDown={(e) => {
              // ✅ Prevent typing if SMS limit exceeded (except backspace/delete)
              if (isSMSChannel && isSMSLimitExceeded) {
                // Allow backspace, delete, arrow keys, and other navigation keys
                const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'];
                if (!allowedKeys.includes(e.key) && !e.ctrlKey && !e.metaKey) {
                  e.preventDefault();
                  toast.error(`Message limit exceeded! Maximum ${maxSMSParts} SMS parts allowed.`);
                  return;
                }
              }
              // Bug 11 fix: Handle Enter-to-send in onKeyDown instead of deprecated onKeyPress
              handleKeyPress(e);
            }}
            // Bug 11 fix: Removed deprecated onKeyPress - all handling now in onKeyDown above
            onPaste={(e) => {
              if (isSMSChannel) {
                const pastedText = e.clipboardData.getData('text');
                const textarea = e.target;
                const selStart = textarea.selectionStart || 0;
                const selEnd = textarea.selectionEnd || 0;
                // Account for text that will be replaced by paste
                const newText = message.substring(0, selStart) + pastedText + message.substring(selEnd);
                const newSMSInfo = calculateSMSParts(newText);
                if (newSMSInfo.parts > maxSMSParts) {
                  e.preventDefault();
                  toast.error(`Cannot paste! Message would exceed ${maxSMSParts} SMS parts limit (${maxSMSChars} characters for ${newSMSInfo.encoding}).`);
                  return;
                }
              }
              handlePaste(e);
            }}
            aria-label={disabled ? "View only mode" : "Type a message"}
            placeholder={disabled ? "View only mode - you cannot send messages" : getPlaceholder()}
                    className={cn(
                      "flex-1 min-h-[36px] max-h-[120px] resize-none !bg-transparent dark:!bg-transparent !border-0 dark:!border-0 !border-transparent dark:!border-transparent focus:ring-0 focus-visible:ring-0 focus-visible:!border-transparent dark:focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!shadow-none px-0 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 w-full max-w-full overflow-wrap-break-word break-words",
                      isSMSLimitExceeded && "ring-2 ring-red-500 dark:ring-red-400"
                    )}
                    style={{ 
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word',
                      whiteSpace: 'pre-wrap',
                      maxWidth: '100%',
                      overflowX: 'hidden'
                    }}
            rows={1}
            disabled={disabled || sendMessageMutation.isPending || sendTemplateMutation.isPending || uploadingFiles}
          />
          
          {/* ✅ SMS Character Count Display */}
          {isSMSChannel && (
            <div className="flex items-center justify-between px-1 mt-1" role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-xs">
                <span className={cn(
                  "font-medium",
                  smsInfo.parts === 1 ? "text-muted-foreground" :
                  smsInfo.parts === 2 ? "text-blue-600 dark:text-blue-400" :
                  smsInfo.parts === 3 ? "text-orange-600 dark:text-orange-400" :
                  "text-red-600 dark:text-red-400"
                )}>
                  {message.length} chars • {smsInfo.parts} SMS{smsInfo.parts > 1 ? 's' : ''} ({smsInfo.encoding})
                </span>
                {smsInfo.parts > 1 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({smsInfo.parts} parts)
                  </span>
                )}
              </div>
              {isSMSLimitExceeded && (
                <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  <span>Limit exceeded! Max {maxSMSParts} SMS parts ({maxSMSChars} chars)</span>
                </div>
              )}
            </div>
          )}
                </div>
              )}
            </div>

            {/* Right Side: Channel Selector (Send via) & Action Buttons */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
              {/* ✅ Send via buttons - Compact vertical/horizontal layout */}
              {finalIsMerged && mergedChannels.length > 0 && (
                <div className="flex items-center gap-1 mr-1 flex-shrink-0">
                  {mergedChannels.map((mergedChannel) => {
                    const channelName = channelNames[mergedChannel.channel] || mergedChannel.channel;
                    const isSelected = (selectedChannel || defaultChannel) === mergedChannel.channel;
                    return (
                      <button
                        key={mergedChannel.channel}
                        onClick={() => {
                          const newChannel = mergedChannel.channel;
                          // ✅ Mark as manual selection when user clicks
                          setIsManualChannelSelection(true);
                          setSelectedChannel(newChannel);

                          // ✅ CRITICAL: Use resolveAccountForChannel to get the CORRECT account
                          // This prefers the account from mergedConversations data (the actual account for this channel)
                          const allAccounts = mergedAccountsState.length > 0
                            ? mergedAccountsState
                            : (mergedAccountsData || availableAccounts);
                          const resolvedAccountId = resolveAccountForChannel(newChannel, allAccounts);
                          if (resolvedAccountId) {
                            setSelectedAccountId(resolvedAccountId);
                          } else {
                            setSelectedAccountId('');
                          }
                          console.log('👤 Manual channel selection:', newChannel, 'account:', resolvedAccountId);
                        }}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-md transition-all",
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700"
                            : "bg-gray-50 dark:bg-muted/50 border border-border hover:bg-muted"
                        )}
                        title={channelName}
                      >
                        <ChannelIcon 
                          type={mergedChannel.channel} 
                          className="h-3.5 w-3.5 flex-shrink-0" 
                        />
                        <span className={cn(
                          "text-[10px] font-medium hidden sm:inline",
                          isSelected
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-muted-foreground"
                        )}>
                          {channelName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

          {/* Voice Record Button - Hide for email conversations */}
          {(() => {
            const currentChannel = finalIsMerged && selectedChannel ? selectedChannel : (effectiveConversation?.channel || channelAccount?.type || effectiveChannel);
            const isEmailSelected = currentChannel === 'email';
            return !isEmailSelected && !message.trim() && attachments.length === 0 && (
            <Button 
              onClick={() => setIsRecordingVoice(true)}
              size="icon"
              variant="ghost"
              disabled={disabled}
                className="h-8 w-8 min-h-[44px] min-w-[44px] rounded-full hover:bg-muted text-muted-foreground"
                aria-label="Record voice message"
            >
                <Mic className="h-4 w-4" />
            </Button>
            );
          })()}

          {/* Send Button */}
          {(message.trim() || attachments.length > 0) && (
            <Button
              onClick={handleSend}
              disabled={disabled || isSendDisabled}
              size="icon"
                  className="h-8 w-8 min-h-[44px] min-w-[44px] rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Send message"
                  aria-busy={sendMessageMutation.isPending || sendTemplateMutation.isPending}
            >
                  <Send className="h-4 w-4" />
            </Button>
          )}
            </div>
        </div>

        {/* Upload Progress */}
        {uploadingFiles && (
            <div className="px-3 py-1.5 border-t border-border">
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin text-green-600 dark:text-green-400" />
                <span className="text-xs text-muted-foreground">Uploading files...</span>
              </div>
          </div>
        )}

        {/* Sending state handled by optimistic messages in the message list */}
        </div>
        </>
        )}
      </div>

      {/* Template Modal */}
      <TemplateSelectionModal
        open={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        channel={(() => {
          // For merged conversations, use selectedChannel if available, otherwise use conversation channel
          // For non-merged conversations, use conversation channel or effectiveChannel
          if (finalIsMerged && selectedChannel) {
            return selectedChannel;
          }
          return conversation?.channel || effectiveChannel || channelAccount?.type;
        })()}
        availableAccounts={(() => {
          // For merged conversations, filter accounts by selected channel
          // For non-merged conversations, use all available accounts
          if (finalIsMerged && selectedChannel) {
            return availableAccounts.filter(acc => {
              const accChannel = acc.channel || acc.type;
              return accChannel === selectedChannel;
            });
          }
          return availableAccounts;
        })()}
        channelAccount={channelAccount}
        defaultAccountId={selectedAccountId}
        departmentId={effectiveDepartmentId}
        onSendTemplate={(templateData) => {
          sendTemplateMutation.mutate(templateData);
        }}
      />
    </>
  );
}