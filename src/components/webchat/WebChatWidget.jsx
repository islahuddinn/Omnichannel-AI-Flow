// src/components/webchat/WebChatWidget.jsx
/**
 * Main WebChat Widget Component
 * Real-time chat interface for visitors
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, Paperclip, Minimize2, Maximize2, X, Loader2, Smile, Moon, Sun, Mic, Reply, Settings, LogOut, Menu } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import WebChatMessageList from './WebChatMessageList';
import WebChatTypingIndicator from './WebChatTypingIndicator';
import WebChatEmojiPicker from './WebChatEmojiPicker';
import WebChatVoiceRecorder from './WebChatVoiceRecorder';
import WebChatProfileSettings from './WebChatProfileSettings';

export default function WebChatWidget({ socket, session, linkId, isFirstTime, token, onLogout, onSessionUpdate }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // ✅ Reply state
  const [conversationId, setConversationId] = useState(null); // ✅ Conversation ID for reactions
  const [showSettings, setShowSettings] = useState(false); // ✅ Settings modal state
  const [showMobileMenu, setShowMobileMenu] = useState(false); // ✅ Mobile menu state
  
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const textareaRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState([]);
  const audioRef = useRef(null);
  const optimisticMessageRef = useRef(null);
  const sendingRef = useRef(false);
  const messagesLengthRef = useRef(0); // ✅ Track messages count for loading skeleton logic
  const { theme, setTheme } = useTheme();
  const [selectedNotificationTune, setSelectedNotificationTune] = useState('message.mp3'); // ✅ Selected notification tune (default to message.mp3)
  const [isThemeChanging, setIsThemeChanging] = useState(false); // ✅ Track theme change state
  const [showLogoutDialog, setShowLogoutDialog] = useState(false); // ✅ Logout confirmation dialog state
  const onSessionUpdateRef = useRef(onSessionUpdate);
  const sessionConversationIdRef = useRef(session?.conversationId);
  // ✅ Keep messagesLengthRef in sync with messages state
  messagesLengthRef.current = messages.length;
  onSessionUpdateRef.current = onSessionUpdate;
  sessionConversationIdRef.current = session?.conversationId;

  // ✅ Load profile settings to get selected notification tune
  useEffect(() => {
    if (token) {
      const loadProfileSettings = async () => {
        try {
          const response = await fetch('/api/webchat/profile', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          const data = await response.json();
          if (data.success) {
            const tune = data.data?.webchatSettings?.selectedNotificationTune || 'message.mp3';
            console.log('🔔 Loaded notification tune from profile:', tune);
            setSelectedNotificationTune(tune);
          }
        } catch (error) {
          console.error('Error loading profile settings:', error);
          // ✅ Default to 'default' if loading fails
          setSelectedNotificationTune('default');
        }
      };
      loadProfileSettings();
    } else {
      // ✅ Default to 'message.mp3' if no token
      setSelectedNotificationTune('message.mp3');
    }
  }, [token]);

  // ✅ Convert S3 direct URL to media proxy URL for better CORS handling
  const getProxiedNotificationTuneUrl = (url) => {
    if (!url || typeof url !== 'string') return url;
    
    // ✅ Handle both default tunes
    if (url === '/sounds/notification.mp3' || url === 'notification.mp3' || url === 'default') {
      return '/sounds/notification.mp3';
    }
    if (url === '/sounds/message.mp3' || url === 'message.mp3') {
      return '/sounds/message.mp3';
    }
    
    // If it's an S3 URL, convert to media proxy
    if (url.includes('s3.') && url.includes('amazonaws.com')) {
      try {
        const urlObj = new URL(url);
        // Extract the key from the S3 URL
        // Format: https://bucket.s3.region.amazonaws.com/key
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
          const key = pathParts.join('/');
          return `/api/media/${key}`;
        }
      } catch (e) {
        console.warn('Error parsing S3 URL for notification tune:', e);
      }
    }
    
    return url;
  };

  // ✅ Initialize sound notification (with better error handling)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // ✅ Clean up previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    
    let audio = null;
    let isReady = false;
    let hasError = false;
    
    // ✅ Get notification tune URL (default or custom) and convert S3 URLs to proxy
    const getNotificationTuneUrl = () => {
      if (selectedNotificationTune === 'default' || selectedNotificationTune === 'notification.mp3') {
        return '/sounds/notification.mp3';
      }
      if (selectedNotificationTune === 'message.mp3') {
        return '/sounds/message.mp3';
      }
      return getProxiedNotificationTuneUrl(selectedNotificationTune);
    };
    
    const tuneUrl = getNotificationTuneUrl();
    
    try {
      audio = new Audio(tuneUrl);
      audio.volume = 0.5;
      audio.preload = 'auto';
      
      // Handle audio loading - wait for it to be ready
      const handleCanPlay = () => {
        // Only set if audio has valid duration (not empty file)
        if (audio && audio.duration && audio.duration > 0 && !isNaN(audio.duration)) {
          isReady = true;
          audioRef.current = audio;
          console.log('✅ Notification tune loaded and ready:', tuneUrl);
        } else {
          // Silently fail - don't log if file is empty/invalid
          hasError = true;
        }
      };
      
      const handleLoadedData = () => {
        if (!isReady && !hasError && audio) {
          // Check if audio has valid duration
          if (audio.duration && audio.duration > 0 && !isNaN(audio.duration)) {
            isReady = true;
            audioRef.current = audio;
            console.log('✅ Notification tune loaded and ready:', tuneUrl);
          }
        }
      };
      
      const handleError = (e) => {
        console.error('❌ Notification tune failed to load:', tuneUrl, e.target?.error);
        hasError = true;
        // Don't set audioRef if loading fails
        audio = null;
      };
      
      audio.addEventListener('canplaythrough', handleCanPlay);
      audio.addEventListener('loadeddata', handleLoadedData);
      audio.addEventListener('error', handleError);
      
      // Set crossOrigin to avoid CORS issues
      audio.crossOrigin = 'anonymous';
      
      // Try to load the audio (load() doesn't return a Promise, errors are handled by error event listener)
      try {
        audio.load();
      } catch (err) {
        console.error('❌ Failed to load notification tune:', tuneUrl, err);
        hasError = true;
      }
      
      return () => {
        if (audio) {
          audio.removeEventListener('canplaythrough', handleCanPlay);
          audio.removeEventListener('loadeddata', handleLoadedData);
          audio.removeEventListener('error', handleError);
          audio.pause();
          audio.src = ''; // Clear source
          audio = null;
        }
      };
    } catch (error) {
      console.error('❌ Error initializing notification tune:', error);
      hasError = true;
    }
  }, [selectedNotificationTune]); // ✅ Re-initialize when notification tune changes

  // ✅ Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEmojiPicker) {
        const emojiButton = emojiButtonRef.current;
        const emojiPicker = document.querySelector('[data-emoji-picker]');
        
        const clickedEmojiButton = emojiButton && emojiButton.contains(event.target);
        const clickedInsidePicker = emojiPicker && emojiPicker.contains(event.target);
        
        if (!clickedEmojiButton && !clickedInsidePicker) {
          setShowEmojiPicker(false);
        }
      }
    };
    
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showEmojiPicker]);

  const requestAgentStatus = useCallback(() => {
    if (socket && isConnected) {
      socket.emit('request:agent:status');
      console.log('📡 Requested agent status');
    }
  }, [socket, isConnected]);

  // Load messages when conversationId is available
  // Uses a ref to avoid ReferenceError (loadMessages is defined later in the component)
  const loadMessagesRef = useRef(null);

  useEffect(() => {
    if (session?.conversationId && token) {
      // Defer to next microtask so loadMessages ref is populated
      const timer = setTimeout(() => {
        if (loadMessagesRef.current) loadMessagesRef.current();
        if (socket && isConnected) requestAgentStatus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [session?.conversationId, token, socket, isConnected, requestAgentStatus]);

  // ✅ State for company and agent info
  const [companyInfo, setCompanyInfo] = useState(() => {
    const info = session?.companyInfo || null;
    console.log('🔍 Initial companyInfo from session:', info);
    return info;
  });
  const [agentInfo, setAgentInfo] = useState(() => {
    const info = session?.agentInfo || null;
    console.log('🔍 Initial agentInfo from session:', info);
    return info;
  });

  // ✅ Function to get welcome message based on phone number prefix
  const getWelcomeMessage = (phoneNumber) => {
    if (!phoneNumber) {
      return 'Welcome to Web Chat! This is your personal chat With company';
    }
    
    // Remove any spaces, dashes, or other characters
    const cleanPhone = phoneNumber.replace(/[\s\-()]/g, '');
    
    // Check if phone starts with +421 or 421 (Slovakia)
    if (cleanPhone.startsWith('+421') || cleanPhone.startsWith('421')) {
      return 'Vitajte vo Web Chate! Toto je váš osobný chat s tímom podpory';
    }
    
    // Check if phone starts with +420 or 420 (Czech Republic)
    if (cleanPhone.startsWith('+420') || cleanPhone.startsWith('420')) {
      return 'Vítejte ve Web Chatu! Toto je váš osobní chat s týmem podpory';
    }
    
    // Default welcome message
    return 'Welcome to Web Chat! This is your personal chat With company';
  };

  // ✅ Get phone number from session or contact (recalculate when session changes)
  const phoneNumber = session?.contactInfo?.phone || session?.contact?.phone || null;
  
  // ✅ Get welcome message based on phone number (recalculate when phone number changes)
  const welcomeMessage = useMemo(() => getWelcomeMessage(phoneNumber), [phoneNumber]);

  // ✅ Helper function to normalize attachments - defined outside useEffect so it can be used in loadMessages
  const normalizeAttachments = useCallback((msg) => {
    if (!msg.attachments || !Array.isArray(msg.attachments)) {
      return msg;
    }
    return {
      ...msg,
      attachments: msg.attachments.map(att => {
        // Ensure audio attachments have all required fields
        if (att.type === 'audio' || att.mimeType?.startsWith('audio/')) {
          return {
            ...att,
            type: att.type || 'audio',
            url: att.url || att.path || att.fileUrl,
            duration: att.duration || 0,
            size: att.size || 0,
            mimeType: att.mimeType || 'audio/mpeg',
            name: att.name || 'Voice message',
          };
        }
        return att;
      })
    };
  }, []);

  // ✅ Update company/agent info when session changes
  useEffect(() => {
    console.log('🔍 Session changed:', { 
      hasCompanyInfo: !!session?.companyInfo, 
      companyInfo: session?.companyInfo,
      hasAgentInfo: !!session?.agentInfo,
      agentInfo: session?.agentInfo 
    });
    if (session?.companyInfo) {
      console.log('✅ Updating companyInfo from session:', session.companyInfo);
      setCompanyInfo(session.companyInfo);
    }
    if (session?.agentInfo) {
      console.log('✅ Updating agentInfo from session:', session.agentInfo);
      setAgentInfo(session.agentInfo);
    }
  }, [session?.companyInfo, session?.agentInfo]);

  // ✅ Socket event handlers
  useEffect(() => {
    if (!socket) return;

    // Check if socket is already connected
    if (socket.connected) {
      setIsConnected(true);
      if (session?.conversationId) {
        requestAgentStatus();
      }
    }

    // ✅ Mark messages as read function
    const markMessagesAsRead = (messageIds) => {
      if (socket && messageIds && messageIds.length > 0) {
        socket.emit('read:mark', { messageIds });
        setUnreadMessages(prev => prev.filter(id => !messageIds.includes(id)));
      }
    };

    socket.on('connect', () => {
      setIsConnected(true);
      console.log('✅ WebChat socket connected');
      // Request agent status when connected
      if (session?.conversationId) {
        requestAgentStatus();

        // ✅ Reconnection catch-up: request missed messages since last known message
        // This handles offline message delivery (Point 3) and reconnection catch-up (Point 7)
        setMessages(prev => {
          const lastMsg = prev.length > 0 ? prev[prev.length - 1] : null;
          if (lastMsg) {
            socket.emit('messages:catchup', {
              lastMessageTimestamp: lastMsg.createdAt,
              lastMessageId: lastMsg._id,
            });
          }
          return prev; // Don't modify state, just read it
        });
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsOnline(false);
      console.log('❌ WebChat socket disconnected');
    });

    // ✅ normalizeAttachments is now defined outside this useEffect (above) so it can be used in loadMessages
    
    socket.on('message:sent', (data) => {
      // ✅ If backend created a new conversation (e.g., after deletion), update session with new conversationId
      if (data.message?.conversationId && onSessionUpdateRef.current && data.message.conversationId !== sessionConversationIdRef.current) {
        console.log(`✅ Conversation ID updated from server: ${data.message.conversationId}`);
        onSessionUpdateRef.current({ conversationId: data.message.conversationId });
      }

      // ✅ CRITICAL: Replace optimistic message with real message
      if (data.message) {
        // ✅ Normalize attachments before processing
        const normalizedMessage = normalizeAttachments(data.message);
        
        setMessages(prev => {
          // ✅ Remove any existing message with the same _id first (prevent duplicates)
          const filtered = prev.filter(msg => msg._id !== normalizedMessage._id);
          
          // ✅ Find optimistic message to replace - check all optimistic messages
          let optimisticIndex = -1;
          let matchedOptimistic = null;
          
          for (let i = 0; i < filtered.length; i++) {
            const msg = filtered[i];
            
            // Match by tempId (most reliable)
            if (msg.tempId && data.message._id && msg.tempId === data.message._id.toString()) {
              optimisticIndex = i;
              matchedOptimistic = msg;
              break;
            }
            
            // Match by content and timestamp (within 10 seconds) for optimistic messages
            if (msg.isOptimistic) {
              const timeDiff = Math.abs(new Date(msg.createdAt) - new Date(normalizedMessage.createdAt));
              if (timeDiff < 10000) { // Increased to 10 seconds
            // Match by content similarity
            const msgContent = typeof msg.content === 'string' ? msg.content : msg.content?.text || '';
            const realContent = typeof normalizedMessage.content === 'string' ? normalizedMessage.content : normalizedMessage.content?.text || '';
            
            // For voice messages, match by attachment type, duration, and size
            if (msg.attachments?.length > 0 && normalizedMessage.attachments?.length > 0) {
              const msgAttachment = msg.attachments[0];
              const realAttachment = normalizedMessage.attachments[0];
                  
                  // Match voice messages by type, duration, and size (URLs will differ)
                  if (msgAttachment.type === 'audio' && realAttachment.type === 'audio') {
                    const durationMatch = !msgAttachment.duration || !realAttachment.duration || 
                                         Math.abs((msgAttachment.duration || 0) - (realAttachment.duration || 0)) < 3; // Increased tolerance
                    const sizeMatch = !msgAttachment.size || !realAttachment.size || 
                                    Math.abs((msgAttachment.size || 0) - (realAttachment.size || 0)) < 5000; // Increased to 5KB
                    
                    if (durationMatch && sizeMatch) {
                      optimisticIndex = i;
                      matchedOptimistic = msg;
                      break;
                    }
                  }
                  
                  // Match other attachments by name or URL
                  if (msgAttachment.name === realAttachment.name || 
                      msgAttachment.url === realAttachment.url) {
                    optimisticIndex = i;
                    matchedOptimistic = msg;
                    break;
                  }
                }
                
                // Match by content text
                if (msgContent === realContent && msgContent !== '') {
                  optimisticIndex = i;
                  matchedOptimistic = msg;
                  break;
                }
              }
            }
          }
          
          if (optimisticIndex !== -1 && matchedOptimistic) {
            // ✅ Replace optimistic message with real message
            const updated = [...filtered];
            updated[optimisticIndex] = { 
              ...normalizedMessage, 
              isOptimistic: false,
              // Preserve status from data if provided
              status: data.status || normalizedMessage.status || 'sent',
              // ✅ Preserve replyTo with content
              replyTo: normalizedMessage.replyTo || updated[optimisticIndex].replyTo,
              // ✅ CRITICAL: Preserve existing reactions if new message doesn't have them, or merge them
              reactions: normalizedMessage.reactions && normalizedMessage.reactions.length > 0 
                ? normalizedMessage.reactions 
                : (updated[optimisticIndex].reactions || []),
            };
            optimisticMessageRef.current = null;
            console.log('✅ Replaced optimistic message with real message:', normalizedMessage._id, 'Status:', updated[optimisticIndex].status);
            return updated;
          } else {
            // ✅ No optimistic message found - check if real message already exists
            const existingIndex = filtered.findIndex(msg => msg._id === normalizedMessage._id);
            if (existingIndex === -1) {
              // Add new message
              optimisticMessageRef.current = null;
              return [...filtered, { 
                ...normalizedMessage, 
                isOptimistic: false, 
                status: data.status || normalizedMessage.status || 'sent',
                // ✅ Preserve replyTo with content
                replyTo: normalizedMessage.replyTo,
                // ✅ CRITICAL: Preserve reactions if they exist
                reactions: normalizedMessage.reactions || [],
              }];
            } else {
              // Message already exists, merge updates while preserving existing reactions
              const updated = [...filtered];
              const existingMessage = updated[existingIndex];
              updated[existingIndex] = { 
                ...existingMessage, // Preserve existing message data
                ...normalizedMessage, // Apply new updates
                isOptimistic: false,
                status: data.status || normalizedMessage.status || existingMessage.status,
                // ✅ Preserve replyTo with content
                replyTo: normalizedMessage.replyTo || existingMessage.replyTo,
                // ✅ CRITICAL: Preserve existing reactions if new message doesn't have them, or merge them
                reactions: normalizedMessage.reactions && normalizedMessage.reactions.length > 0 
                  ? normalizedMessage.reactions 
                  : (existingMessage.reactions || []),
              };
              optimisticMessageRef.current = null;
              return updated;
            }
          }
        });
      }
    });

    // ✅ Listen for message status updates
    socket.on('message:status', (data) => {
      setMessages(prev => {
        // ✅ Update message status by messageId
        // ✅ CRITICAL: Status progression should only move forward: pending → sent → delivered → read
        // Never allow status to go backward (prevents delivered → sent issues)
        const statusOrder = { pending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
        
        const updated = prev.map(msg => {
          // Match by _id
          if (msg._id === data.messageId || msg._id === data.messageId?.toString()) {
            const currentOrder = statusOrder[msg.status] || 0;
            const newOrder = statusOrder[data.status] || 0;
            
            // ✅ Only update if new status is higher than current (or if current is failed)
            if (newOrder > currentOrder || msg.status === 'failed') {
              return { ...msg, status: data.status };
            }
            return msg; // Keep current status
          }
          // Match by tempId (for optimistic messages that haven't been replaced yet)
          if (msg.tempId === data.messageId || msg.tempId === data.messageId?.toString()) {
            const currentOrder = statusOrder[msg.status] || 0;
            const newOrder = statusOrder[data.status] || 0;
            
            // ✅ Only update if new status is higher than current (or if current is failed)
            if (newOrder > currentOrder || msg.status === 'failed') {
              return { ...msg, status: data.status };
            }
            return msg; // Keep current status
          }
          return msg;
        });
        
        // ✅ Also check if we need to update optimistic message ref
        if (optimisticMessageRef.current && 
            (optimisticMessageRef.current._id === data.messageId || 
             optimisticMessageRef.current.tempId === data.messageId)) {
          const currentOrder = statusOrder[optimisticMessageRef.current.status] || 0;
          const newOrder = statusOrder[data.status] || 0;
          if (newOrder > currentOrder || optimisticMessageRef.current.status === 'failed') {
            optimisticMessageRef.current.status = data.status;
          }
        }
        
        return updated;
      });
    });
    
    // ✅ Listen for incoming messages from agents (NOT from webchat user themselves)
    socket.on('message:new', (data) => {
      const rawMessage = data.message || data;
      
      // ✅ CRITICAL: Normalize attachments before processing (using the function defined above)
      const newMessage = normalizeAttachments(rawMessage);
      
      // ✅ CRITICAL: Skip if this is our own message (we already handled it via message:sent)
      // Webchat user's own messages have direction 'inbound' but we sent them
      // Only process messages from agents (direction 'outbound')
      if (newMessage.direction === 'inbound') {
        // This is likely our own message being echoed back - skip it
        console.log('⚠️ Skipping own message from message:new:', newMessage._id);
        return;
      }

      // ✅ CRITICAL: Prevent duplicates - comprehensive check
      setMessages(prev => {
        // First, check if message already exists by _id
        const existsById = prev.some(msg => msg._id === newMessage._id);
        if (existsById) {
          console.log('⚠️ Duplicate message by _id, skipping:', newMessage._id);
          return prev;
        }
        
        // Check if it's a duplicate by content and timestamp (within 10 seconds)
        const existsByContent = prev.some(msg => {
          if (msg._id === newMessage._id) return true;
          if (msg.tempId === newMessage._id || msg.tempId === newMessage._id?.toString()) return true;
          
          // Check content match
          const msgContent = typeof msg.content === 'string' ? msg.content : msg.content?.text || '';
          const newContent = typeof newMessage.content === 'string' ? newMessage.content : newMessage.content?.text || '';
          if (msgContent === newContent && msgContent !== '') {
            const timeDiff = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt));
            if (timeDiff < 10000) {
              console.log('⚠️ Duplicate message by content, skipping:', newMessage._id);
              return true;
            }
          }
          
          // Check attachment match (for voice messages, match by duration and size)
          if (msg.attachments?.length > 0 && newMessage.attachments?.length > 0) {
            const msgAttachment = msg.attachments[0];
            const newAttachment = newMessage.attachments[0];
            
            // For voice messages, match by type, duration, and size
            if (msgAttachment.type === 'audio' && newAttachment.type === 'audio') {
              const durationMatch = !msgAttachment.duration || !newAttachment.duration || 
                                   Math.abs((msgAttachment.duration || 0) - (newAttachment.duration || 0)) < 3;
              const sizeMatch = !msgAttachment.size || !newAttachment.size || 
                              Math.abs((msgAttachment.size || 0) - (newAttachment.size || 0)) < 5000;
              
              if (durationMatch && sizeMatch) {
                const timeDiff = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt));
                if (timeDiff < 10000) {
                  console.log('⚠️ Duplicate voice message by duration/size, skipping:', newMessage._id);
                  return true;
                }
              }
            }
            
            // Match by URL (for other attachments)
            if (msgAttachment.url === newAttachment.url) {
              const timeDiff = Math.abs(new Date(msg.createdAt) - new Date(newMessage.createdAt));
              if (timeDiff < 10000) {
                console.log('⚠️ Duplicate message by URL, skipping:', newMessage._id);
                return true;
              }
            }
          }
          
          return false;
        });
        
        if (existsByContent) return prev;
        
        // ✅ Play sound notification for new messages from agent
        if (newMessage.direction === 'outbound') {
          try {
            // ✅ Use preloaded audio from audioRef (instant playback)
            if (audioRef.current) {
              // Clone the audio to allow multiple plays
              const audioClone = audioRef.current.cloneNode();
              audioClone.volume = 0.5;
              audioClone.currentTime = 0; // Reset to start
              audioClone.play().catch(e => {
                console.debug('Audio play failed (non-critical):', e.message);
              });
            } else {
              // ✅ Fallback: Create new audio if preloaded one is not ready
              // ✅ Handle both default options
              let tuneUrl;
              if (selectedNotificationTune === 'default' || selectedNotificationTune === 'notification.mp3') {
                tuneUrl = '/sounds/notification.mp3';
              } else if (selectedNotificationTune === 'message.mp3') {
                tuneUrl = '/sounds/message.mp3';
              } else {
                tuneUrl = getProxiedNotificationTuneUrl(selectedNotificationTune);
              }
              
              const notificationAudio = new Audio(tuneUrl);
              notificationAudio.volume = 0.5;
              notificationAudio.crossOrigin = 'anonymous';
              notificationAudio.play().catch(e => {
                console.debug('Audio play failed (non-critical):', e.message);
              });
            }
          } catch (error) {
            console.debug('Audio play error (non-critical):', error.message);
          }
        }
        
        // ✅ Track unread messages
        if (newMessage.direction === 'outbound' && !newMessage.isRead) {
          setUnreadMessages(prev => [...prev, newMessage._id]);
        }
        
        // ✅ CRITICAL: Ensure attachments are properly formatted for voice messages
        // Normalize attachments structure to ensure voice messages display correctly
        const normalizedMessage = {
          ...newMessage,
          attachments: newMessage.attachments?.map(att => {
            // Ensure audio attachments have all required fields
            if (att.type === 'audio' || att.mimeType?.startsWith('audio/')) {
              return {
                ...att,
                type: att.type || 'audio',
                url: att.url || att.path || att.fileUrl,
                duration: att.duration || 0,
                size: att.size || 0,
                mimeType: att.mimeType || 'audio/mpeg',
                name: att.name || 'Voice message',
              };
            }
            return att;
          }) || [],
          // ✅ CRITICAL: Preserve sender information for reply preview
          sender: newMessage.sender || null,
          // ✅ CRITICAL: Preserve contact information
          contact: newMessage.contact || null,
          // ✅ CRITICAL: Preserve replyTo data for replies
          replyTo: newMessage.replyTo || null,
          // ✅ CRITICAL: Preserve reactions if they exist
          reactions: newMessage.reactions || [],
        };
        
        return [...prev, normalizedMessage];
      });
      scrollToBottom();
      
      // ✅ Emit 'delivered' status when visitor receives message from agent
      if (newMessage.direction === 'outbound' && newMessage._id && socket) {
        // Update message status to 'delivered' in real-time
        setMessages(prev => {
          const updated = prev.map(msg => {
            if (msg._id === newMessage._id) {
              return { ...msg, status: 'delivered' };
            }
            return msg;
          });
          return updated;
        });

        // Emit status update via socket (for agent to see)
        socket.emit('message:delivered', {
          messageId: newMessage._id,
          conversationId: newMessage.conversationId || session?.conversationId,
        });

        // ✅ Mark messages as read when they appear on screen (after a short delay)
        setTimeout(() => {
          markMessagesAsRead([newMessage._id]);
        }, 1000);
      }
    });

    socket.on('visitor:typing', (data) => {
      setIsAgentTyping(data.isTyping);
    });

    socket.on('agent:typing', (data) => {
      setIsAgentTyping(data.isTyping);
    });

    socket.on('typing:start', () => {
      setIsAgentTyping(true);
    });

    socket.on('typing:stop', () => {
      setIsAgentTyping(false);
    });

    socket.on('agent:status', (data) => {
      console.log('📡 Received agent status:', data);
      setIsOnline(data.isOnline);
    });

    socket.on('visitor:online', () => {
      setIsOnline(true);
    });

    socket.on('visitor:offline', () => {
      setIsOnline(false);
    });

    // ✅ Listen for message reaction events
    socket.on('message:reacted', (data) => {
      if (data.messageId && data.success) {
        // Reaction was successful - message will be updated via message:reaction event
        console.log('✅ Reaction confirmed:', data);
      }
    });

    socket.on('message:reaction', (data) => {
      console.log('📡 WebChat received message:reaction:', JSON.stringify(data));
      const { messageId, reaction, userId, userName, contactName } = data || {};
      if (!messageId) return;

      // ✅ Update message reactions in real-time - ensure only 1 reaction per user
      setMessages(prev => prev.map(msg => {
        if (msg._id === messageId || msg.tempId === messageId) {
          let reactions = [...(msg.reactions || [])]; // Create a copy to avoid mutation
          
          // ✅ Normalize userId for comparison (handle ObjectId, string, etc.)
          const normalizeId = (id) => {
            if (!id) return null;
            if (typeof id === 'string') return id;
            if (typeof id === 'object' && id.toString) return id.toString();
            return String(id);
          };
          
          const normalizedUserId = normalizeId(userId);
          
          if (reaction) {
            // ✅ Remove any existing reaction from this user first (ensure only 1 reaction per user)
            // Compare normalized IDs to handle ObjectId vs string
            reactions = reactions.filter(r => {
              const rUserId = normalizeId(r.user || r.contact);
              return rUserId !== normalizedUserId;
            });
            
            // Add new reaction with proper contact name
            // ✅ Prioritize: contactName from socket event > userName > session contact name > 'Visitor'
            // For agents/admins, use userName; for contacts, use contactName
            const displayName = contactName || userName || session?.contactInfo?.name || 'Visitor';
            // Determine if this reaction is from the visitor or an agent
            const myContactId = session?.contactId?.toString();
            const isFromVisitor = userId?.toString() === myContactId;

            reactions.push({
              emoji: reaction,
              user: isFromVisitor ? null : userId,       // Only set user for agents
              contact: isFromVisitor ? userId : null,     // Only set contact for visitors
              userName: userName || null,
              contactName: contactName || null,
              createdAt: new Date(),
            });
            return { ...msg, reactions };
          } else {
            // Remove reaction - compare normalized IDs
            return {
              ...msg,
              reactions: reactions.filter(r => {
                const rUserId = normalizeId(r.user || r.contact);
                return rUserId !== normalizedUserId;
              })
            };
          }
        }
        return msg;
      }));
    });

    // ✅ Listen for session info (company and agent information)
    socket.on('session:info', (data) => {
      console.log('📡 Received session info:', data);
      if (data.companyInfo) {
        console.log('✅ Setting companyInfo:', data.companyInfo);
        setCompanyInfo(data.companyInfo);
      }
      if (data.agentInfo) {
        console.log('✅ Setting agentInfo:', data.agentInfo);
        setAgentInfo(data.agentInfo);
      }
    });

    // ✅ Reconnection catch-up: merge missed messages into state
    socket.on('messages:catchup:response', (data) => {
      const missedMessages = data?.messages || [];
      if (missedMessages.length === 0) return;

      console.log(`✅ Received ${missedMessages.length} missed message(s) via catch-up`);

      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m._id?.toString()));
        const newMessages = missedMessages.filter(m => !existingIds.has(m._id?.toString()));

        if (newMessages.length === 0) return prev;

        // Merge and sort by creation time
        return [...prev, ...newMessages].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
      });
    });

    socket.on('error', (error) => {
      toast.error(error.message || 'Connection error');
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('message:new');
      socket.off('message:sent');
      socket.off('message:status');
      socket.off('visitor:typing');
      socket.off('agent:typing');
      socket.off('typing:start');
      socket.off('typing:stop');
      socket.off('agent:status');
      socket.off('visitor:online');
      socket.off('visitor:offline');
      socket.off('session:info');
      socket.off('messages:catchup:response');
      socket.off('message:reaction');
      socket.off('message:reacted');
      socket.off('error');
    };
  }, [socket, requestAgentStatus]);

  const loadMessages = useCallback(async (beforeMessageId = null, append = false) => {
    try {
      if (!session?.conversationId) return;
      
      if (append) {
        setIsLoadingMore(true);
      } else {
        // ✅ CRITICAL: Only show loading skeleton if there are no messages yet.
        // If messages already exist (including optimistic), don't flash the skeleton
        // — it causes a "page refresh" flicker when conversationId updates after first message.
        if (messagesLengthRef.current === 0) {
          setIsLoadingMessages(true);
        }
      }
      
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Build query params
      const params = new URLSearchParams({ limit: '50' });
      if (beforeMessageId) {
        params.append('before', beforeMessageId);
      }
      
      const response = await fetch(`/api/messages/${session.conversationId}?${params.toString()}`, {
        headers,
      });
      
      const data = await response.json();
      
      if (data.success && data.data) {
        const messagesArray = Array.isArray(data.data) ? data.data : (data.data.messages || []);

        // Normalize reactions — extract IDs as strings and display names
        const normalizedMessages = messagesArray.map(msg => {
          const normalizedReactions = (msg.reactions || []).map(r => {
            // Extract contact info — handle populated object, ObjectId, or string
            let contactId = null;
            let contactName = r.contactName || null;
            if (r.contact) {
              if (typeof r.contact === 'object' && r.contact._id) {
                contactId = r.contact._id.toString();
                contactName = contactName || r.contact.name || r.contact.displayName || null;
              } else {
                contactId = r.contact.toString();
              }
            }

            // Extract user info — handle populated object, ObjectId, or string
            let userId = null;
            let userName = r.userName || null;
            if (r.user) {
              if (typeof r.user === 'object' && r.user._id) {
                userId = r.user._id.toString();
                userName = userName || (r.user.firstName ? `${r.user.firstName} ${r.user.lastName || ''}`.trim() : null);
              } else {
                userId = r.user.toString();
              }
            }

            return {
              emoji: r.emoji,
              user: userId,
              contact: contactId,
              userName,
              contactName,
              createdAt: r.createdAt || new Date(),
            };
          });

          return {
            ...msg,
            reactions: normalizedReactions,
            attachments: normalizeAttachments(msg).attachments || [], // Normalize attachments
          };
        });

        // API returns messages in chronological order (oldest first)
        // Sort to ensure correct order regardless of API sort behavior
        const sortedMessages = normalizedMessages.sort((a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        if (append) {
          // Prepend older messages (they come from before cursor — older than current messages)
          setMessages(prev => [...sortedMessages, ...prev]);
          setHasMoreMessages(sortedMessages.length === 50);
        } else {
          // ✅ CRITICAL: When replacing messages, preserve any pending optimistic messages
          // that don't yet have a matching real message from the API.
          // This prevents the "message disappears" bug when loadMessages is triggered
          // by a conversationId change (e.g., first message creating a new conversation).
          setMessages(prev => {
            // Find optimistic messages not yet matched by a real message from API
            const pendingOptimistic = prev.filter(msg => {
              if (!msg.isOptimistic) return false;
              // Check if any fetched message matches this optimistic one
              const hasMatch = sortedMessages.some(real =>
                (real._id && msg._id && String(real._id) === String(msg._id)) ||
                (msg.tempId && real.metadata?.tempId === msg.tempId) ||
                (typeof msg.content === 'string' && typeof real.content === 'string' &&
                 msg.content === real.content &&
                 Math.abs(new Date(msg.createdAt) - new Date(real.createdAt)) < 15000)
              );
              return !hasMatch; // Keep optimistic messages that have no match
            });

            if (pendingOptimistic.length > 0) {
              console.log('✅ Preserving optimistic messages during loadMessages:', pendingOptimistic.length);
              return [...sortedMessages, ...pendingOptimistic];
            }
            return sortedMessages;
          });
          setHasMoreMessages(sortedMessages.length === 50);
          scrollToBottom();
        }
      } else if (response.status === 404) {
        // Conversation was deleted — clear conversationId so a fresh one is created on next message
        console.log('⚠️ Conversation not found (deleted), will create new on next message');
        setMessages([]);
        setHasMoreMessages(false);
        if (onSessionUpdate) {
          onSessionUpdate({ conversationId: null });
        }
      } else if (response.status === 403 || response.status === 401) {
        // Token expired or access denied — don't clear messages yet
        // The conversation still exists, the auth just needs refreshing
        console.log('⚠️ Auth expired for message history — messages preserved, will re-auth on next send');
        setHasMoreMessages(false);
      } else {
        console.error('Failed to load messages:', data.error);
        if (!append) {
          toast.error(data.error || 'Failed to load messages');
        }
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
      if (!append) {
        toast.error('Failed to load messages');
      }
      setHasMoreMessages(false);
    } finally {
      setIsLoadingMessages(false);
      setIsLoadingMore(false);
    }
  }, [session?.conversationId, token, onSessionUpdate]);

  // Keep ref in sync so the early useEffect can call it
  useEffect(() => { loadMessagesRef.current = loadMessages; }, [loadMessages]);

  // Load more messages (infinite scroll)
  const loadMoreMessages = useCallback(() => {
    if (isLoadingMore || !hasMoreMessages || messages.length === 0) return;
    
    // Get the oldest message ID
    const oldestMessage = messages[0];
    if (oldestMessage?._id) {
      loadMessages(oldestMessage._id, true);
    }
  }, [messages, isLoadingMore, hasMoreMessages, loadMessages]);

  // ✅ Debounced typing indicator (separate from state updates for instant UI)
  const handleTyping = useCallback(() => {
    if (!socket) return;

    // ✅ Emit typing immediately if not already typing
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing:start');
    }

    // ✅ Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // ✅ Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing:stop');
    }, 3000);
  }, [socket, isTyping]);

  const handleSend = async () => {
    if (sendingRef.current) return; // Prevent double-send
    if (!inputText.trim() && attachments.length === 0) return;
    if (!socket || !isConnected) {
      toast.error('Not connected to chat server');
      return;
    }
    sendingRef.current = true;

    const messageContent = inputText.trim();
    const messageAttachments = attachments.map(att => ({
      type: att.type,
      url: att.url,
      name: att.name,
      size: att.size,
      mimeType: att.mimeType,
    }));

    // ✅ Create unique tempId for optimistic message
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // ✅ Prepare replyTo with actual content for optimistic message
    const optimisticReplyTo = replyTo ? {
      _id: replyTo._id,
      content: replyTo.content || (replyTo.attachments?.length > 0
        ? `[${replyTo.type === 'image' ? 'Image' : replyTo.type === 'video' ? 'Video' : replyTo.type === 'audio' ? 'Audio' : 'Media'}]`
        : '[Message]'),
      type: replyTo.type || 'text',
      attachments: replyTo.attachments || [],
    } : null;
    
    const optimisticMessage = {
      _id: tempId,
      tempId,
      content: messageContent || '[Attachment]',
      type: attachments.length > 0 ? attachments[0].type : 'text',
      attachments: messageAttachments,
      direction: 'inbound',
      status: 'pending',
      createdAt: new Date(),
      isOptimistic: true,
      replyTo: optimisticReplyTo, // ✅ Include replyTo with actual content
    };

    // ✅ Store optimistic message ref for better matching
    optimisticMessageRef.current = optimisticMessage;

    setMessages(prev => [...prev, optimisticMessage]);
    setInputText('');
    setAttachments([]);
    setShowEmojiPicker(false);
    scrollToBottom();

    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit('typing:stop');

    // ✅ Send via socket with replyToId if replying
    socket.emit('message:send', {
      content: {
        type: attachments.length > 0 ? attachments[0].type : 'text',
        text: messageContent,
      },
      attachments: messageAttachments,
      replyToId: replyTo?._id || null, // ✅ Include replyToId
    });

    // ✅ Clear reply after sending
    setReplyTo(null);
    sendingRef.current = false;
  };

  // ✅ Handle reaction
  const handleReact = useCallback((messageId, emoji) => {
    if (!socket || !isConnected) {
      toast.error('Not connected to chat server');
      return;
    }

    // ✅ Check if CURRENT USER already reacted with this emoji (not just anyone)
    const message = messages.find(m => m._id === messageId || m.tempId === messageId);
    const currentContactId = session?.contactId || session?.contact?._id;
    
    if (message?.reactions && currentContactId) {
      const hasReacted = message.reactions.some(r => {
        const userId = r.user || r.contact;
        const userIdStr = typeof userId === 'string' ? userId : (userId?.toString ? userId.toString() : String(userId));
        const contactIdStr = typeof currentContactId === 'string' ? currentContactId : (currentContactId?.toString ? currentContactId.toString() : String(currentContactId));
        return userIdStr === contactIdStr && r.emoji === emoji;
      });
      
      if (hasReacted) {
        // Remove reaction (send null emoji)
        socket.emit('message:react', { messageId, emoji: null });
      } else {
        // Add reaction
        socket.emit('message:react', { messageId, emoji });
      }
    } else {
      // Add reaction
      socket.emit('message:react', { messageId, emoji });
    }
  }, [socket, isConnected, messages, session]);

  // ✅ Handle reply
  const handleReply = useCallback((message) => {
    setReplyTo(message);
    // Focus on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 100);
  }, []);

  // ✅ Handle copy - Only for text messages
  const handleCopy = useCallback((message) => {
    // ✅ Only allow copying text messages (not media, audio, etc.)
    if (message.type === 'text' && message.content && !message.attachments?.length) {
      const text = typeof message.content === 'string' 
        ? message.content 
        : message.content.text || '';
      if (text) {
        navigator.clipboard.writeText(text);
        toast.success('Message copied to clipboard');
      }
    }
  }, []);

  // ✅ Helper function to process and upload files (used by file input, paste, and drag-drop)
  const processAndUploadFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    // Validate file types
    const allowedTypes = [
      'image/', 'video/', 'audio/',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats',
      'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
      'text/plain', 'text/csv', 'application/zip', 'application/x-rar',
    ];
    const invalidFiles = fileArray.filter(file =>
      !allowedTypes.some(type => file.type.startsWith(type))
    );
    if (invalidFiles.length > 0) {
      toast.error(`Unsupported file type: ${invalidFiles[0].name}`);
      return;
    }

    // Validate individual file size (max 10MB per file)
    const oversizedFiles = fileArray.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast.error(`File "${oversizedFiles[0].name}" exceeds 10MB limit`);
      return;
    }

    if (attachments.length + fileArray.length > 10) {
      toast.error('Maximum 10 attachments allowed');
      return;
    }

    const totalSize = [...attachments, ...fileArray].reduce((sum, file) => sum + (file.size || 0), 0);
    if (totalSize > 20 * 1024 * 1024) {
      toast.error('Total file size exceeds 20MB limit');
      return;
    }

    setIsUploading(true);

    try {
      // ✅ Create preview immediately for instant display
      const previewFiles = fileArray.map(file => ({
        type: file.type.startsWith('image/') ? 'image' :
              file.type.startsWith('video/') ? 'video' :
              file.type.startsWith('audio/') ? 'audio' : 'document',
        url: typeof window !== 'undefined' && typeof URL !== 'undefined' 
          ? URL.createObjectURL(file) 
          : '', // Preview URL - only in browser
        name: file.name || `image-${Date.now()}.png`, // Default name for pasted images
        size: file.size,
        mimeType: file.type,
        isUploading: true,
      }));

      // ✅ Add preview immediately
      setAttachments(prev => [...prev, ...previewFiles]);

      // ✅ Upload files
      const uploadPromises = fileArray.map(async (file, index) => {
        const formData = new FormData();
        formData.append('file', file);

        const headers = {};
        // ✅ Include token in Authorization header for webchat uploads (Brave browser compatibility)
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/upload', {
          method: 'POST',
          headers,
          body: formData,
        });

        const data = await response.json();
        if (!data.success) {
          throw new Error(data.error || 'Upload failed');
        }

        return {
          type: file.type.startsWith('image/') ? 'image' :
                file.type.startsWith('video/') ? 'video' :
                file.type.startsWith('audio/') ? 'audio' : 'document',
          url: data.data.url,
          name: file.name || `image-${Date.now()}.png`,
          size: file.size,
          mimeType: file.type,
          isUploading: false,
        };
      });

      const uploadedFiles = await Promise.all(uploadPromises);
      
      // ✅ Replace preview files with uploaded files
      setAttachments(prev => {
        const withoutPreviews = prev.filter(att => !att.isUploading);
        return [...withoutPreviews, ...uploadedFiles];
      });
      
      toast.success(`${fileArray.length} file(s) attached`);

    } catch (error) {
      console.error('File upload error:', error);
      toast.error('Failed to upload file(s)');
      // Remove failed preview files
      setAttachments(prev => prev.filter(att => !att.isUploading));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [attachments, token]);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    await processAndUploadFiles(files);
  };

  // ✅ Handle paste event for images
  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

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
      await processAndUploadFiles(imageFiles);
    }
  }, [processAndUploadFiles]);

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

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processAndUploadFiles(files);
    }
  }, [processAndUploadFiles]);

  const handleEmojiSelect = (emoji) => {
    setInputText(prev => prev + emoji);
    // Keep picker open for multiple selections - don't close automatically
    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 100);
  };

  const handleSendVoice = async (audioBlob, duration) => {
    if (!socket || !isConnected) {
      toast.error('Not connected to chat server');
      setIsRecordingVoice(false);
      return;
    }

    // ✅ Hide recorder UI immediately
    setIsRecordingVoice(false);
    
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
        name: `voice-message.webm`,
        size: audioBlob.size,
        mimeType: audioBlob.type || 'audio/webm',
        duration: duration, // Duration in seconds
      }],
      direction: 'inbound',
      status: 'pending',
      createdAt: new Date(),
      isOptimistic: true,
    };

    optimisticMessageRef.current = optimisticMessage;
    setMessages(prev => [...prev, optimisticMessage]);
    scrollToBottom();

    // Upload and send in background
    setIsUploading(true);
    
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

      // Upload audio file
      const formData = new FormData();
      formData.append('file', audioBlob, `voice-message.${extension}`);

      const headers = {};
      // ✅ Include token in Authorization header for webchat uploads (Brave browser compatibility)
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        headers,
        body: formData,
      });

      const uploadData = await uploadResponse.json();
      
      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Upload failed');
      }

      const audioFile = uploadData.data;
      const mimeType = audioBlob.type || audioFile.mimeType || 'audio/webm';

      // ✅ Update optimistic message with real URL (don't create duplicate)
      setMessages(prev => prev.map(msg => {
        if (msg.tempId === tempId) {
          // ✅ Update the optimistic message with real URL
          return {
            ...msg,
            attachments: [{
              ...msg.attachments[0],
              url: audioFile.url, // Replace blob URL with S3 URL
            }]
          };
        }
        return msg;
      }));

      // Revoke blob URL
      if (blobUrl && typeof window !== 'undefined' && typeof URL !== 'undefined') {
        URL.revokeObjectURL(blobUrl);
      }

      // Send via socket
      socket.emit('message:send', {
        content: {
          type: 'audio',
          text: '🎤 Voice message',
        },
        attachments: [{
          type: 'audio',
          url: audioFile.url,
          name: `voice-message.${extension}`,
          size: audioBlob.size,
          mimeType: mimeType,
          duration: duration, // Duration in seconds
        }],
      });
    } catch (error) {
      console.error('Voice send error:', error);
      toast.error('Failed to send voice message');
      // Revoke blob URL on error to prevent memory leak
      if (blobUrl && typeof window !== 'undefined' && typeof URL !== 'undefined') {
        URL.revokeObjectURL(blobUrl);
      }
      // Remove failed optimistic message
      setMessages(prev => prev.filter(msg => msg.tempId !== tempId));
    } finally {
      setIsUploading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  if (isMinimized) {
    const lastAgentMessage = [...messages].reverse().find(m => m.direction === 'outbound');
    const unreadCount = messages.filter(m => !m.isRead && m.direction === 'outbound').length;
    return (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {lastAgentMessage && unreadCount > 0 && (
          <div className="max-w-[280px] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3 animate-in slide-in-from-bottom-2">
            <p className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">New message</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{lastAgentMessage.content || lastAgentMessage.text || '[Media]'}</p>
          </div>
        )}
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-200 flex items-center gap-2 min-h-[44px]"
        >
          <Maximize2 className="w-5 h-5" />
          <span>Open Chat</span>
          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      className={`fixed inset-0 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex flex-col ${isThemeChanging ? 'theme-changing' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Skip link for keyboard navigation */}
      <a href="#webchat-input" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-purple-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
        Skip to message input
      </a>
      {/* Header - Modern gradient design with theme toggle */}
      <motion.div 
        className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 dark:from-purple-800 dark:via-indigo-800 dark:to-purple-800 text-white px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between shadow-lg"
        initial={{ y: -50 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Left side - Avatar and Info - Responsive */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          <motion.div 
            className="relative flex-shrink-0"
            whileHover={{ scale: 1.1 }}
            transition={{ duration: 0.2 }}
          >
            {/* Agent Avatar or Status Icon */}
            {(agentInfo?.avatar || session?.agentInfo?.avatar) ? (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border-2 border-white/30 shadow-lg">
                <img 
                  src={agentInfo?.avatar || session?.agentInfo?.avatar} 
                  alt={(agentInfo?.name || session?.agentInfo?.name) || 'Agent'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to initials if image fails to load
                    const name = agentInfo?.name || session?.agentInfo?.name || 'A';
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = `<div class="w-full h-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-lg sm:text-xl font-bold">${name.charAt(0).toUpperCase()}</div>`;
                  }}
                />
              </div>
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center border-2 border-white/30">
                <span className="text-white text-lg sm:text-xl font-bold">
                  {(companyInfo?.name || session?.companyInfo?.name) ? (companyInfo?.name || session?.companyInfo?.name).charAt(0).toUpperCase() : (isOnline ? '●' : '○')}
                </span>
              </div>
            )}
            {isOnline && (
              <motion.div 
                className="absolute -bottom-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-400 rounded-full border-2 border-white"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
            )}
          </motion.div>
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Welcome Message - hidden on very small screens */}
            <div className="text-xs text-white/80 mb-1 truncate hidden sm:block">
              {welcomeMessage}
            </div>
            {/* Company Name */}
            <div className="font-semibold text-sm sm:text-base md:text-lg truncate">
              {(() => {
                const name = companyInfo?.name || session?.companyInfo?.name;
                return name || 'Support Team';
              })()}
            </div>
            {/* Agent Name or Status */}
            <div className="text-xs text-white/75 truncate">
              {(agentInfo?.name || session?.agentInfo?.name) ? (
                <span className="flex items-center gap-1">
                  <span className="truncate">{agentInfo?.name || session?.agentInfo?.name}</span>
                  {isOnline ? <span className="text-green-300 flex-shrink-0">• Online</span> : <span className="text-white/50 flex-shrink-0">• Offline</span>}
                </span>
              ) : (
                <span>{isOnline ? 'Online now' : 'Offline'}</span>
              )}
            </div>
            {/* User Name - Display logged in user - hidden on small screens */}
            {session?.contactInfo?.name && (
              <div className="text-xs text-purple-200/80 truncate mt-1 hidden sm:block">
                Logged in as: {session.contactInfo.name}
              </div>
            )}
          </div>
        </div>
        {/* Right side - Desktop buttons and Mobile menu */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Connection indicator - always visible */}
          {!isConnected && (
            <div className="flex items-center gap-1 text-white/80 text-xs">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden sm:inline">Reconnecting...</span>
            </div>
          )}
          
          {/* Desktop buttons - hidden on mobile */}
          <div className="hidden md:flex items-center gap-1 sm:gap-2">
            {/* Logout Button */}
            {onLogout && (
              <>
                <motion.button
                  onClick={() => setShowLogoutDialog(true)}
                  className="p-2.5 min-w-[44px] min-h-[44px] hover:bg-white/20 rounded-lg transition-colors"
                  title="Logout"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                </motion.button>
                
                {/* Logout Confirmation Dialog */}
                <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure you want to logout?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You will be logged out of your WebChat session. You can log back in anytime with your PIN.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          onLogout();
                          setShowLogoutDialog(false);
                        }}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Logout
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {/* Settings Button */}
            <motion.button
              onClick={() => setShowSettings(true)}
              className="p-2.5 min-w-[44px] min-h-[44px] hover:bg-white/20 rounded-lg transition-colors"
              title="Settings"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
            {/* Theme Toggle - Optimized for instant switching */}
            <motion.button
              onClick={() => {
                if (isThemeChanging) return; // Prevent multiple clicks
                setIsThemeChanging(true);
                const newTheme = theme === 'dark' ? 'light' : 'dark';
                
                // ✅ Use requestAnimationFrame for instant UI update
                requestAnimationFrame(() => {
                  setTheme(newTheme);
                  // Reset flag after a short delay
                  setTimeout(() => setIsThemeChanging(false), 100);
                });
              }}
              disabled={isThemeChanging}
              className="p-2.5 min-w-[44px] min-h-[44px] hover:bg-white/20 rounded-lg transition-colors disabled:opacity-50"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Moon className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </motion.button>
            <motion.button
              onClick={() => setIsMinimized(true)}
              className="p-2.5 min-w-[44px] min-h-[44px] hover:bg-white/20 rounded-lg transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </motion.button>
          </div>

          {/* Mobile menu - visible only on mobile */}
          <DropdownMenu open={showMobileMenu} onOpenChange={setShowMobileMenu}>
            <DropdownMenuTrigger asChild>
              <motion.button
                className="md:hidden p-2.5 min-w-[44px] min-h-[44px] hover:bg-white/20 rounded-lg transition-colors"
                title="Menu"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Menu className="w-5 h-5" />
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="end" 
              className="w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg"
            >
              {/* Settings */}
              <DropdownMenuItem
                onClick={() => {
                  setShowSettings(true);
                  setShowMobileMenu(false);
                }}
                className="flex items-center gap-2 cursor-pointer focus:bg-gray-100 dark:focus:bg-gray-700"
              >
                <Settings className="w-4 h-4" />
                <span className="text-gray-900 dark:text-gray-100">Settings</span>
              </DropdownMenuItem>
              
              {/* Theme Toggle */}
              <DropdownMenuItem
                onClick={() => {
                  if (isThemeChanging) return;
                  setIsThemeChanging(true);
                  const newTheme = theme === 'dark' ? 'light' : 'dark';
                  requestAnimationFrame(() => {
                    setTheme(newTheme);
                    setTimeout(() => setIsThemeChanging(false), 100);
                  });
                  setShowMobileMenu(false);
                }}
                disabled={isThemeChanging}
                className="flex items-center gap-2 cursor-pointer focus:bg-gray-100 dark:focus:bg-gray-700 disabled:opacity-50"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-4 h-4" />
                    <span className="text-gray-900 dark:text-gray-100">Light Mode</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4" />
                    <span className="text-gray-900 dark:text-gray-100">Dark Mode</span>
                  </>
                )}
              </DropdownMenuItem>
              
              {/* Minimize */}
              <DropdownMenuItem
                onClick={() => {
                  setIsMinimized(true);
                  setShowMobileMenu(false);
                }}
                className="flex items-center gap-2 cursor-pointer focus:bg-gray-100 dark:focus:bg-gray-700"
              >
                <Minimize2 className="w-4 h-4" />
                <span className="text-gray-900 dark:text-gray-100">Minimize</span>
              </DropdownMenuItem>
              
              {/* Logout - only if onLogout is provided */}
              {onLogout && (
                <>
                  <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                  <DropdownMenuItem
                    onClick={() => {
                      setShowLogoutDialog(true);
                      setShowMobileMenu(false);
                    }}
                    className="flex items-center gap-2 cursor-pointer focus:bg-red-50 dark:focus:bg-red-900/20 text-red-600 dark:text-red-400"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      {/* Messages Area with Loading State */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900/50 dark:to-gray-800/50">
        <AnimatePresence mode="wait">
          {isLoadingMessages ? (
            <motion.div
              key="loading"
              className="flex flex-col gap-4 py-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Message skeleton - incoming */}
              <div className="flex justify-start">
                <div className="max-w-[70%] space-y-2">
                  <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                  <div className="h-16 w-48 bg-gray-200 dark:bg-gray-700 rounded-2xl rounded-bl-md animate-pulse" />
                </div>
              </div>
              {/* Message skeleton - outgoing */}
              <div className="flex justify-end">
                <div className="max-w-[70%] space-y-2 flex flex-col items-end">
                  <div className="h-12 w-56 bg-purple-200 dark:bg-purple-800/40 rounded-2xl rounded-br-md animate-pulse" />
                </div>
              </div>
              {/* Message skeleton - incoming */}
              <div className="flex justify-start">
                <div className="max-w-[70%] space-y-2">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                  <div className="h-10 w-40 bg-gray-200 dark:bg-gray-700 rounded-2xl rounded-bl-md animate-pulse" />
                </div>
              </div>
              {/* Message skeleton - outgoing */}
              <div className="flex justify-end">
                <div className="max-w-[70%]">
                  <div className="h-14 w-52 bg-purple-200 dark:bg-purple-800/40 rounded-2xl rounded-br-md animate-pulse" />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="messages"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
            <WebChatMessageList 
              messages={messages.map(msg => ({
                ...msg,
                onReact: handleReact,
                onReply: handleReply,
                onCopy: handleCopy,
                socket,
                conversationId: conversationId || session?.conversationId,
                currentContactId: session?.contactId || session?.contact?._id, // ✅ Pass currentContactId
              }))} 
              session={session}
              messagesEndRef={messagesEndRef}
              showWelcome={messages.length === 0}
              welcomeMessage={session?.welcomeMessage}
              agentName={agentInfo?.name || session?.agentInfo?.name || companyInfo?.name || session?.companyInfo?.name || 'Support Team'}
              companyName={companyInfo?.name || session?.companyInfo?.name}
              companyInfo={companyInfo || session?.companyInfo}
              agentInfo={agentInfo || session?.agentInfo}
              onLoadMore={loadMoreMessages}
              isLoadingMore={isLoadingMore}
              hasMoreMessages={hasMoreMessages}
            />
              {isAgentTyping && <WebChatTypingIndicator />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Composer - Modern design with proper overflow handling */}
      <div className="sticky bottom-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-3 sm:p-4 shadow-lg relative z-10">
        {/* Voice Recorder - Replace composer when recording */}
        {isRecordingVoice ? (
          <WebChatVoiceRecorder
            onSend={handleSendVoice}
            onCancel={() => setIsRecordingVoice(false)}
          />
        ) : (
          <>
            {/* Reply Preview */}
            {replyTo && (
              <div className="mb-3 p-3 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 rounded-xl border border-purple-200 dark:border-purple-700 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Reply className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                    <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                      Replying to {(() => {
                        // ✅ For agent messages (outbound), check sender.name first
                        if (replyTo.sender?.name) {
                          return replyTo.sender.name;
                        }
                        // ✅ Fallback to sender.firstName (for some message formats)
                        if (replyTo.sender?.firstName) {
                          return replyTo.sender.lastName 
                            ? `${replyTo.sender.firstName} ${replyTo.sender.lastName}`.trim()
                            : replyTo.sender.firstName;
                        }
                        // ✅ For contact messages, use contact name
                        if (replyTo.contact?.name) {
                          return replyTo.contact.name;
                        }
                        // ✅ Fallback to agentInfo if available (for agent messages)
                        if (agentInfo?.name) {
                          return agentInfo.name;
                        }
                        // ✅ Fallback to session agentInfo
                        if (session?.agentInfo?.name) {
                          return session.agentInfo.name;
                        }
                        // ✅ Last resort: check if it's an outbound message (from agent)
                        if (replyTo.direction === 'outbound') {
                          return 'Agent';
                        }
                        // ✅ Default fallback
                        return 'Unknown';
                      })()}
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                    {replyTo.content || '[Media]'}
                  </p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Cancel reply"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Emoji Picker - Positioned on the left, above emoji button */}
            <div className="absolute bottom-full left-0 mb-2 z-[100]" data-emoji-picker>
              <WebChatEmojiPicker 
                onSelect={handleEmojiSelect} 
                isOpen={showEmojiPicker}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>
            
            {/* Attachment Preview */}
            {attachments.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2 max-h-24 sm:max-h-32 overflow-y-auto">
                {attachments.map((att, index) => (
                  <div key={index} className="relative bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-xl p-2 max-w-xs shadow-sm border border-gray-200 dark:border-gray-600 group">
                    {/* Uploading indicator */}
                    {att.isUploading && (
                      <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                      </div>
                    )}
                    
                    {/* Image preview */}
                    {att.type === 'image' && att.url && (
                      <img
                        src={att.url}
                        alt={att.name}
                        className="w-full h-24 object-cover rounded-lg mb-1"
                      />
                    )}
                    
                    {/* File info */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate font-medium text-gray-900 dark:text-gray-100">{att.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {att.isUploading ? 'Uploading...' : att.size ? `${(att.size / 1024).toFixed(1)} KB` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                        className="flex-shrink-0 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 transition-colors shadow-md"
                        title="Remove attachment"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex items-center gap-1.5 sm:gap-2 w-full">
              {/* File Input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
              />
              
              {/* Attachment Button */}
              <motion.button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Attach file"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </motion.button>

              {/* Emoji Button */}
              <motion.button
                ref={emojiButtonRef}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                disabled={isRecordingVoice}
                className={`flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors disabled:opacity-50 ${showEmojiPicker ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' : ''}`}
                title="Add emoji"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
              </motion.button>

              {/* Text Input Container - WhatsApp style with mic icon inside */}
              <div 
                className={`flex-1 relative min-w-0 ${isDragging ? 'ring-2 ring-purple-500 dark:ring-purple-400 bg-purple-50 dark:bg-purple-900/20 rounded-xl' : ''}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <textarea
                  id="webchat-input"
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => {
                    // ✅ Update state immediately for instant UI response
                    const newValue = e.target.value;
                    setInputText(newValue);
                    
                    // ✅ Debounce typing indicator separately (non-blocking)
                    // Use requestIdleCallback or setTimeout(0) to not block UI
                    if (typeof window !== 'undefined' && window.requestIdleCallback) {
                      window.requestIdleCallback(() => handleTyping(), { timeout: 100 });
                    } else {
                      setTimeout(() => handleTyping(), 0);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  onPaste={handlePaste}
                  placeholder="Type a message... (Shift+Enter for new line)"
                  rows={1}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pr-10 sm:pr-12 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 focus:border-purple-500 dark:focus:border-purple-400 resize-none max-h-32 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition-all text-sm sm:text-base leading-normal"
                  style={{ minHeight: '40px', paddingTop: '10px', paddingBottom: '10px' }}
                />
                
                {/* Microphone Icon - Inside textarea (WhatsApp style) */}
                {!inputText.trim() && attachments.length === 0 && (
                  <motion.button
                    onClick={() => setIsRecordingVoice(true)}
                    disabled={isUploading || isRecordingVoice}
                    className={`absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isRecordingVoice ? 'text-purple-600 dark:text-purple-400' : ''}`}
                    title="Record voice message"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Mic className="w-5 h-5 sm:w-6 sm:h-6" />
                  </motion.button>
                )}
              </div>

              {/* Send Button - Show when there's text */}
              {inputText.trim() || attachments.length > 0 ? (
                <motion.button
                  onClick={handleSend}
                  disabled={!isConnected || isUploading}
                  className="flex-shrink-0 w-11 h-11 sm:w-10 sm:h-10 md:w-11 md:h-11 flex items-center justify-center bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-700 dark:to-indigo-700 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 dark:hover:from-purple-600 dark:hover:to-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:transform-none"
                  title="Send message"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                </motion.button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Profile Settings Modal */}
      <WebChatProfileSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        token={token}
        onSettingsUpdate={(settings) => {
          // ✅ Update selected notification tune when changed in settings (instant update)
          if (settings.selectedNotificationTune !== undefined) {
            console.log('🔔 Updating notification tune to:', settings.selectedNotificationTune);
            setSelectedNotificationTune(settings.selectedNotificationTune);
            // The useEffect with selectedNotificationTune dependency will automatically reload the audio
          }
        }}
        onLogout={onLogout}
      />
    </motion.div>
  );
}
