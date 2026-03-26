// src/components/automation/TestingPersonas.jsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useInfiniteQuery } from '@tanstack/react-query';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Send, 
  User, 
  Mail, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  Clock,
  MessageSquare,
  BarChart3,
  Search,
  X,
  Loader2,
  Users,
  Check,
  ChevronsUpDown,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import PhoneInput from '@/components/shared/PhoneInput';

export default function TestingPersonas({ automationId, isAllStepsCompleted }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingPersonaId, setDeletingPersonaId] = useState(null);
  const [editingPersona, setEditingPersona] = useState(null);
  const [selectedPersonas, setSelectedPersonas] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [addMode, setAddMode] = useState('manual'); // 'manual' or 'contact'
  const [selectedContact, setSelectedContact] = useState(null); // Store selected contact (don't create immediately)
  const [showMessagePreview, setShowMessagePreview] = useState(false);
  const [sendResults, setSendResults] = useState(null); // { results: [...], total, success, failed }
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [sendProgress, setSendProgress] = useState(null); // { current, total }
  const loadMoreRef = useRef(null);

  // Form state for manual add
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: ''
  });
  
  // Form validation errors
  const [formErrors, setFormErrors] = useState({
    name: '',
    email: '',
    phone: ''
  });

  // Fetch testing personas - always enabled, not dependent on steps completion
  const { data: personasData, isLoading, refetch } = useQuery({
    queryKey: ['testing-personas', automationId],
    queryFn: async () => {
      const response = await apiClient.get(`/automations/${automationId}/testing-personas`);
      return response.data || [];
    },
    enabled: !!automationId,
  });

  // Fetch automation data for message preview
  const { data: automationData } = useQuery({
    queryKey: ['automation-preview', automationId],
    queryFn: async () => {
      const result = await apiClient.get(`/automations/${automationId}`);
      return result.data;
    },
    enabled: !!automationId,
    staleTime: 60000,
  });

  // Extract message preview from automation channels
  const messagePreview = (() => {
    if (!automationData?.channels?.length) return null;
    const previews = [];
    for (const ch of automationData.channels) {
      const channelName = ch.channel || 'Unknown';
      if (ch.customContent?.body) {
        previews.push({ channel: channelName, content: ch.customContent.body, subject: ch.customContent?.subject, type: 'custom' });
      } else if (ch.templateId) {
        const tName = typeof ch.templateId === 'object' ? (ch.templateId.name || ch.templateId.templateName) : 'Template';
        previews.push({ channel: channelName, content: `Template: ${tName}`, type: 'template' });
      }
    }
    return previews.length > 0 ? previews : null;
  })();

  // Fetch OWM outcomes for stats
  const { data: outcomesData } = useQuery({
    queryKey: ['outcomes', automationId],
    queryFn: async () => {
      try {
        const response = await apiClient.get(`/automations/${automationId}/outcomes`);
        return response.data || [];
      } catch (error) {
        return [];
      }
    },
    enabled: !!automationId,
  });

  // Fetch detailed statistics for testing personas
  const { data: statsData } = useQuery({
    queryKey: ['testing-personas-stats', automationId],
    queryFn: async () => {
      try {
        const response = await apiClient.get(`/automations/${automationId}/testing-personas/stats`);
        return response.data || null;
      } catch (error) {
        return null;
      }
    },
    enabled: !!automationId && (personasData?.length || 0) > 0,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const personas = personasData || [];
  const outcomes = outcomesData || [];
  const stats = statsData || null;

  // Debounce search for better performance with large contact lists
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(contactSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearch]);

  // Fetch contacts for search (similar to StartConversationModal) - improved for large datasets
  const {
    data: contactsData,
    isLoading: contactsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ['contacts', 'testing-personas', debouncedSearch],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: pageParam.toString(),
        limit: '50', // Increased limit for better search results
      });
      if (debouncedSearch && debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim());
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
    enabled: comboboxOpen && addMode === 'contact',
    staleTime: 30000, // Cache for 30 seconds
  });

  // Flatten contacts
  const allContacts = contactsData?.pages?.flatMap(page => page?.data || []) || [];
  const contactsMap = new Map();
  allContacts.forEach(contact => {
    if (contact?._id && !contactsMap.has(contact._id)) {
      contactsMap.set(contact._id, contact);
    }
  });
  const contacts = Array.from(contactsMap.values());

  // Infinite scroll for contacts
  useEffect(() => {
    if (!loadMoreRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
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

  // Create persona mutation with optimistic update
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiClient.post(`/automations/${automationId}/testing-personas`, data);
      return response.data;
    },
    onMutate: async (newData) => {
      // ✅ Cancel in-flight refetches so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: ['testing-personas', automationId] });
      const previousPersonas = queryClient.getQueryData(['testing-personas', automationId]);

      // ✅ Optimistically add the new persona to the list
      const optimisticPersona = {
        _id: `temp-${Date.now()}`,
        ...newData,
        statistics: { messagesSent: 0, messagesDelivered: 0, messagesRead: 0, messagesFailed: 0, outcomesMatched: [] },
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData(['testing-personas', automationId], (old) =>
        old ? [optimisticPersona, ...old] : [optimisticPersona]
      );
      return { previousPersonas };
    },
    onSuccess: () => {
      // ✅ React Query v5: use object syntax for invalidation
      queryClient.invalidateQueries({ queryKey: ['testing-personas', automationId] });
      queryClient.invalidateQueries({ queryKey: ['testing-personas-stats', automationId] });
      setShowAddDialog(false);
      setFormData({ name: '', email: '', phone: '' });
      setFormErrors({ name: '', email: '', phone: '' });
      setContactSearch('');
      setSelectedContact(null);
      setAddMode('manual');
      toast.success('Testing persona added successfully');
    },
    onError: (error, _variables, context) => {
      // ✅ Rollback optimistic update on error
      if (context?.previousPersonas) {
        queryClient.setQueryData(['testing-personas', automationId], context.previousPersonas);
      }
      toast.error(error.response?.data?.error || 'Failed to add testing persona');
    },
  });

  // Update persona mutation with optimistic update
  const updateMutation = useMutation({
    mutationFn: async ({ personaId, data }) => {
      const response = await apiClient.put(`/automations/${automationId}/testing-personas/${personaId}`, data);
      return response.data;
    },
    onMutate: async ({ personaId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['testing-personas', automationId] });
      const previousPersonas = queryClient.getQueryData(['testing-personas', automationId]);

      // ✅ Optimistically update the persona in the list
      queryClient.setQueryData(['testing-personas', automationId], (old) =>
        old ? old.map(p => String(p._id) === String(personaId) ? { ...p, ...data } : p) : old
      );
      return { previousPersonas };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testing-personas', automationId] });
      queryClient.invalidateQueries({ queryKey: ['testing-personas-stats', automationId] });
      setShowEditDialog(false);
      setEditingPersona(null);
      toast.success('Testing persona updated successfully');
    },
    onError: (error, _variables, context) => {
      if (context?.previousPersonas) {
        queryClient.setQueryData(['testing-personas', automationId], context.previousPersonas);
      }
      toast.error(error.response?.data?.error || 'Failed to update testing persona');
    },
  });

  // Delete persona mutation with optimistic update
  const deleteMutation = useMutation({
    mutationFn: async (personaId) => {
      const response = await apiClient.delete(`/automations/${automationId}/testing-personas/${personaId}`);
      return response.data;
    },
    onMutate: async (personaId) => {
      await queryClient.cancelQueries({ queryKey: ['testing-personas', automationId] });
      const previousPersonas = queryClient.getQueryData(['testing-personas', automationId]);

      // ✅ Optimistically remove the persona from the list
      queryClient.setQueryData(['testing-personas', automationId], (old) =>
        old ? old.filter(p => String(p._id) !== String(personaId)) : old
      );
      return { previousPersonas };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testing-personas', automationId] });
      queryClient.invalidateQueries({ queryKey: ['testing-personas-stats', automationId] });
      toast.success('Testing persona deleted successfully');
    },
    onError: (error, _variables, context) => {
      if (context?.previousPersonas) {
        queryClient.setQueryData(['testing-personas', automationId], context.previousPersonas);
      }
      toast.error(error.response?.data?.error || 'Failed to delete testing persona');
    },
  });

  // Send message mutation — tracks progress and shows results
  const sendMessageMutation = useMutation({
    mutationFn: async (personaIds) => {
      if (!isAllStepsCompleted) {
        throw new Error('Please complete all required steps before sending messages');
      }
      setSendProgress({ current: 0, total: personaIds.length });
      const response = await apiClient.post(`/automations/${automationId}/testing-personas/send-message`, {
        personaIds: personaIds.length > 0 ? personaIds : undefined
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['testing-personas', automationId] });
      queryClient.invalidateQueries({ queryKey: ['testing-personas-stats', automationId] });
      queryClient.invalidateQueries({ queryKey: ['automation-stats-mini', automationId] });
      setShowSendDialog(false);
      setSelectedPersonas([]);
      setSendProgress(null);

      // Build results summary
      const results = data?.results || data?.data?.results || [];
      const successCount = Array.isArray(results) ? results.filter(r => r.success || r.status === 'sent' || r.messageId).length : 0;
      const failedCount = Array.isArray(results) ? results.filter(r => !r.success && !r.messageId && r.status !== 'sent').length : 0;
      const total = Array.isArray(results) ? results.length : (data?.sent || data?.data?.sent || selectedPersonas.length);

      // Map results to persona names
      const enrichedResults = Array.isArray(results) ? results.map(r => {
        const persona = personas.find(p => p._id === r.personaId || p._id === r.contactId);
        return {
          ...r,
          personaName: persona?.name || r.personaName || 'Unknown',
          personaEmail: persona?.email || '',
          success: r.success || !!r.messageId || r.status === 'sent',
        };
      }) : [];

      setSendResults({
        results: enrichedResults,
        total: total || selectedPersonas.length,
        success: successCount || total || selectedPersonas.length,
        failed: failedCount,
        sentAt: new Date(),
      });
      setShowResultsDialog(true);

      if (failedCount > 0) {
        toast.warning(`${successCount} sent, ${failedCount} failed`);
      } else {
        toast.success(`${total || selectedPersonas.length} message(s) sent successfully`);
      }
    },
    onError: (error) => {
      setSendProgress(null);
      toast.error(error.response?.data?.error || error.message || 'Failed to send messages');
    },
  });

  const validateForm = (excludePersonaId = null) => {
    const errors = { name: '', email: '', phone: '' };
    let isValid = true;

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
      isValid = false;
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address';
      isValid = false;
    }

    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
      isValid = false;
    }

    // ✅ Client-side duplicate check — instant feedback before API call
    if (isValid && personas.length > 0) {
      const emailToCheck = formData.email.trim().toLowerCase();
      const phoneToCheck = formData.phone.trim();

      const duplicate = personas.find(p => {
        if (excludePersonaId && String(p._id) === String(excludePersonaId)) return false;
        return (p.email && p.email.toLowerCase() === emailToCheck) ||
               (p.phone && p.phone === phoneToCheck);
      });

      if (duplicate) {
        const matchField = duplicate.email && duplicate.email.toLowerCase() === emailToCheck
          ? 'email address'
          : 'phone number';
        errors.email = duplicate.email && duplicate.email.toLowerCase() === emailToCheck
          ? `This ${matchField} is already used by "${duplicate.name}"`
          : '';
        errors.phone = duplicate.phone && duplicate.phone === phoneToCheck
          ? `This phone number is already used by "${duplicate.name}"`
          : errors.phone;
        if (errors.email || errors.phone) isValid = false;
      }
    }

    setFormErrors(errors);
    return isValid;
  };

  const handleAddPersona = () => {
    if (addMode === 'manual') {
      if (!validateForm()) return;
      createMutation.mutate(formData);
    } else {
      // Contact mode - check if contact is selected
      if (!selectedContact) {
        toast.error('Please select a contact');
        return;
      }
      if (!selectedContact.name && !selectedContact.displayName) {
        toast.error('Selected contact must have a name');
        return;
      }

      // ✅ Client-side duplicate check for contact mode (email/phone)
      const contactEmail = selectedContact.email?.trim().toLowerCase();
      const contactPhone = selectedContact.phone?.trim();
      if (contactEmail || contactPhone) {
        const duplicate = personas.find(p =>
          (contactEmail && p.email && p.email.toLowerCase() === contactEmail) ||
          (contactPhone && p.phone && p.phone === contactPhone)
        );
        if (duplicate) {
          const matchField = contactEmail && duplicate.email && duplicate.email.toLowerCase() === contactEmail
            ? 'email address' : 'phone number';
          toast.error(`A testing persona with this ${matchField} already exists ("${duplicate.name}").`);
          return;
        }
      }

      createMutation.mutate({
        contactId: typeof selectedContact._id === 'object' ? selectedContact._id.toString() : selectedContact._id,
        name: selectedContact.name || selectedContact.displayName || 'Unknown',
        email: selectedContact.email?.trim() || null,
        phone: selectedContact.phone?.trim() || null
      });
    }
  };

  const handleContactSelect = (contact) => {
    // Just store the selected contact, don't create yet
    setSelectedContact(contact);
    setContactSearch(contact.name || contact.displayName || 'Unknown Contact');
    setComboboxOpen(false);
  };

  const handleEdit = (persona) => {
    setEditingPersona(persona);
    setFormData({
      name: persona.name || '',
      email: persona.email || '',
      phone: persona.phone || ''
    });
    setShowEditDialog(true);
  };

  const handleUpdate = () => {
    if (!editingPersona) return;

    // ✅ Validate with excludePersonaId so the persona's own email/phone don't trigger duplicate error
    const errors = { name: '', email: '', phone: '' };
    let isValid = true;

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
      isValid = false;
    }
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address';
      isValid = false;
    }
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
      isValid = false;
    }

    // ✅ Client-side duplicate check (exclude current persona)
    if (isValid && personas.length > 0) {
      const emailToCheck = formData.email.trim().toLowerCase();
      const phoneToCheck = formData.phone.trim();
      const duplicate = personas.find(p => {
        if (String(p._id) === String(editingPersona._id)) return false;
        return (p.email && p.email.toLowerCase() === emailToCheck) ||
               (p.phone && p.phone === phoneToCheck);
      });
      if (duplicate) {
        if (duplicate.email && duplicate.email.toLowerCase() === emailToCheck) {
          errors.email = `This email address is already used by "${duplicate.name}"`;
        }
        if (duplicate.phone && duplicate.phone === phoneToCheck) {
          errors.phone = `This phone number is already used by "${duplicate.name}"`;
        }
        isValid = false;
      }
    }

    setFormErrors(errors);
    if (!isValid) {
      const firstError = errors.name || errors.email || errors.phone;
      if (firstError) toast.error(firstError);
      return;
    }

    updateMutation.mutate({
      personaId: editingPersona._id,
      data: formData
    });
  };

  const handleDeleteClick = (personaId) => {
    setDeletingPersonaId(personaId);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = () => {
    if (deletingPersonaId) {
      deleteMutation.mutate(deletingPersonaId);
      setShowDeleteDialog(false);
      setDeletingPersonaId(null);
    }
  };

  const handleSendMessage = () => {
    if (selectedPersonas.length === 0) {
      toast.error('Please select at least one testing persona');
      return;
    }
    sendMessageMutation.mutate(selectedPersonas);
  };

  // Pre-send validation — check if personas have required identifiers
  const getPersonaWarnings = () => {
    if (!automationData?.channels?.length || !personas.length) return [];
    const warnings = [];
    const channels = automationData.channels.map(c => c.channel).filter(Boolean);

    for (const pid of selectedPersonas) {
      const persona = personas.find(p => p._id === pid);
      if (!persona) continue;
      if (channels.includes('whatsapp') && !persona.phone) {
        warnings.push(`${persona.name}: No phone — WhatsApp won't work`);
      }
      if (channels.includes('email') && !persona.email) {
        warnings.push(`${persona.name}: No email — Email won't work`);
      }
      if (channels.includes('sms') && !persona.phone) {
        warnings.push(`${persona.name}: No phone — SMS won't work`);
      }
    }
    return warnings;
  };

  const sendWarnings = getPersonaWarnings();

  // Reason why send is disabled
  const sendDisabledReason = !isAllStepsCompleted
    ? 'Complete all required steps (Basic Info, Channels, Triggers, Outcomes) first'
    : selectedPersonas.length === 0
    ? 'Select at least one persona'
    : personas.length === 0
    ? 'Add testing personas first'
    : null;

  const togglePersonaSelection = (personaId) => {
    setSelectedPersonas(prev => 
      prev.includes(personaId)
        ? prev.filter(id => id !== personaId)
        : [...prev, personaId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedPersonas.length === personas.length) {
      setSelectedPersonas([]);
    } else {
      setSelectedPersonas(personas.map(p => p._id));
    }
  };

  // Show warning if steps are not completed, but still allow viewing/managing personas
  const showWarning = !isAllStepsCompleted;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Users className="h-5 w-5" />
                Testing Personas
              </CardTitle>
              <CardDescription className="mt-1">
                Add up to 5 testing personas to test your automation before publishing. 
                Send messages and track outcomes separately from production data.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {personas.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedPersonas([]); // ✅ Reset selections when opening dialog
                    setShowSendDialog(true);
                  }}
                  disabled={personas.length === 0 || showWarning}
                  title={showWarning ? 'Complete all required steps to send messages' : ''}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Send Message
                </Button>
              )}
              <Button
                onClick={() => {
                  setFormData({ name: '', email: '', phone: '' });
                  setFormErrors({ name: '', email: '', phone: '' });
                  setSelectedContact(null);
                  setContactSearch('');
                  setAddMode('manual');
                  setShowAddDialog(true);
                }}
                disabled={personas.length >= 5}
                size="sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Persona
              </Button>
            </div>
          </div>
          {showWarning && (
            <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Note:</strong> Complete all required steps (Basic Info, Channels, Triggers & Timing, and Outcomes) to send messages to testing personas. You can still add and manage personas now.
              </p>
            </div>
          )}
          {personas.length >= 5 && (
            <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Maximum 5 testing personas allowed per automation.
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none mx-auto text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Loading testing personas...</p>
            </div>
          ) : personas.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                No testing personas added yet. Add your first testing persona to start testing your automation.
              </p>
              <Button onClick={() => {
                setFormData({ name: '', email: '', phone: '' });
                setFormErrors({ name: '', email: '', phone: '' });
                setSelectedContact(null);
                setContactSearch('');
                setAddMode('manual');
                setShowAddDialog(true);
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Add First Persona
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Personas Table */}
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead className="bg-muted border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left w-12">
                        <Checkbox
                          checked={selectedPersonas.length === personas.length && personas.length > 0}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all personas"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                        Phone
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                        Outcomes Matched
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <AnimatePresence>
                      {personas.map((persona) => (
                        <motion.tr
                          key={persona._id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className={cn(
                            "hover:bg-muted transition-colors",
                            selectedPersonas.includes(persona._id) && "bg-primary/5 dark:bg-primary/10"
                          )}
                        >
                          <td className="px-4 py-4">
                            <Checkbox
                              checked={selectedPersonas.includes(persona._id)}
                              onCheckedChange={() => togglePersonaSelection(persona._id)}
                              aria-label={`Select ${persona.name}`}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center flex-shrink-0">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <div className="font-medium text-foreground">
                                  {persona.name}
                                </div>
                                {persona.contactId && (
                                  <Badge variant="secondary" className="text-[10px] mt-0.5">
                                    From Contact
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {persona.email ? (
                                <>
                                  <Mail className="h-4 w-4 shrink-0" />
                                  <span className="truncate max-w-[200px]">{persona.email}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {persona.phone ? (
                                <>
                                  <Phone className="h-4 w-4 shrink-0" />
                                  <span className="truncate max-w-[150px]">{persona.phone}</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {(() => {
                              // Use per-persona outcome matches from stats endpoint
                              const personaMatches = stats?.personaOutcomeMatches?.[persona._id] || persona.statistics?.outcomesMatched || [];
                              if (personaMatches.length > 0) {
                                return (
                                  <div className="flex flex-col gap-1">
                                    {personaMatches.slice(0, 2).map((match, idx) => {
                                      const outcomeName = match.outcomeName ||
                                        (typeof match.outcomeId === 'object' ? match.outcomeId?.outcomeName :
                                          outcomes.find(o => o._id === match.outcomeId)?.outcomeName) ||
                                        'Unknown Outcome';
                                      return (
                                        <Badge key={idx} variant="secondary" className="text-xs w-fit bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                                          {outcomeName}
                                        </Badge>
                                      );
                                    })}
                                    {personaMatches.length > 2 && (
                                      <span className="text-xs text-muted-foreground">
                                        +{personaMatches.length - 2} more
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              return <span className="text-xs text-muted-foreground">No matches</span>;
                            })()}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(persona)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive/80"
                                onClick={() => handleDeleteClick(persona._id)}
                                title="Delete persona"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Statistics Section */}
      {personas.length > 0 && stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-foreground flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Testing Personas Statistics
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => {
                    // Export stats to CSV
                    const rows = [['Persona', 'Email', 'Phone', 'Outcomes Matched', 'Status']];
                    for (const p of personas) {
                      const matched = p.outcomeMatches?.filter(m => m.status === 1).map(m => m.outcomeName || 'Unknown').join('; ') || 'None';
                      rows.push([p.name, p.email || '', p.phone || '', matched, p.outcomeMatches?.some(m => m.status === 1) ? 'Matched' : 'Pending']);
                    }
                    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `testing-personas-stats-${new Date().toISOString().split('T')[0]}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success('Stats exported to CSV');
                  }}
                >
                  Export CSV
                </Button>
              </div>
              <CardDescription>
                Comprehensive statistics for all testing personas. Same metrics as production automation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Overall Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[17px] mb-6">
                <StatCard
                  title="Total Messages"
                  value={stats.totalMessagesSent || 0}
                  icon={<MessageSquare className="h-5 w-5" />}
                  color="blue"
                  delay={0.1}
                />
                <StatCard
                  title="Total Personas"
                  value={stats.totalPersonas || 0}
                  icon={<Users className="h-5 w-5" />}
                  color="purple"
                  delay={0.2}
                />
                <StatCard
                  title="Matched Outcomes"
                  value={stats.totalMatched || 0}
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  color="green"
                  delay={0.3}
                />
                <StatCard
                  title="Unmatched"
                  value={Math.max(0, stats.totalUnmatched || 0)}
                  icon={<XCircle className="h-5 w-5" />}
                  color="orange"
                  delay={0.4}
                />
              </div>

              {/* Match Rate Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="w-full"
              >
                <Card className={cn(
                  "relative box-border flex flex-col justify-center items-start overflow-hidden isolation-isolate",
                  "p-8",
                  "border-0 rounded-2xl",
                  "shadow-xl dark:shadow-2xl"
                )}
                style={{
                  background: '#60A5FA'
                }}>
                  {/* Large Overlay Circle - Bottom Right */}
                  <div 
                    className="absolute w-48 h-48 -right-12 -bottom-12 rounded-full z-0 bg-white/10"
                  />
                  
                  {/* Small Overlay Circle - Left Middle */}
                  <div 
                    className="absolute w-32 h-32 -left-8 top-1/2 -translate-y-1/2 rounded-full z-[1] bg-white/5"
                  />
                  
                  {/* Content Container */}
                  <div className="relative w-full flex flex-col sm:flex-row items-center sm:items-center justify-between gap-4 sm:gap-8 z-[2]">
                    {/* Left Side - Text Content */}
                    <div className="flex flex-col items-start gap-2 w-full sm:w-auto">
                      {/* Title */}
                      <div className="w-full sm:w-auto opacity-90">
                        <p className="text-sm font-medium leading-[18px] text-white font-['Inter',_'Plus_Jakarta_Sans',_sans-serif]">
                          Overall Match Rate
                        </p>
                      </div>
                      
                      {/* Percentage and Trend */}
                      <div className="flex flex-row items-center gap-2">
                        <div className="flex items-center">
                          <motion.span
                            className="text-4xl sm:text-5xl md:text-[48px] font-bold leading-[60px] text-white font-['Inter',_'Plus_Jakarta_Sans',_sans-serif]"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.7, duration: 0.5 }}
                          >
                            {typeof stats.overallMatchRate === 'number' ? stats.overallMatchRate.toFixed(1) : '0.0'}%
                          </motion.span>
                        </div>
                        <motion.div
                          className="opacity-80"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 0.8 }}
                          transition={{ delay: 0.8 }}
                        >
                          {stats.overallMatchRate >= 50 ? (
                            <TrendingUp className="h-6 w-6 text-white" strokeWidth={2} />
                          ) : (
                            <TrendingDown className="h-6 w-6 text-white" strokeWidth={2} />
                          )}
                        </motion.div>
                      </div>
                      
                      {/* Subtitle */}
                      <div className="w-full sm:w-auto opacity-80">
                        <p className="text-sm font-normal leading-[18px] text-white font-['Inter',_'Plus_Jakarta_Sans',_sans-serif]">
                          {stats.totalMatched || 0} of {stats.totalPersonas || 0} personas matched
                        </p>
                      </div>
                    </div>
                    
                    {/* Right Side - Target Icon */}
                    <div className="relative flex-shrink-0 w-20 h-20 sm:w-[96px] sm:h-[96px]">
                      {/* Target Icon Container with Overlay */}
                      <div 
                        className="relative w-full h-full flex items-center justify-center rounded-full z-0 box-border bg-white/10 border-4 border-white/30"
                      >
                        <Target className="w-8 h-8 sm:w-[40px] sm:h-[40px] text-white opacity-80" strokeWidth={3.33} />
                      </div>
                      
                      {/* Small Overlay Circle - Top Right of Target */}
                      <div 
                        className="absolute w-8 h-8 -right-2 -top-2 rounded-2xl z-[1] bg-white/20"
                      />
                    </div>
                  </div>
                </Card>
              </motion.div>

              {/* Message Statistics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Total Sent</p>
                        <p className="text-xl font-bold text-foreground">
                          {stats.totalMessagesSent || 0}
                        </p>
                      </div>
                      <MessageSquare className="h-8 w-8 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Delivered</p>
                        <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                          {stats.totalMessagesDelivered || 0}
                        </p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Read</p>
                        <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {stats.totalMessagesRead || 0}
                        </p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-blue-500" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Pending</p>
                        <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                          {stats.totalMessagesPending || 0}
                        </p>
                      </div>
                      <Clock className="h-8 w-8 text-amber-500" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Failed</p>
                        <p className="text-xl font-bold text-destructive">
                          {stats.totalMessagesFailed || 0}
                        </p>
                      </div>
                      <XCircle className="h-8 w-8 text-destructive" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* OWM Outcomes Statistics Summary */}
      {personas.length > 0 && outcomes.length > 0 && stats?.outcomeStats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                OWM Outcomes Statistics (Testing Personas)
              </CardTitle>
              <CardDescription>
                Track how testing personas match against OWM outcomes. Same outcomes as production automation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.outcomeStats.map((outcomeStat, index) => {
                  const matchCount = outcomeStat.matched;
                  const totalPersonas = outcomeStat.total;
                  const matchRate = outcomeStat.matchRate;
                  
                  return (
                    <motion.div
                      key={outcomeStat.outcomeId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * index }}
                      className="p-4 rounded-lg border border-border bg-muted"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground mb-1 truncate">
                            {outcomeStat.outcomeName}
                          </h4>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {outcomeStat.possibleOutcome}
                          </p>
                        </div>
                        <Badge
                          variant={matchRate >= 50 ? "default" : "secondary"}
                          className={cn(
                            "shrink-0 ml-2",
                            matchRate >= 50
                              ? "bg-emerald-500 text-white"
                              : "bg-muted text-foreground"
                          )}
                        >
                          {matchRate}% Match
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        {/* Progress Bar */}
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className={cn(
                              "h-2 rounded-full transition-all duration-500",
                              matchRate >= 50
                                ? "bg-emerald-500"
                                : "bg-blue-500"
                            )}
                            style={{ width: `${Math.min(matchRate, 100)}%` }}
                          />
                        </div>
                        
                        {/* Stats */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {matchCount} of {totalPersonas} personas matched
                          </span>
                          <span>
                            {outcomeStat.unmatched} unmatched
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Add Persona Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => {
        setShowAddDialog(open);
        if (!open) {
          // Reset form when closing
          setFormData({ name: '', email: '', phone: '' });
          setFormErrors({ name: '', email: '', phone: '' });
          setSelectedContact(null);
          setContactSearch('');
          setAddMode('manual');
        }
      }}>
        <DialogContent className="w-[80vw] max-w-[80vw] max-h-[90vh] overflow-y-auto sm:w-[90vw] sm:max-w-[90vw] md:w-[80vw] md:max-w-[80vw]">
          <DialogHeader>
            <DialogTitle>Add Testing Persona</DialogTitle>
            <DialogDescription className="mt-2">
              Add a new testing persona manually or select from existing contacts.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {/* Mode Selection */}
            <div className="flex gap-2">
              {/* <Button
                variant={addMode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAddMode('manual')}
                className="flex-1"
              >
                Manual Entry
              </Button> */}
              {/* <Button
                variant={addMode === 'contact' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAddMode('contact')}
                className="flex-1"
              >
                From Contact
              </Button> */}
            </div>

            {addMode === 'manual' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => {
                      setFormData({ ...formData, name: e.target.value });
                      if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
                    }}
                    placeholder="Enter name"
                    className={cn(formErrors.name && "border-destructive focus:border-destructive")}
                  />
                  {formErrors.name && (
                    <p className="text-xs text-destructive mt-1">{formErrors.name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
                    }}
                    placeholder="Enter email"
                    className={cn(formErrors.email && "border-destructive focus:border-destructive")}
                  />
                  {formErrors.email && (
                    <p className="text-xs text-destructive mt-1">{formErrors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <PhoneInput
                    value={formData.phone || ''}
                    onChange={(value) => {
                      setFormData({ ...formData, phone: value });
                      if (formErrors.phone) setFormErrors({ ...formErrors, phone: '' });
                    }}
                    placeholder="Enter phone number"
                    error={formErrors.phone}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <Label>Search and Select Contact *</Label>
                <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={comboboxOpen}
                      className={cn(
                        "w-full justify-between h-auto min-h-[3rem] py-3 text-left",
                        !selectedContact && "border-border"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Search className="h-5 w-5 text-muted-foreground shrink-0" />
                        <span className="text-left truncate text-sm">
                          {selectedContact 
                            ? `${selectedContact.name || selectedContact.displayName || 'Selected Contact'}${selectedContact.email ? ` (${selectedContact.email})` : ''}`
                            : 'Search and select contact...'}
                        </span>
                      </div>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent 
                    className="w-[var(--radix-popover-trigger-width)] max-w-[calc(80vw-4rem)] sm:max-w-[calc(90vw-2rem)] md:max-w-[calc(80vw-4rem)] p-0" 
                    align="start"
                    sideOffset={4}
                    avoidCollisions={true}
                  >
                    <Command shouldFilter={false} className="w-full">
                      <CommandInput
                        placeholder="Search contacts by name, email, or phone..."
                        value={contactSearch}
                        onValueChange={setContactSearch}
                        className="h-12 text-base"
                      />
                      <CommandList className="max-h-[50vh] sm:max-h-[400px] md:max-h-[50vh] overflow-y-auto">
                        <CommandEmpty>
                          {contactsLoading ? (
                            <div className="p-8 text-center">
                              <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground">Loading contacts...</p>
                            </div>
                          ) : contactSearch ? (
                            <div className="p-8 text-center">
                              <p className="text-sm text-muted-foreground">No contacts found</p>
                              <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
                            </div>
                          ) : (
                            <div className="p-8 text-center">
                              <p className="text-sm text-muted-foreground">Start typing to search contacts...</p>
                              <p className="text-xs text-muted-foreground mt-1">Search by name, email, or phone number</p>
                            </div>
                          )}
                        </CommandEmpty>
                        <CommandGroup>
                          {contactsLoading && contacts.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none mx-auto mb-2" />
                              Loading contacts...
                            </div>
                          ) : (
                            contacts.map((contact) => {
                              const contactDisplayName = contact.name || contact.displayName || 'Unknown Contact';
                              const hasEmail = contact.email && contact.email.trim();
                              const hasPhone = contact.phone && contact.phone.trim();
                              
                              return (
                                <CommandItem
                                  key={contact._id}
                                  value={`${contactDisplayName} ${contact.email || ''} ${contact.phone || ''}`}
                                  onSelect={() => handleContactSelect(contact)}
                                  className="cursor-pointer py-3 px-4 hover:bg-muted"
                                >
                                  <div className="flex items-center gap-4 w-full">
                                    <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center flex-shrink-0">
                                      <User className="h-5 w-5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="font-medium text-foreground truncate text-sm">
                                          {contactDisplayName}
                                        </p>
                                        {(!hasEmail || !hasPhone) && (
                                          <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-700 dark:text-blue-400 shrink-0">
                                            Optional {!hasEmail && !hasPhone ? 'Email & Phone' : !hasEmail ? 'Email' : 'Phone'}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 mt-1">
                                        {hasEmail ? (
                                          <div className="flex items-center gap-1.5">
                                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <p className="text-xs text-muted-foreground truncate">
                                              {contact.email}
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1.5">
                                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <p className="text-xs text-muted-foreground">No email</p>
                                          </div>
                                        )}
                                        {hasPhone ? (
                                          <div className="flex items-center gap-1.5">
                                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <p className="text-xs text-muted-foreground truncate">
                                              {contact.phone}
                                            </p>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1.5">
                                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <p className="text-xs text-muted-foreground">No phone</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </CommandItem>
                              );
                            })
                          )}
                          {hasNextPage && (
                            <div ref={loadMoreRef} className="p-4 text-center text-xs text-muted-foreground border-t border-border">
                              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none inline-block mr-2" />
                              Loading more contacts...
                            </div>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                
                {/* Info if selected contact is missing optional fields */}
                {selectedContact && (
                  <div className="space-y-2">
                    {(!selectedContact.email || !selectedContact.email.trim()) && (!selectedContact.phone || !selectedContact.phone.trim()) ? (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>Contact selected. Email and phone are optional when adding from existing contacts. You can add them later if needed.</span>
                        </p>
                      </div>
                    ) : (!selectedContact.email || !selectedContact.email.trim()) ? (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>Contact selected. Email is optional when adding from existing contacts.</span>
                        </p>
                      </div>
                    ) : (!selectedContact.phone || !selectedContact.phone.trim()) ? (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <p className="text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>Contact selected. Phone number is optional when adding from existing contacts.</span>
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                        <p className="text-sm text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Contact has all fields (name, email, phone).
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddPersona}
              disabled={createMutation.isPending || (addMode === 'manual' && (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim())) || (addMode === 'contact' && !selectedContact)}
              className="min-w-[120px]"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Adding...
                </>
              ) : (
                'Add Persona'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Persona Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) {
          setFormErrors({ name: '', email: '', phone: '' });
        }
      }}>
        <DialogContent className="w-[80vw] max-w-[80vw] max-h-[90vh] overflow-y-auto sm:w-[90vw] sm:max-w-[90vw] md:w-[80vw] md:max-w-[80vw]">
          <DialogHeader>
            <DialogTitle>Edit Testing Persona</DialogTitle>
            <DialogDescription className="mt-2">
              Update the testing persona information.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value });
                  if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
                }}
                placeholder="Enter name"
                className={cn(formErrors.name && "border-destructive focus:border-destructive")}
              />
              {formErrors.name && (
                <p className="text-xs text-destructive mt-1">{formErrors.name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
                }}
                placeholder="Enter email"
                className={cn(formErrors.email && "border-destructive focus:border-destructive")}
              />
              {formErrors.email && (
                <p className="text-xs text-destructive mt-1">{formErrors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone *</Label>
              <PhoneInput
                value={formData.phone || ''}
                onChange={(value) => {
                  setFormData({ ...formData, phone: value });
                  if (formErrors.phone) setFormErrors({ ...formErrors, phone: '' });
                }}
                placeholder="Enter phone number"
                error={formErrors.phone}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !formData.name.trim()}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Updating...
                </>
              ) : (
                'Update'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Message Dialog */}
      <Dialog
        open={showSendDialog}
        onOpenChange={(open) => {
          if (sendMessageMutation.isPending) return; // Prevent closing while sending
          setShowSendDialog(open);
          if (!open) {
            setSelectedPersonas([]);
            setShowMessagePreview(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Test Message</DialogTitle>
            <DialogDescription>
              Select personas to send the automation message to.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Message Preview */}
            {messagePreview && (
              <div className="space-y-2">
                <button onClick={() => setShowMessagePreview(!showMessagePreview)} className="text-xs text-primary hover:underline flex items-center gap-1">
                  {showMessagePreview ? 'Hide' : 'Preview'} message content
                </button>
                {showMessagePreview && (
                  <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                    {messagePreview.map((p, i) => (
                      <div key={i}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Badge variant="outline" className="text-[9px] capitalize">{p.channel}</Badge>
                          {p.subject && <span className="text-[10px] text-muted-foreground">Subject: {p.subject}</span>}
                        </div>
                        <p className="text-xs text-foreground bg-background p-2 rounded border whitespace-pre-wrap max-h-[120px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                          {p.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Select All */}
            <div className="flex items-center justify-between p-2.5 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedPersonas.length === personas.length && personas.length > 0} onCheckedChange={toggleSelectAll} />
                <Label className="text-sm">Select All ({personas.length})</Label>
              </div>
              {selectedPersonas.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{selectedPersonas.length} selected</Badge>
              )}
            </div>

            {/* Personas List */}
            <div className="max-h-[250px] overflow-y-auto space-y-1.5" style={{ scrollbarWidth: 'thin' }}>
              {personas.map((persona) => (
                <div
                  key={persona._id}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all",
                    selectedPersonas.includes(persona._id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => togglePersonaSelection(persona._id)}
                >
                  <Checkbox checked={selectedPersonas.includes(persona._id)} onCheckedChange={() => togglePersonaSelection(persona._id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{persona.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {persona.email && <span>{persona.email}</span>}
                      {persona.phone && <span>{persona.phone}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pre-send Warnings */}
            {sendWarnings.length > 0 && selectedPersonas.length > 0 && (
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-1">Warnings:</p>
                {sendWarnings.map((w, i) => (
                  <p key={i} className="text-[10px] text-amber-600 dark:text-amber-500">• {w}</p>
                ))}
              </div>
            )}

            {/* Send Summary */}
            {selectedPersonas.length > 0 && automationData?.channels && (
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800">
                <p className="text-[11px] text-blue-700 dark:text-blue-400">
                  Will send via {automationData.channels.map(c => c.channel).filter(Boolean).join(' → ')} to {selectedPersonas.length} persona{selectedPersonas.length > 1 ? 's' : ''}
                </p>
              </div>
            )}

            {/* Disabled Reason */}
            {sendDisabledReason && (
              <p className="text-xs text-red-500 text-center">{sendDisabledReason}</p>
            )}

            {/* Sending Progress */}
            {sendMessageMutation.isPending && sendProgress && (
              <div className="space-y-1.5">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: '100%' }} />
                </div>
                <p className="text-xs text-center text-muted-foreground">Sending messages...</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)} disabled={sendMessageMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSendMessage}
              disabled={sendMessageMutation.isPending || !!sendDisabledReason}
            >
              {sendMessageMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
              ) : (
                <><Send className="mr-2 h-4 w-4" />{selectedPersonas.length > 0 ? `Send to ${selectedPersonas.length}` : 'Send'}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {sendResults?.failed > 0 ? (
                <><AlertTriangle className="h-5 w-5 text-amber-500" />Send Results</>
              ) : (
                <><CheckCircle2 className="h-5 w-5 text-emerald-500" />Messages Sent</>
              )}
            </DialogTitle>
          </DialogHeader>

          {sendResults && (
            <div className="space-y-3">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg bg-muted/50 text-center">
                  <p className="text-lg font-bold">{sendResults.total}</p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 text-center">
                  <p className="text-lg font-bold text-emerald-600">{sendResults.success}</p>
                  <p className="text-[10px] text-emerald-600">Success</p>
                </div>
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/10 text-center">
                  <p className="text-lg font-bold text-red-600">{sendResults.failed}</p>
                  <p className="text-[10px] text-red-600">Failed</p>
                </div>
              </div>

              {/* Per-persona results */}
              {sendResults.results?.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto space-y-1" style={{ scrollbarWidth: 'thin' }}>
                  {sendResults.results.map((r, i) => (
                    <div key={i} className={cn(
                      'flex items-center gap-2 p-2 rounded-lg text-xs',
                      r.success ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-red-50 dark:bg-red-900/10'
                    )}>
                      {r.success ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" /> : <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                      <span className="font-medium truncate flex-1">{r.personaName}</span>
                      <span className="text-muted-foreground capitalize">{r.channelType || r.channel || ''}</span>
                      {r.error && <span className="text-red-500 truncate max-w-[100px]">{r.error}</span>}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground text-center">
                Sent at {sendResults.sentAt?.toLocaleTimeString?.()} — Check conversation stats for delivery updates
              </p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowResultsDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Testing Persona?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this testing persona? This action cannot be undone and will remove all associated statistics.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteDialog(false);
              setDeletingPersonaId(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}

function StatCard({ title, value, icon, color, delay }) {
  const gradientConfigs = {
    blue: {
      gradient: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
      gradientClass: 'from-[#3B82F6] to-[#2563EB]',
    },
    purple: {
      gradient: 'linear-gradient(135deg, #8B5CF6 0%, #9333EA 100%)',
      gradientClass: 'from-[#8B5CF6] to-[#9333EA]',
    },
    green: {
      gradient: 'linear-gradient(135deg, #10B981 0%, #16A34A 100%)',
      gradientClass: 'from-[#10B981] to-[#16A34A]',
    },
    orange: {
      gradient: 'linear-gradient(135deg, #F97316 0%, #EF4444 100%)',
      gradientClass: 'from-[#F97316] to-[#EF4444]',
    },
  };

  const config = gradientConfigs[color] || gradientConfigs.blue;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="w-full"
    >
      <Card className={cn(
        "relative box-border flex flex-col justify-center items-center overflow-hidden isolation-isolate",
        "w-full h-[170px] p-6",
        "bg-card",
        "border border-border",
        "shadow-[0px_10px_15px_-3px_rgba(226,232,240,0.5),0px_4px_6px_-4px_rgba(226,232,240,0.5)]",
        "dark:shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.3),0px_4px_6px_-4px_rgba(0,0,0,0.2)]",
        "rounded-2xl"
      )}>
        {/* Gradient Circle Background */}
        <div 
          className={cn(
            "absolute w-[128px] h-[128px] -right-[63px] -top-[63px] rounded-full z-0",
            "opacity-10 dark:opacity-15",
            `bg-gradient-to-br ${config.gradientClass}`
          )}
          style={{ background: config.gradient }}
        />
        
        {/* Content Container */}
        <div className="relative w-full flex flex-col justify-center items-center z-10">
          <div className="flex flex-row justify-between items-center w-full">
            {/* Left Side - Title and Value */}
            <div className="flex flex-col items-start gap-1">
              {/* Title */}
              <div className="h-5 flex items-center">
                <p className="text-[13px] font-normal leading-5 text-muted-foreground font-['Inter']">
                  {title}
                </p>
              </div>
              {/* Value */}
              <div className="h-9 flex items-center">
                <motion.p
                  className="text-[27.5px] font-bold leading-9 text-[#0F172A] dark:text-white font-['Inter']"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: delay + 0.2 }}
                >
                  {typeof value === 'number' ? value.toLocaleString() : value || 0}
                </motion.p>
              </div>
            </div>
            
            {/* Right Side - Icon */}
            <motion.div
              className={cn(
                "flex flex-col items-start justify-center p-3 w-11 h-11 rounded-xl shrink-0",
                `bg-gradient-to-br ${config.gradientClass}`,
                "shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]",
                "dark:shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.3),0px_4px_6px_-4px_rgba(0,0,0,0.2)]"
              )}
              style={{ background: config.gradient }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: delay + 0.1, type: "spring" }}
            >
              <div className="text-white w-5 h-5 flex items-center justify-center">
                {icon}
              </div>
            </motion.div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

