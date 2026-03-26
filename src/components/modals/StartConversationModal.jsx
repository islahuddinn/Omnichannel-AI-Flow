// src/components/modals/StartConversationModal.jsx
'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Phone, Mail, Share2, Copy, Check, Users, X, Search, Plus, Trash2, AlertCircle, Building2, PhoneCall, Loader2 } from 'lucide-react';
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
import { motion, AnimatePresence } from 'framer-motion';
import apiClient from '@/lib/api/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import PhoneInput from '@/components/shared/PhoneInput';
import PhoneNumberDisplay from '@/components/shared/PhoneNumberDisplay';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import Pagination from '@/components/shared/Pagination';
import { parsePhoneNumber } from 'libphonenumber-js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Check as CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACTIVE_TAB_CLASSES } from '@/constants/ui';
import { useDepartmentStore } from '@/store/useDepartmentStore';
import MessageComposerModal from './MessageComposerModal';

export default function StartConversationModal({ open, onClose, contactId = null, isViewOnly = false }) {
  const router = useRouter();
  const { user } = useAuth();
  const { selectedDepartment } = useDepartmentStore();
  const [channel, setChannel] = useState('phone');
  const [identifier, setIdentifier] = useState('');
  const [emailIdentifier, setEmailIdentifier] = useState('');
  const [contactName, setContactName] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [showAccountSelection, setShowAccountSelection] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [pendingData, setPendingData] = useState(null);
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [selectedPhoneChannel, setSelectedPhoneChannel] = useState('whatsapp');
  
  // Message composer modal state
  const [showComposerModal, setShowComposerModal] = useState(false);
  const [composerData, setComposerData] = useState(null);
  
  // Bulk SMS state
  const [bulkSmsMessage, setBulkSmsMessage] = useState('');
  const [bulkSmsSearch, setBulkSmsSearch] = useState('');
  const [bulkSmsSelectedContacts, setBulkSmsSelectedContacts] = useState(new Set());
  const [bulkSmsManualNumbers, setBulkSmsManualNumbers] = useState([]);
  const [bulkSmsManualNumberInput, setBulkSmsManualNumberInput] = useState('');
  const [bulkSmsSelectedAccount, setBulkSmsSelectedAccount] = useState('');
  
  // WebChat contact list state
  const [webchatSearch, setWebchatSearch] = useState('');
  const [webchatSelectedContact, setWebchatSelectedContact] = useState(null);
  const [webchatSelectedAccount, setWebchatSelectedAccount] = useState('');
  
  // Error state for department access errors
  const [departmentError, setDepartmentError] = useState(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setChannel('phone');
      setIdentifier('');
      setEmailIdentifier('');
      setContactName('');
      setSelectedAccount('');
      setSelectedPhoneChannel(isViewOnly ? 'call' : 'whatsapp');
      setGeneratedLink('');
      setLinkCopied(false);
      setShowAccountSelection(false);
      setBulkSmsMessage('');
      setBulkSmsSearch('');
      setBulkSmsSelectedContacts(new Set());
      setBulkSmsManualNumbers([]);
      setBulkSmsManualNumberInput('');
      setBulkSmsSelectedAccount('');
      setWebchatSearch('');
      setWebchatSelectedContact(null);
      setWebchatSelectedAccount('');
      setDepartmentError(null);
    }
  }, [open, isViewOnly]);

  const handleChannelChange = useCallback((value) => {
    setChannel(value);
    if (value === 'phone') {
      setSelectedPhoneChannel('whatsapp');
    }
  }, []);

  const handlePhoneChange = useCallback((value) => {
    setIdentifier(value);
  }, []);

  const handleEmailChange = useCallback((e) => {
    setEmailIdentifier(e.target.value);
  }, []);

  const handleContactNameChange = useCallback((e) => {
    setContactName(e.target.value);
  }, []);

  const startMutation = useMutation({
    mutationFn: (data) => apiClient.post('/conversations/start', data),
    onSuccess: (response) => {
      const { data } = response;

      if (data.requiresAccountSelection) {
        setAvailableAccounts(data.availableAccounts);
        const effectiveIdentifier = channel === 'email' ? emailIdentifier : identifier;
        setPendingData({ channel: channel === 'phone' ? selectedPhoneChannel : channel, identifier: effectiveIdentifier, contactName });
        setShowAccountSelection(true);
        return;
      }

      // If conversation already exists, navigate directly to it
      if (data.type === 'existing' && data.conversationId) {
        toast.success('Opening existing conversation');
        router.push(`/c/conversations/${data.conversationId}`);
        onClose();
        return;
      }

      // For webchat, handle like other channels - open message composer for new conversations
      // Only navigate directly if conversation already exists and has messages
      if (channel === 'webchat' && data.type === 'existing' && data.conversationId) {
        toast.success('Opening existing WebChat conversation');
        router.push(`/c/conversations/${data.conversationId}`);
        onClose();
        return;
      }

      // Open message composer modal for new conversations (including webchat)
      const effectiveChannel = channel === 'phone' ? selectedPhoneChannel : channel;
      const effectiveIdentifier = channel === 'email' ? emailIdentifier : (channel === 'webchat' ? (webchatSelectedContact?.identifiers?.webchat || webchatSelectedContact?.webchatLink?.split('/').pop() || identifier) : identifier);
      
      // For webchat, use selected contact data if available
      const contactDataForComposer = channel === 'webchat' && webchatSelectedContact ? {
        _id: webchatSelectedContact._id,
        name: webchatSelectedContact.name || webchatSelectedContact.displayName || null,
        displayName: webchatSelectedContact.displayName || webchatSelectedContact.name || null,
        phone: webchatSelectedContact.phone || null,
        email: webchatSelectedContact.email || null,
        webchatLink: webchatSelectedContact.webchatLink || null,
        identifiers: webchatSelectedContact.identifiers || {}
      } : (data.contact || {
        _id: data.contact?._id,
        name: contactName || data.contact?.name || null,
        displayName: contactName || data.contact?.displayName || null,
        phone: effectiveChannel !== 'email' ? effectiveIdentifier : null,
        email: effectiveChannel === 'email' ? effectiveIdentifier : null,
      });
      
      setComposerData({
        conversationData: data,
        contactData: contactDataForComposer,
        channelAccount: data.channelAccount || (data.availableAccounts?.[0]),
        availableAccounts: data.availableAccounts || [],
        channelType: effectiveChannel,
        identifier: effectiveIdentifier,
        contactName: channel === 'webchat' && webchatSelectedContact ? (webchatSelectedContact.name || webchatSelectedContact.displayName || '') : contactName
      });
      
      // Close the start modal and open composer modal
      setShowComposerModal(true);
      onClose();
    },
    onError: (error) => {
      // ✅ Handle department access error with beautiful display
      const errorData = error.response?.data || error.data || {};
      if (errorData.errorCode === 'CONVERSATION_EXISTS_IN_OTHER_DEPARTMENT' || 
          errorData.error?.includes('already exists in')) {
        setDepartmentError({
          message: errorData.error || 'A conversation with this contact already exists in another department',
          departmentName: errorData.departmentName || 'another department'
        });
        return;
      }
      setDepartmentError(null);
      toast.error(errorData.error || error.message || 'Failed to start conversation');
    }
  });

  const createFromCallMutation = useMutation({
    mutationFn: (data) => apiClient.post('/conversations/create-from-call', data),
    onSuccess: (response) => {
      const data = response?.data ?? response;
      if (data?.conversationId) {
        toast.success('Call conversation created');
        router.push(`/c/conversations/${data.conversationId}`);
      } else {
        toast.success('Call conversation created');
      }
      onClose();
    },
    onError: (error) => {
      const errorData = error.response?.data || error.data || {};
      toast.error(errorData.error || error.message || 'Failed to create call conversation');
    },
  });

  const webChatLinkMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.post('/webchat/contact-link', data);
      return response;
    },
    onSuccess: (response) => {
      if (response.success && response.data?.contactLink) {
        setGeneratedLink(response.data.contactLink);
        setLinkCopied(false);
        toast.success('WebChat link generated successfully!');
      } else {
        toast.error('Failed to generate link: Invalid response');
      }
    },
    onError: (error) => {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to generate WebChat link';
      toast.error(errorMessage);
    }
  });

  const handleStart = () => {
    // When Call is selected in phone tab (or view-only mode), use create-from-call API
    if (isViewOnly || (channel === 'phone' && selectedPhoneChannel === 'call')) {
      if (!identifier.trim()) {
        toast.error('Please enter phone number');
        return;
      }
      createFromCallMutation.mutate({
        phoneNumber: identifier.trim(),
        channelAccountId: null,
        departmentId: selectedDepartment?._id || (user?.departments?.[0]?._id || user?.departments?.[0]) || null,
        contactName: contactName?.trim() || null,
      });
      return;
    }

    if (channel === 'webchat') {
      // If a contact is selected, start conversation with that contact
      if (webchatSelectedContact) {
        startMutation.mutate({
          channel: 'webchat',
          identifier: webchatSelectedContact.identifiers?.webchat || webchatSelectedContact.webchatLink?.split('/').pop(),
          contactName: webchatSelectedContact.name || webchatSelectedContact.displayName || '',
          channelAccountId: webchatSelectedAccount || undefined,
          departmentId: selectedDepartment?._id || (user?.departments?.[0]?._id || user?.departments?.[0]) || undefined
        });
        return;
      }
      // Otherwise, generate new link
      webChatLinkMutation.mutate({
        channelAccountId: webchatSelectedAccount || undefined,
        contactId: contactId || undefined,
      });
      return;
    }

    const effectiveIdentifier = channel === 'email' ? emailIdentifier : identifier;
    const effectiveChannel = channel === 'phone' ? selectedPhoneChannel : channel;

    if (!effectiveIdentifier.trim()) {
      toast.error('Please enter contact identifier');
      return;
    }

    // ✅ Validate contact name is required
    if (!contactName.trim()) {
      toast.error('Contact name is required');
      return;
    }

    startMutation.mutate({
      channel: effectiveChannel,
      identifier: effectiveIdentifier.trim(),
      contactName: contactName.trim(),
      channelAccountId: selectedAccount || undefined,
      departmentId: selectedDepartment?._id || (user?.departments?.[0]?._id || user?.departments?.[0]) || undefined
    });
  };

  const handleAccountSelected = async () => {
    if (!selectedAccount) {
      toast.error('Please select an account');
      return;
    }

    const effectiveChannel = pendingData.channel;
    const effectiveIdentifier = pendingData.identifier;

    // Check if conversation already exists before opening modal
    try {
      const response = await apiClient.post('/conversations/start', {
        channel: effectiveChannel,
        identifier: effectiveIdentifier,
        contactName: pendingData.contactName,
        channelAccountId: selectedAccount
      });

      const data = response?.data;

      // If conversation exists, navigate directly
      if (data?.type === 'existing' && data?.conversationId) {
        toast.success('Opening existing conversation');
        router.push(`/c/conversations/${data.conversationId}`);
        setShowAccountSelection(false);
        onClose();
        return;
      }

      // Find the selected account from available accounts
      const selectedAccountData = availableAccounts.find(acc => acc._id === selectedAccount);

      // Open message composer modal with selected account for new conversation
      setComposerData({
        conversationData: data,
        contactData: data.contact || {
          name: pendingData.contactName || null,
          displayName: pendingData.contactName || null,
          phone: effectiveChannel !== 'email' ? effectiveIdentifier : null,
          email: effectiveChannel === 'email' ? effectiveIdentifier : null,
        },
        channelAccount: selectedAccountData || data.channelAccount,
        availableAccounts: availableAccounts,
        channelType: effectiveChannel,
        identifier: effectiveIdentifier,
        contactName: pendingData.contactName
      });
      
      setShowAccountSelection(false);
      setShowComposerModal(true);
      onClose();
    } catch (error) {
      console.error('Error checking conversation:', error);
      toast.error('Failed to check conversation');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  const handleReset = () => {
    setGeneratedLink('');
    setSelectedAccount('');
    setLinkCopied(false);
  };

  if (showAccountSelection) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Multiple accounts available. Please select which account to use:
            </p>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {availableAccounts.map((acc) => (
                  <SelectItem key={acc._id} value={acc._id}>
                    {acc.name} ({acc.identifier})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={handleAccountSelected} disabled={startMutation.isPending}>
                Continue
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setShowAccountSelection(false)}
                className="border-border hover:bg-muted hover:border-border text-muted-foreground"
              >
                Back
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (generatedLink) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">WebChat Link Generated</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                ✅ Link generated successfully! Share this link with your contact.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">WebChat Link</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative group">
                  <Input 
                    value={generatedLink} 
                    readOnly 
                    className="font-mono text-sm pr-24 bg-muted border-border cursor-text hover:bg-muted transition-colors"
                    onClick={(e) => {
                      e.target.select();
                      copyLink();
                    }}
                    onFocus={(e) => {
                      e.target.select();
                      copyLink();
                    }}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    Click to copy
                  </div>
                </div>
                <Button 
                  onClick={copyLink}
                  className={`min-w-[110px] shrink-0 ${linkCopied ? "" : "border-border hover:bg-muted hover:border-border text-muted-foreground"}`}
                  variant={linkCopied ? "default" : "outline"}
                  size="default"
                >
                  {linkCopied ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Link
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Click on the link field or use the copy button to copy the link
              </p>
            </div>

            <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-lg p-4">
              <p className="text-xs text-primary">
                <strong>📌 Important:</strong> The contact will enter their 4-digit PIN when they first access this link. No PIN is provided upfront.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                onClick={handleReset} 
                variant="outline" 
                className="flex-1 border-border hover:bg-muted hover:border-border text-muted-foreground"
              >
                Generate Another Link
              </Button>
              <Button 
                onClick={onClose} 
                className="flex-1"
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="overflow-hidden p-0 gap-0 transition-all duration-400 ease-in-out"
        style={{
          width: channel === 'bulk-sms' ? '95vw' : '95vw',
          maxWidth: channel === 'bulk-sms' ? '56rem' : '42rem',
        }}
      >
        <div className="flex flex-col h-full max-h-[90vh] w-full">
          <DialogHeader className={`px-4 sm:px-6 pt-4 pb-3 border-b bg-muted/50 shrink-0 ${channel === 'bulk-sms' ? 'px-6' : ''}`}>
            <DialogTitle className="text-xl sm:text-2xl font-semibold text-center">New Conversation</DialogTitle>
          </DialogHeader>

          {/* Department Access Error Display */}
          {departmentError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-4 sm:mx-6 mt-4 mb-0"
            >
              <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-lg p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1.5">
                      Conversation Already Exists
                    </h3>
                    <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
                      A conversation with this contact already exists in{' '}
                      <span className="font-semibold inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" />
                        {departmentError.departmentName}
                      </span>
                      . Each department maintains separate conversations with contacts.
                    </p>
                    <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        💡 <strong>Tip:</strong> To access this conversation, you need to be assigned to that department or contact your administrator.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDepartmentError(null)}
                    className="h-8 w-8 p-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          <div className={`flex-1 overflow-y-auto min-h-0 ${channel === 'bulk-sms' ? 'px-5' : 'px-6'} py-4`}>
            <div className={channel === 'bulk-sms' ? 'min-h-full flex flex-col' : 'space-y-6'}>
              <Tabs value={channel} onValueChange={handleChannelChange}>
                {/* Channel Selection */}
                <motion.div 
                  className="flex justify-center mb-6"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <TabsList className={`grid w-full max-w-2xl gap-3 px-2 ${isViewOnly ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-4'}`}>
                    <TabsTrigger 
                      value="phone" 
                      className={`flex items-center gap-2 ${ACTIVE_TAB_CLASSES.trigger}`}
                    >
                      <Phone className="h-4 w-4" />
                      {isViewOnly ? <span>Call</span> : (<><span className="hidden sm:inline">New Chat</span><span className="sm:hidden">Chat</span></>)}
                    </TabsTrigger>
                    {!isViewOnly && (
                      <>
                        <TabsTrigger 
                          value="email"
                          className={`flex items-center gap-2 ${ACTIVE_TAB_CLASSES.trigger}`}
                        >
                          <Mail className="h-4 w-4" />
                          <span>Email</span>
                        </TabsTrigger>
                        <TabsTrigger 
                          value="webchat"
                          className={`flex items-center gap-2 ${ACTIVE_TAB_CLASSES.trigger}`}
                        >
                          <Share2 className="h-4 w-4" />
                          <span>WebChat</span>
                        </TabsTrigger>
                        <TabsTrigger 
                          value="bulk-sms"
                          className={`flex items-center gap-2 ${ACTIVE_TAB_CLASSES.trigger}`}
                        >
                          <Users className="h-4 w-4" />
                          <span>Bulk SMS</span>
                        </TabsTrigger>
                      </>
                    )}
                  </TabsList>
                </motion.div>

                <AnimatePresence mode="wait" initial={false}>
                  {channel === 'webchat' ? (
                    <WebChatTab
                      search={webchatSearch}
                      setSearch={setWebchatSearch}
                      selectedContact={webchatSelectedContact}
                      setSelectedContact={setWebchatSelectedContact}
                      selectedAccount={webchatSelectedAccount}
                      setSelectedAccount={setWebchatSelectedAccount}
                      onStartConversation={handleStart}
                      onGenerateLink={() => {
                        webChatLinkMutation.mutate({
                          channelAccountId: webchatSelectedAccount || undefined,
                          contactId: contactId || undefined,
                        });
                      }}
                      isGeneratingLink={webChatLinkMutation.isPending}
                      isStartingConversation={startMutation.isPending}
                    />
                  ) : channel === 'email' ? (
                    <motion.div
                      key="email"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      <div>
                        <Label htmlFor="contact-name-email" className="text-sm font-medium mb-2 block">
                          Contact Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="contact-name-email"
                          value={contactName}
                          onChange={handleContactNameChange}
                          placeholder="John Doe"
                          required
                          className="w-full bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary"
                        />
                      </div>

                      <div>
                        <Label htmlFor="email-identifier" className="text-sm font-medium mb-2 block">
                          Email Address <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="email-identifier"
                          type="email"
                          value={emailIdentifier}
                          onChange={handleEmailChange}
                          placeholder="contact@example.com"
                          aria-required="true"
                          className="w-full bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary"
                        />
                      </div>

                      <Button 
                        onClick={handleStart} 
                        disabled={startMutation.isPending || !emailIdentifier.trim()}
                        className="w-full sm:w-auto min-w-[200px] mx-auto block"
                        size="lg"
                      >
                        {startMutation.isPending ? (
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Starting...</span>
                          </div>
                        ) : 'Start Conversation'}
                      </Button>
                    </motion.div>
                  ) : channel === 'bulk-sms' ? (
                    <motion.div
                      key="bulk-sms"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                    >
                      <BulkSMSTab
                        message={bulkSmsMessage}
                        setMessage={setBulkSmsMessage}
                        search={bulkSmsSearch}
                        setSearch={setBulkSmsSearch}
                        selectedContacts={bulkSmsSelectedContacts}
                        setSelectedContacts={setBulkSmsSelectedContacts}
                        manualNumbers={bulkSmsManualNumbers}
                        setManualNumbers={setBulkSmsManualNumbers}
                        manualNumberInput={bulkSmsManualNumberInput}
                        setManualNumberInput={setBulkSmsManualNumberInput}
                        selectedAccount={bulkSmsSelectedAccount}
                        setSelectedAccount={setBulkSmsSelectedAccount}
                        onClose={onClose}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="phone"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-5"
                    >
                      <div>
                        <Label htmlFor="contact-name-phone" className="text-sm font-medium mb-2 block">
                          Contact Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="contact-name-phone"
                          value={contactName}
                          onChange={handleContactNameChange}
                          placeholder="John Doe"
                          required
                          aria-required="true"
                          className="w-full bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary"
                        />
                      </div>

                      <div>
                        <Label htmlFor="phone-identifier" className="text-sm font-medium mb-2 block">
                          Phone Number <span className="text-destructive">*</span>
                        </Label>
                        <PhoneInput
                          value={identifier}
                          onChange={handlePhoneChange}
                          placeholder="Enter phone number"
                        />
                      </div>

                      {identifier.trim() && !isViewOnly && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-3"
                        >
                          <Label className="text-sm font-medium block">Select Channel</Label>
                          <div className="flex gap-3">
                            <Button
                              type="button"
                              variant={selectedPhoneChannel === 'whatsapp' ? 'default' : 'outline'}
                              onClick={() => setSelectedPhoneChannel('whatsapp')}
                              className={`flex-1 ${selectedPhoneChannel === 'whatsapp' ? '' : 'border-border hover:bg-muted hover:border-border text-muted-foreground'}`}
                            >
                              <MessageSquare className="h-4 w-4 mr-2" />
                              WhatsApp
                            </Button>
                            <Button
                              type="button"
                              variant={selectedPhoneChannel === 'sms' ? 'default' : 'outline'}
                              onClick={() => setSelectedPhoneChannel('sms')}
                              className={`flex-1 ${selectedPhoneChannel === 'sms' ? '' : 'border-border hover:bg-muted hover:border-border text-muted-foreground'}`}
                            >
                              <Phone className="h-4 w-4 mr-2" />
                              SMS
                            </Button>
                            <Button
                              type="button"
                              variant={selectedPhoneChannel === 'call' ? 'default' : 'outline'}
                              onClick={() => setSelectedPhoneChannel('call')}
                              className={`flex-1 ${selectedPhoneChannel === 'call' ? '' : 'border-border hover:bg-muted hover:border-border text-muted-foreground'}`}
                            >
                              <PhoneCall className="h-4 w-4 mr-2" />
                              Call
                            </Button>
                          </div>
                        </motion.div>
                      )}
                      {identifier.trim() && isViewOnly && (
                        <p className="text-xs text-muted-foreground">View-only mode: only Call conversations can be created</p>
                      )}

                      <Button 
                        onClick={handleStart} 
                        disabled={
                          selectedPhoneChannel === 'call'
                            ? createFromCallMutation.isPending || !identifier.trim()
                            : startMutation.isPending || !identifier.trim() || !contactName.trim()
                        }
                        className="w-full sm:w-auto min-w-[200px] mx-auto block"
                        size="lg"
                      >
                        {selectedPhoneChannel === 'call'
                          ? (createFromCallMutation.isPending ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Creating...</span>
                              </div>
                            ) : 'Create Call Conversation')
                          : (startMutation.isPending ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Starting...</span>
                              </div>
                            ) : 'Start Conversation')}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Tabs>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Message Composer Modal */}
    {showComposerModal && composerData && (
      <MessageComposerModal
        open={showComposerModal}
        onClose={() => {
          setShowComposerModal(false);
          setComposerData(null);
        }}
        conversationData={composerData.conversationData}
        contactData={composerData.contactData}
        channelAccount={composerData.channelAccount}
        availableAccounts={composerData.availableAccounts}
        channelType={composerData.channelType}
        identifier={composerData.identifier}
        contactName={composerData.contactName}
      />
    )}
    </>
  );
}

// Shared skeleton for contact list loading states
const ContactSkeleton = () => (
  <div className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
    <div className="h-6 w-6 bg-muted rounded-md border-2 border-border"></div>
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-muted rounded w-3/4"></div>
      <div className="h-3 bg-muted rounded w-1/2"></div>
    </div>
  </div>
);

// Bulk SMS Component - Row-based layout with infinite scroll
const MAX_BULK_RECIPIENTS = 1000;

function BulkSMSTab({
  message,
  setMessage,
  search,
  setSearch,
  selectedContacts,
  setSelectedContacts,
  manualNumbers,
  setManualNumbers,
  manualNumberInput,
  setManualNumberInput,
  selectedAccount,
  setSelectedAccount,
  onClose
}) {
  const loadMoreRef = useRef(null);
  const textareaRef = useRef(null);
  const manualNumberInputRef = useRef(manualNumberInput);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Keep ref in sync with state
  useEffect(() => {
    manualNumberInputRef.current = manualNumberInput;
  }, [manualNumberInput]);

  // Stable onChange handler for PhoneInput to prevent infinite loops
  const handlePhoneInputChange = useCallback((value) => {
    // Only update if value actually changed
    if (value !== manualNumberInputRef.current) {
      setManualNumberInput(value);
    }
  }, [setManualNumberInput]);
  
  // Fetch contacts with infinite scroll
  const {
    data: contactsData,
    isLoading: contactsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['contacts', 'bulk-sms', search],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: pageParam.toString(),
        limit: '30',
      });
      if (search) {
        params.append('search', search);
      }
      const response = await apiClient.get(`/contacts?${params}`);
      return response;
    },
    getNextPageParam: (lastPage) => {
      const pagination = lastPage?.pagination || lastPage?.data?.pagination;
      if (!pagination) return undefined;
      const { page, pages } = pagination;
      return page < pages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: true,
  });

  // Flatten all pages into a single array and remove duplicates
  const allContacts = contactsData?.pages?.flatMap(page => page?.data || []) || [];
  const contactsMap = new Map();
  allContacts.forEach(contact => {
    if (contact?._id && !contactsMap.has(contact._id)) {
      contactsMap.set(contact._id, contact);
    }
  });
  const contacts = Array.from(contactsMap.values());

  // Fetch SMS accounts
  const { data: smsAccounts } = useQuery({
    queryKey: ['sms-accounts'],
    queryFn: async () => {
      const response = await apiClient.get('/channels?type=sms');
      return response?.data || [];
    },
  });

  // Bulk SMS send mutation
  const bulkSmsMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.post('/messages/bulk-sms', data);
      return response;
    },
    onSuccess: (response) => {
      const successCount = response.data?.successCount || 0;
      const failedCount = response.data?.failedCount || 0;
      if (failedCount > 0) {
        toast.warning(`Sent to ${successCount} recipients. ${failedCount} failed.`, { duration: 5000 });
      } else {
        toast.success(`Bulk SMS sent successfully to ${successCount} recipients`);
      }
      onClose();
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to send bulk SMS';
      toast.error(errorMsg, { duration: 5000 });
    }
  });

  const handleContactToggle = (contactId) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId);
    } else {
      // Check recipient limit before adding
      if (newSelected.size + manualNumbers.length >= MAX_BULK_RECIPIENTS) {
        toast.error(`Maximum ${MAX_BULK_RECIPIENTS} recipients allowed per bulk SMS`);
        return;
      }

      // Check for duplicate phone number across already-selected contacts
      const contact = contacts.find(c => c._id === contactId);
      if (contact?.phone) {
        try {
          const phone = parsePhoneNumber(contact.phone);
          const fullNumber = phone.number.replace('+', '');

          // Check against manual numbers
          const dupInManual = manualNumbers.some(n => n.number === fullNumber);
          if (dupInManual) {
            toast.error(`${contact.name || 'This contact'}'s number is already added manually`);
            return;
          }

          // Check against other selected contacts
          for (const existingId of Array.from(newSelected)) {
            const existing = contacts.find(c => c._id === existingId);
            if (existing?.phone) {
              try {
                const existingPhone = parsePhoneNumber(existing.phone);
                if (existingPhone.number.replace('+', '') === fullNumber) {
                  toast.error(`${contact.name || 'This contact'} has the same number as ${existing.name || 'another contact'}`);
                  return;
                }
              } catch {}
            }
          }
        } catch {}
      }

      newSelected.add(contactId);
    }
    setSelectedContacts(newSelected);
    // Keep search and combobox open so user can select multiple contacts
  };

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { 
        threshold: 0.1,
        rootMargin: '100px'
      }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }
    
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const [comboboxOpen, setComboboxOpen] = useState(false);

  const handleAddManualNumber = async () => {
    if (!manualNumberInput.trim()) {
      toast.error('Please enter a phone number');
      return;
    }

    try {
      const phoneNumber = parsePhoneNumber(manualNumberInput);
      const fullNumber = phoneNumber.number.replace('+', '');

      // Check for duplicates in manual numbers
      const isDuplicateInManual = manualNumbers.some(n => n.number === fullNumber);

      // Check for duplicates in selected contacts
      let isDuplicateInContacts = false;
      for (const contactId of Array.from(selectedContacts)) {
        const contact = contacts.find(c => c._id === contactId);
        if (contact?.phone) {
          try {
            const contactPhone = parsePhoneNumber(contact.phone);
            if (contactPhone.number.replace('+', '') === fullNumber) {
              isDuplicateInContacts = true;
              break;
            }
          } catch {}
        }
      }

      if (isDuplicateInManual || isDuplicateInContacts) {
        toast.error('This number is already added');
        return;
      }

      // Check recipient limit
      const totalAfterAdd = allSelectedNumbers.length + 1;
      if (totalAfterAdd > MAX_BULK_RECIPIENTS) {
        toast.error(`Maximum ${MAX_BULK_RECIPIENTS} recipients allowed per bulk SMS`);
        return;
      }

      setManualNumbers([...manualNumbers, {
        number: fullNumber,
        display: phoneNumber.formatInternational(),
        country: phoneNumber.country
      }]);
      setManualNumberInput('');
    } catch (error) {
      toast.error('Invalid phone number format');
    }
  };

  const handleRemoveManualNumber = (index) => {
    setManualNumbers(manualNumbers.filter((_, i) => i !== index));
  };

  const handleRemoveContact = (contactId) => {
    const newSelected = new Set(selectedContacts);
    newSelected.delete(contactId);
    setSelectedContacts(newSelected);
  };

  // Store selected contact data to avoid dependency on contacts array
  const [selectedContactData, setSelectedContactData] = useState(new Map());

  // Update selected contact data when contacts are selected
  useEffect(() => {
    const newData = new Map(selectedContactData);
    let hasChanges = false;

    // Add newly selected contacts
    Array.from(selectedContacts).forEach(contactId => {
      if (!newData.has(contactId)) {
        const contact = contacts.find(c => c._id === contactId);
        if (contact?.phone) {
          try {
            const phoneNumber = parsePhoneNumber(contact.phone);
            const fullNumber = phoneNumber.number.replace('+', '');
            newData.set(contactId, {
              number: fullNumber,
              display: phoneNumber.formatInternational(),
              name: contact.name || contact.displayName || 'Unknown',
              contactId: contact._id
            });
            hasChanges = true;
          } catch {
            newData.set(contactId, {
              number: contact.phone.replace(/[^0-9]/g, ''),
              display: contact.phone,
              name: contact.name || contact.displayName || 'Unknown',
              contactId: contact._id
            });
            hasChanges = true;
          }
        }
      }
    });

    // Remove unselected contacts
    Array.from(newData.keys()).forEach(contactId => {
      if (!selectedContacts.has(contactId)) {
        newData.delete(contactId);
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setSelectedContactData(newData);
    }
  }, [selectedContacts, contacts]);

  // Get all selected phone numbers - now reactive with useMemo
  const allSelectedNumbers = useMemo(() => {
    const numbers = [];
    
    // From selected contacts (use stored data)
    Array.from(selectedContacts).forEach(contactId => {
      const contactData = selectedContactData.get(contactId);
      if (contactData) {
        numbers.push(contactData);
      } else {
        // Fallback: try to find in contacts array
        const contact = contacts.find(c => c._id === contactId);
        if (contact?.phone) {
          try {
            const phoneNumber = parsePhoneNumber(contact.phone);
            const fullNumber = phoneNumber.number.replace('+', '');
            numbers.push({
              number: fullNumber,
              display: phoneNumber.formatInternational(),
              name: contact.name || contact.displayName || 'Unknown',
              contactId: contact._id
            });
          } catch {
            numbers.push({
              number: contact.phone.replace(/[^0-9]/g, ''),
              display: contact.phone,
              name: contact.name || contact.displayName || 'Unknown',
              contactId: contact._id
            });
          }
        }
      }
    });

    // From manual numbers - use formatted phone number as name
    manualNumbers.forEach(manual => {
      numbers.push({
        number: manual.number,
        display: manual.display,
        name: manual.display, // Use formatted phone number instead of "Manual Entry"
        contactId: null
      });
    });

    return numbers;
  }, [selectedContacts, selectedContactData, contacts, manualNumbers]);

  // Handle bulk send - show confirmation first
  const handleBulkSend = async () => {
    if (!message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    if (allSelectedNumbers.length === 0) {
      toast.error('Please select at least one contact or add a phone number');
      return;
    }

    if (!selectedAccount) {
      toast.error('Please select an SMS account');
      return;
    }

    const rcpts = allSelectedNumbers.map(n => parseInt(n.number, 10)).filter(n => !isNaN(n));

    if (rcpts.length === 0) {
      toast.error('No valid phone numbers found');
      return;
    }

    // Show confirmation dialog before sending
    setShowConfirmDialog(true);
  };

  const handleConfirmedSend = () => {
    setShowConfirmDialog(false);
    const rcpts = allSelectedNumbers.map(n => parseInt(n.number, 10)).filter(n => !isNaN(n));
    bulkSmsMutation.mutate({
      channelAccountId: selectedAccount,
      content: message,
      rcpts: rcpts,
      contacts: allSelectedNumbers.map(n => ({
        phone: n.number,
        name: n.name,
        contactId: n.contactId
      }))
    });
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* Top Section - Message & Configuration */}
      <div className="shrink-0 space-y-3 pb-3 border-b">
        {/* Message Input */}
        <div className="space-y-1.5">
          <Label htmlFor="bulk-sms-message" className="text-sm font-medium flex items-center gap-2 text-foreground">
            <MessageSquare className="h-4 w-4" />
            Message <span className="text-destructive">*</span>
          </Label>
          <Textarea
            ref={textareaRef}
            id="bulk-sms-message"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              // Auto-expand textarea
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
              }
            }}
            placeholder="Type your bulk SMS message here..."
            className={cn(
              "w-full min-h-[5rem] max-h-40 resize-none text-sm transition-colors",
              message.length > 480 ? "border-red-400 dark:border-red-500 focus:ring-red-400" :
              message.length > 320 ? "border-orange-400 dark:border-orange-500 focus:ring-orange-400" :
              message.length > 160 ? "border-yellow-400 dark:border-yellow-500 focus:ring-yellow-400" : ""
            )}
            disabled={bulkSmsMutation.isPending}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{message.length} chars {message.length > 0 && `• ${Math.ceil(message.length / 160) || 1} SMS${Math.ceil(message.length / 160) > 1 ? 's' : ''}`}</span>
            {message.length > 480 ? (
              <span className="text-red-600 dark:text-red-400 font-medium">
                {Math.ceil(message.length / 160)} parts — high cost
              </span>
            ) : message.length > 320 ? (
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                {Math.ceil(message.length / 160)} parts
              </span>
            ) : message.length > 160 ? (
              <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                {Math.ceil(message.length / 160)} parts
              </span>
            ) : null}
          </div>
        </div>

        {/* Configuration Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* SMS Account */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-2 text-foreground">
              <Phone className="h-4 w-4" />
              SMS Account <span className="text-destructive">*</span>
            </Label>
            {smsAccounts?.length === 0 ? (
              <div className="p-4 border border-dashed rounded-md text-center">
                <Phone className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-xs text-muted-foreground mb-1.5">No SMS accounts configured</p>
                <a
                  href="/c/channels/sms/setup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline font-medium"
                >
                  Set up SMS channel
                </a>
              </div>
            ) : (
              <Select value={selectedAccount} onValueChange={setSelectedAccount} disabled={bulkSmsMutation.isPending}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select SMS account" />
                </SelectTrigger>
                <SelectContent>
                  {smsAccounts?.map((account) => (
                    <SelectItem key={account._id} value={account._id}>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{account.name}</span>
                        <span className="text-xs text-muted-foreground">{account.identifier}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Manual Number Entry */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-2 text-foreground">
              <Plus className="h-4 w-4" />
              Add Phone Number
            </Label>
            <div className="flex gap-2" onKeyDown={(e) => {
              if (e.key === 'Enter' && manualNumberInput.trim()) {
                e.preventDefault();
                handleAddManualNumber();
              }
            }}>
              <div className="flex-1 min-w-0">
                <PhoneInput
                  value={manualNumberInput}
                  onChange={handlePhoneInputChange}
                  placeholder="Enter phone number"
                  disabled={bulkSmsMutation.isPending}
                />
              </div>
              <Button
                type="button"
                onClick={handleAddManualNumber}
                variant="outline"
                disabled={bulkSmsMutation.isPending || !manualNumberInput.trim()}
                className="h-9 px-3 shrink-0 border-border hover:bg-muted hover:border-border text-muted-foreground disabled:opacity-50"
                aria-label="Add phone number"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Selected Summary */}
        {allSelectedNumbers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-md p-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                  {allSelectedNumbers.length}
                </div>
                <div>
                  <p className="font-medium text-sm text-primary">
                    {allSelectedNumbers.length} {allSelectedNumbers.length === 1 ? 'Recipient' : 'Recipients'} Selected
                  </p>
                  <p className="text-xs text-primary/80">
                    {allSelectedNumbers.filter(n => n.contactId).length} contacts, {allSelectedNumbers.filter(n => !n.contactId).length} manual
                    {allSelectedNumbers.length > MAX_BULK_RECIPIENTS * 0.8 && (
                      <span className={cn(
                        "ml-2 font-medium",
                        allSelectedNumbers.length >= MAX_BULK_RECIPIENTS ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"
                      )}>
                        ({allSelectedNumbers.length}/{MAX_BULK_RECIPIENTS} limit)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedContacts(new Set());
                  setManualNumbers([]);
                }}
                disabled={bulkSmsMutation.isPending}
                className="h-8 text-xs text-primary hover:text-primary/80"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear All
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Main Content - Contact Selection */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Contact Combobox - Moved to top */}
        <div className="shrink-0 space-y-2.5 py-3 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Users className="h-4 w-4" />
              Select Contacts
            </h3>
            {contacts.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const allPhoneContacts = contacts.filter(c => c.phone);
                  const allIds = allPhoneContacts.map(c => c._id);
                  const allSelected = allIds.every(id => selectedContacts.has(id));
                  if (allSelected) {
                    // Deselect all visible contacts
                    const newSelected = new Set(selectedContacts);
                    allIds.forEach(id => newSelected.delete(id));
                    setSelectedContacts(newSelected);
                  } else {
                    // Select all visible contacts with phone numbers
                    const newSelected = new Set(selectedContacts);
                    allIds.forEach(id => newSelected.add(id));
                    if (newSelected.size > MAX_BULK_RECIPIENTS) {
                      toast.error(`Maximum ${MAX_BULK_RECIPIENTS} recipients allowed`);
                      return;
                    }
                    setSelectedContacts(newSelected);
                  }
                }}
                disabled={bulkSmsMutation.isPending}
                className="h-7 text-xs text-primary hover:text-primary/80"
              >
                {contacts.filter(c => c.phone).every(c => selectedContacts.has(c._id)) ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </div>
          
          {/* Contact Combobox */}
          <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={comboboxOpen}
                className="w-full justify-between h-11 text-sm bg-background border-border text-foreground hover:bg-muted hover:border-border"
                disabled={bulkSmsMutation.isPending}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Search className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-left truncate">
                    {search || 'Search and select contacts...'}
                  </span>
                </div>
                <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 bg-background border-border shadow-lg" align="start">
              <Command shouldFilter={false} className="bg-background">
                <div className="pb-2 pt-2 overflow-hidden [&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:pb-3 [&_[data-slot=command-input-wrapper]]:mb-0 [&_[data-slot=command-input-wrapper]:focus-within]:border-b-primary [&_[data-slot=command-input-wrapper]:focus-within]:border-b-2">
                  <CommandInput 
                    placeholder="Search contacts..." 
                    value={search}
                    onValueChange={(value) => {
                      setSearch(value);
                    }}
                    className="h-10 text-sm bg-background text-foreground placeholder:text-muted-foreground pl-2 focus:outline-none focus:rounded-md"
                  />
                </div>
                <CommandList className="max-h-[400px] bg-background">
                  <CommandEmpty className="text-muted-foreground py-6">
                    {contactsLoading ? 'Loading contacts...' : search ? 'No contacts found' : 'Start typing to search...'}
                  </CommandEmpty>
                  <CommandGroup className="bg-background">
                    {contactsLoading && contacts.length === 0 ? (
                      <div className="p-4">
                        {[...Array(3)].map((_, i) => (
                          <ContactSkeleton key={i} />
                        ))}
                      </div>
                    ) : (
                      <>
                        {contacts.map((contact) => {
                          const isSelected = selectedContacts.has(contact._id);
                          const contactDisplayName = contact.name || contact.displayName || 'Unknown Contact';
                          
                          return (
                            <CommandItem
                              key={contact._id}
                              value={contact._id}
                              onSelect={() => {
                                handleContactToggle(contact._id);
                              }}
                              className={cn(
                                "cursor-pointer px-3 py-2.5 rounded-md transition-colors",
                                "hover:bg-primary/5 dark:hover:bg-primary/10",
                                "data-[selected=true]:bg-primary/5 dark:data-[selected=true]:bg-primary/10",
                                isSelected && "bg-primary/5 dark:bg-primary/10"
                              )}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => handleContactToggle(contact._id)}
                                onClick={(e) => e.stopPropagation()}
                                disabled={bulkSmsMutation.isPending}
                                className="mr-3"
                              />
                              <div className="flex-1 min-w-0">
                                <div className={cn(
                                  "font-medium text-sm truncate",
                                  isSelected 
                                    ? "text-primary" 
                                    : "text-foreground"
                                )}>
                                  {contactDisplayName}
                                </div>
                                {contact.phone && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    <PhoneNumberDisplay phone={contact.phone} />
                                  </div>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                        
                        {/* Infinite Scroll Loader */}
                        {hasNextPage && (
                          <div ref={loadMoreRef} className="py-3 text-center border-t border-border">
                            {isFetchingNextPage ? (
                              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-border border-t-primary"></div>
                                <span>Loading more contacts...</span>
                              </div>
                            ) : (
                              <div className="h-4"></div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          {/* Contact count below combobox */}
          {contacts.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'} available
            </div>
          )}
        </div>

        {/* Selected Recipients Row */}
        {allSelectedNumbers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="shrink-0 mt-4 border rounded-md bg-background overflow-hidden"
          >
            <div className="p-3 border-b bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Selected Recipients
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {allSelectedNumbers.length}
                  </span>
                </h3>
              </div>
            </div>
            <ScrollArea className="max-h-[200px]">
              <div className="divide-y divide-border">
                {allSelectedNumbers.map((item, index) => (
                  <motion.div
                    key={`${item.contactId || 'manual'}-${index}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className="font-medium text-sm truncate">{item.name}</div>
                        {!item.contactId && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full shrink-0">
                            Manual
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <PhoneNumberDisplay phone={item.display} />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (item.contactId) {
                          handleRemoveContact(item.contactId);
                        } else {
                          const manualIndex = manualNumbers.findIndex(m => m.number === item.number);
                          if (manualIndex !== -1) {
                            handleRemoveManualNumber(manualIndex);
                          }
                        }
                      }}
                      disabled={bulkSmsMutation.isPending}
                      aria-label={`Remove ${item.name}`}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity h-7 w-7 p-0 text-destructive hover:text-destructive/80 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </div>

      {/* Footer - Send Button */}
      <div className="pt-3 border-t shrink-0">
        <Button
          onClick={handleBulkSend}
          disabled={bulkSmsMutation.isPending || !message.trim() || allSelectedNumbers.length === 0 || !selectedAccount}
          className="w-full h-10 text-sm font-semibold"
          size="lg"
        >
          {bulkSmsMutation.isPending ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Sending to {allSelectedNumbers.length} recipients...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              <span>Send Bulk SMS to {allSelectedNumbers.length} {allSelectedNumbers.length === 1 ? 'Recipient' : 'Recipients'}</span>
            </div>
          )}
        </Button>
      </div>

      {/* Send Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk SMS</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>You are about to send an SMS to <strong>{allSelectedNumbers.length} {allSelectedNumbers.length === 1 ? 'recipient' : 'recipients'}</strong>.</p>
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <p className="font-medium text-muted-foreground mb-1">Message preview:</p>
                  <p className="text-muted-foreground whitespace-pre-wrap break-words line-clamp-4">{message}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  This will send {Math.ceil(message.length / 160) || 1} SMS part{Math.ceil(message.length / 160) > 1 ? 's' : ''} per recipient ({Math.ceil(message.length / 160) * allSelectedNumbers.length} total SMS parts).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedSend}>
              Send to {allSelectedNumbers.length} {allSelectedNumbers.length === 1 ? 'Recipient' : 'Recipients'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// WebChat Tab Component - Contact list with webchat links
function WebChatTab({
  search,
  setSearch,
  selectedContact,
  setSelectedContact,
  selectedAccount,
  setSelectedAccount,
  onStartConversation,
  onGenerateLink,
  isGeneratingLink,
  isStartingConversation
}) {
  const { user } = useAuth();
  const loadMoreRef = useRef(null);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  
  // Fetch WebChat company accounts (filtered by department for agents, all for company admin)
  const { data: webchatAccountsData, isLoading: webchatAccountsLoading } = useQuery({
    queryKey: ['webchat-accounts', 'start-conversation'],
    queryFn: async () => {
      const response = await apiClient.get('/channels', {
        params: { type: 'webchat', status: 'active' }
      });
      return response.data || [];
    },
    enabled: true,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const webchatAccounts = webchatAccountsData || [];

  // Auto-select first account if only one is available and none is selected
  useEffect(() => {
    if (webchatAccounts.length === 1 && !selectedAccount) {
      setSelectedAccount(webchatAccounts[0]._id);
    }
  }, [webchatAccounts, selectedAccount]);
  
  // Fetch contacts with webchat links using infinite scroll
  const {
    data: contactsData,
    isLoading: contactsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['contacts', 'webchat', search],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: pageParam.toString(),
        limit: '30',
      });
      if (search) {
        params.append('search', search);
      }
      const response = await apiClient.get(`/contacts?${params}`);
      return response;
    },
    getNextPageParam: (lastPage) => {
      const pagination = lastPage?.pagination || lastPage?.data?.pagination;
      if (!pagination) return undefined;
      const { page, pages } = pagination;
      return page < pages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: true,
  });

  // Flatten all pages and filter contacts with webchat links
  const allContacts = contactsData?.pages?.flatMap(page => page?.data || []) || [];
  const contactsMap = new Map();
  allContacts.forEach(contact => {
    if (contact?._id && !contactsMap.has(contact._id)) {
      contactsMap.set(contact._id, contact);
    }
  });
  // Filter to only show contacts with webchat links
  const contacts = Array.from(contactsMap.values()).filter(contact => 
    contact.webchatLink || contact.identifiers?.webchat
  );

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { 
        threshold: 0.1,
        rootMargin: '100px'
      }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }
    
    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleContactSelect = (contact) => {
    setSelectedContact(contact);
    setSearch('');
    setComboboxOpen(false);
  };

  return (
    <motion.div
      key="webchat"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-lg p-4">
        <p className="text-sm text-primary">
          <strong>Note:</strong> Select a WebChat company account to start a conversation. 
          {user?.role === 'agent' 
            ? ' You can only see accounts from your assigned departments.' 
            : ' All available WebChat accounts are displayed.'}
          {' '}Conversations are segregated by department - each department's conversations are separate.
        </p>
      </div>

      {/* WebChat Account Selection */}
      <div className="space-y-2">
        <Label htmlFor="webchat-account" className="text-sm font-medium text-foreground">
          Select WebChat Account <span className="text-destructive">*</span>
        </Label>
        {webchatAccountsLoading ? (
          <div className="h-10 bg-muted rounded-md animate-pulse"></div>
        ) : webchatAccounts.length === 0 ? (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              No WebChat accounts available. Please configure a WebChat account first.
            </p>
          </div>
        ) : (
          <Select
            value={selectedAccount}
            onValueChange={setSelectedAccount}
            disabled={isGeneratingLink || isStartingConversation}
          >
            <SelectTrigger id="webchat-account" className="w-full">
              <SelectValue placeholder="Select a WebChat account">
                {selectedAccount && (() => {
                  const account = webchatAccounts.find(acc => acc._id === selectedAccount);
                  if (!account) return 'Select a WebChat account';
                  const deptName = account.departmentId?.name || 
                                   (Array.isArray(account.departmentIds) && account.departmentIds[0]?.name) || 
                                   'No Department';
                  return `${account.name} (${deptName})`;
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {webchatAccounts.map((account) => {
                const departmentName = account.departmentId?.name || 
                                      (Array.isArray(account.departmentIds) && account.departmentIds[0]?.name) || 
                                      'No Department';
                return (
                  <SelectItem key={account._id} value={account._id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{account.name}</span>
                      <span className="text-xs text-muted-foreground">Department: {departmentName}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </div>
      
      {/* Generate Link Button - Keep in same place */}
      <div className="text-center py-4 border-b border-border">
        <p className="text-sm text-muted-foreground mb-4">
          Generate a unique WebChat link to share with your contact. They will set their PIN on first access.
        </p>
        <Button 
          onClick={onGenerateLink} 
          disabled={isGeneratingLink || isStartingConversation || !selectedAccount || webchatAccountsLoading}
          className="w-full sm:w-auto min-w-[200px] mx-auto block"
          size="lg"
        >
          {isGeneratingLink ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating...</span>
            </div>
          ) : 'Generate Link'}
        </Button>
      </div>

      {/* Contact List Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium text-foreground">
            Start WebChat with Existing Contact
          </Label>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={comboboxOpen}
                disabled={isGeneratingLink || isStartingConversation}
                className="w-full justify-between h-10 text-sm font-normal text-muted-foreground bg-background border-border hover:bg-muted hover:border-border"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Search className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-left truncate">
                    {search || 'Search and select contact with WebChat link...'}
                  </span>
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-2 bg-background border-border shadow-lg" align="start">
              <Command shouldFilter={false} className="bg-background">
                <div className="pb-2 pt-2 overflow-hidden [&_[data-slot=command-input-wrapper]]:gap-3 [&_[data-slot=command-input-wrapper]]:pb-3 [&_[data-slot=command-input-wrapper]]:mb-0 [&_[data-slot=command-input-wrapper]:focus-within]:border-b-primary [&_[data-slot=command-input-wrapper]:focus-within]:border-b-2">
                  <CommandInput
                    placeholder="Search contacts..."
                    value={search}
                    onValueChange={setSearch}
                    className="h-10 text-sm bg-background text-foreground placeholder:text-muted-foreground pl-2 focus:outline-none focus:rounded-md"
                  />
                </div>
                <CommandList className="max-h-[400px] bg-background">
                  <CommandEmpty className="text-muted-foreground py-6">
                    {contactsLoading ? 'Loading...' : search ? 'No contacts found' : 'Start typing to search...'}
                  </CommandEmpty>
                  <CommandGroup className="bg-background">
                    {contactsLoading ? (
                      <>
                        <ContactSkeleton />
                        <ContactSkeleton />
                        <ContactSkeleton />
                      </>
                    ) : (
                      contacts.map((contact) => {
                        const contactDisplayName = contact.name || contact.displayName || 'Unknown Contact';
                        const isSelected = selectedContact?._id === contact._id;
                        
                        return (
                          <CommandItem
                            key={contact._id}
                            value={`${contactDisplayName} ${contact.phone || ''} ${contact.email || ''}`}
                            onSelect={() => handleContactSelect(contact)}
                            className="cursor-pointer"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={cn(
                                "h-6 w-6 rounded-md border-2 flex items-center justify-center shrink-0 text-xs font-semibold",
                                isSelected 
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "bg-muted border-border text-muted-foreground"
                              )}>
                                {contactDisplayName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={cn(
                                  "text-sm font-medium truncate",
                                  isSelected ? 'text-primary' : 'text-foreground'
                                )}>
                                  {contactDisplayName}
                                </div>
                                {contact.phone && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    <PhoneNumberDisplay phone={contact.phone} showFlag={false} />
                                  </div>
                                )}
                                {contact.email && (
                                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {contact.email}
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <CheckIcon className="h-4 w-4 text-primary shrink-0" />
                              )}
                            </div>
                          </CommandItem>
                        );
                      })
                    )}
                    {hasNextPage && (
                      <div ref={loadMoreRef} className="h-4" />
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Selected Contact Display */}
        {selectedContact && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-3 bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-lg group"
          >
            <div className="h-8 w-8 rounded-md border-2 bg-primary border-primary flex items-center justify-center shrink-0 text-xs font-semibold text-primary-foreground">
              {(selectedContact.name || selectedContact.displayName || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">
                {selectedContact.name || selectedContact.displayName || 'Unknown Contact'}
              </div>
              {selectedContact.phone && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  <PhoneNumberDisplay phone={selectedContact.phone} showFlag={false} />
                </div>
              )}
            </div>
            <Button
              type="button"
              onClick={() => setSelectedContact(null)}
              variant="ghost"
              size="sm"
              className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity h-7 w-7 p-0 text-destructive hover:text-destructive/80 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}

        {/* Start Conversation Button */}
        {selectedContact && (
          <Button
            onClick={onStartConversation}
            disabled={isStartingConversation || isGeneratingLink || !selectedAccount || webchatAccountsLoading}
            className="w-full h-10 text-sm font-semibold"
            size="lg"
          >
            {isStartingConversation ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Starting WebChat...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                <span>Start WebChat Conversation</span>
              </div>
            )}
          </Button>
        )}
      </div>
    </motion.div>
  );
}