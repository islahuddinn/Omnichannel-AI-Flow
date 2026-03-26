// src/components/automation/Step3TriggerConditions.jsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Plus, Trash2, Save, ArrowRight, ArrowLeft, Loader2, Search, Users, Check, ChevronsUpDown, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '@/lib/api/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Pagination from '@/components/shared/Pagination';
import PhoneNumberDisplay from '@/components/shared/PhoneNumberDisplay';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';

export default function Step3TriggerConditions({
  formData,
  updateFormData,
  onSave,
  onNext,
  onBack,
  isCompleted,
}) {
  // Start with empty contactType - no default selection
  // Only initialize from formData if it exists (for editing existing automations)
  const [contactType, setContactType] = useState(() => {
    // Only set from formData if it's explicitly set (for editing)
    return formData.triggerConditions?.contactType || '';
  });
  
  // Error states for inline error messages
  const [errors, setErrors] = useState({
    contactType: '',
    conditions: [],
    timing: '',
  });
  
  // Field pagination states
  const [fieldPages, setFieldPages] = useState({ contact: 1, deal: 1 });
  const [fieldPageSize] = useState(50); // Load 50 fields at a time
  const [totalFields, setTotalFields] = useState({ contact: 0, deal: 0 });
  
  // Value pagination states
  const [valuePages, setValuePages] = useState({});
  const [valuePageSize] = useState(100); // Load 100 values at a time
  const [totalValues, setTotalValues] = useState({});
  const [conditions, setConditions] = useState(() => {
    // Convert old format (selectedValues array) to new format (selectedValue single)
    const conditions = formData.triggerConditions?.conditions || [];
    // ✅ Ensure conditions is an array before mapping
    if (!Array.isArray(conditions) || conditions.length === 0) {
      // ✅ Default to one empty condition if no conditions exist
      return [{
        entity: 'contact',
        field: '',
        selectedValue: '',
        logicalOperator: 'AND',
      }];
    }
    return conditions.map(cond => ({
      ...cond,
      selectedValue: cond.selectedValue || (cond.selectedValues && Array.isArray(cond.selectedValues) && cond.selectedValues.length > 0 ? cond.selectedValues[0] : ''),
    }));
  });
  const [isSaving, setIsSaving] = useState(false);
  const [filteredContacts, setFilteredContacts] = useState([]);
  const [filteredDeals, setFilteredDeals] = useState([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [totalDeals, setTotalDeals] = useState(0);
  const [contactsPage, setContactsPage] = useState(1);
  const [dealsPage, setDealsPage] = useState(1);
  const [contactSearch, setContactSearch] = useState('');
  const [dealSearch, setDealSearch] = useState('');
  const [availableFields, setAvailableFields] = useState({ contact: [], deal: [] });
  const [fieldUniqueValues, setFieldUniqueValues] = useState({});
  const [loadingValues, setLoadingValues] = useState({});
  const [loadingFields, setLoadingFields] = useState(true);
  const [hasSaved, setHasSaved] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [openFieldPopovers, setOpenFieldPopovers] = useState({});
  const [openValuePopovers, setOpenValuePopovers] = useState({});
  
  // Track saved state to detect changes
  const [savedState, setSavedState] = useState(null);
  
  // Sync conditions with formData when it changes (for navigation back to step)
  useEffect(() => {
    if (formData.triggerConditions?.conditions && Array.isArray(formData.triggerConditions.conditions)) {
      const formConditions = formData.triggerConditions.conditions.map(cond => ({
        ...cond,
        selectedValue: cond.selectedValue !== undefined && cond.selectedValue !== null ? cond.selectedValue : '',
      }));
      
      // Only update if different from current state to avoid unnecessary re-renders
      const currentConditionsStr = JSON.stringify(Array.isArray(conditions) ? conditions.map(c => ({
        entity: c.entity,
        field: c.field,
        selectedValue: c.selectedValue,
        logicalOperator: c.logicalOperator
      })) : []);
      const formConditionsStr = JSON.stringify(formConditions.map(c => ({
        entity: c.entity,
        field: c.field,
        selectedValue: c.selectedValue,
        logicalOperator: c.logicalOperator
      })));
      
      if (currentConditionsStr !== formConditionsStr) {
        // ✅ If form conditions are empty, default to one empty condition
        if (formConditions.length === 0) {
          setConditions([{
            entity: 'contact',
            field: '',
            selectedValue: '',
            logicalOperator: 'AND',
          }]);
        } else {
          setConditions(formConditions);
        }
        
        // Load values for all conditions that have fields selected
        formConditions.forEach((cond) => {
          if (cond.entity && cond.field) {
            const fieldKey = `${cond.entity}:${cond.field}`;
            // Only fetch if we don't already have values for this field
            if (!fieldUniqueValues[fieldKey] || fieldUniqueValues[fieldKey].length === 0) {
              fetchUniqueValues(cond.entity, cond.field).catch(err => {
                console.error('Error loading values for field:', err);
              });
            }
          }
        });
      }
    }
  }, [formData.triggerConditions?.conditions]);
  
  // Sync contactType with formData
  useEffect(() => {
    if (formData.triggerConditions?.contactType && formData.triggerConditions.contactType !== contactType) {
      setContactType(formData.triggerConditions.contactType);
    }
  }, [formData.triggerConditions?.contactType]);
  
  // Sync timing with formData
  useEffect(() => {
    if (formData.timing?.type && formData.timing.type !== timingType) {
      setTimingType(formData.timing.type);
    }
    if (formData.timing?.delay) {
      setDelay(formData.timing.delay);
    }
    if (formData.timing?.scheduledAt) {
      const scheduledDate = new Date(formData.timing.scheduledAt);
      setScheduledAt(formData.timing.scheduledAt);
      setScheduleDate(scheduledDate);
      setScheduleHour(scheduledDate.getHours());
      setScheduleMinute(scheduledDate.getMinutes());
    }
  }, [formData.timing]);
  
  // Timing state - must be declared before hasUnsavedChanges useMemo
  const [timingType, setTimingType] = useState(formData.timing?.type || '');
  const [delay, setDelay] = useState(formData.timing?.delay || { days: 0, hours: 0, minutes: 0 });
  const [scheduledAt, setScheduledAt] = useState(formData.timing?.scheduledAt || null);
  
  // Initialize saved state on mount
  useEffect(() => {
    if (!savedState && formData.triggerConditions && formData.timing) {
      setSavedState({
        contactType: formData.triggerConditions.contactType || '',
        conditions: JSON.stringify(formData.triggerConditions.conditions || []),
        timing: JSON.stringify(formData.timing),
      });
    }
  }, [formData]);
  
  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!savedState) return false;
    
    const currentState = {
      contactType: contactType || '',
      conditions: JSON.stringify(conditions),
      timing: JSON.stringify({
        type: timingType,
        delay,
        scheduledAt,
      }),
    };
    
    return JSON.stringify(currentState) !== JSON.stringify(savedState);
  }, [contactType, conditions, timingType, delay, scheduledAt, savedState]);
  const [scheduleDate, setScheduleDate] = useState(() => {
    if (formData.timing?.scheduledAt) {
      return new Date(formData.timing.scheduledAt);
    }
    return null;
  });
  const [scheduleHour, setScheduleHour] = useState(() => {
    if (formData.timing?.scheduledAt) {
      return new Date(formData.timing.scheduledAt).getHours();
    }
    return new Date().getHours();
  });
  const [scheduleMinute, setScheduleMinute] = useState(() => {
    if (formData.timing?.scheduledAt) {
      return new Date(formData.timing.scheduledAt).getMinutes();
    }
    return 0;
  });
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Fetch contact fields with chunked loading and proper Contact_Type filtering
  useEffect(() => {
    const fetchFields = async () => {
      if (!contactType && conditions.some(c => c.entity === 'contact')) {
        // Don't fetch if no contactType selected and we have contact conditions
        return;
      }
      
      setLoadingFields(true);
      try {
        // Build query params with contactType filter
        // Map UI values to DB values: 'customer' -> 'Customer', 'handyman' -> 'Handyman', 'both' -> both
        const contactParams = new URLSearchParams({ entity: 'contact' });
        if (contactType) {
          contactParams.append('contactType', contactType);
        }
        
        // Fetch contact fields with chunked loading
        const contactFieldsResult = await apiClient.get(`/contacts/fields?${contactParams.toString()}`).catch((err) => {
          console.error('Error fetching contact fields:', err);
          return { data: [] };
        });
        
        if (contactFieldsResult.data && contactFieldsResult.data.length > 0) {
          // ✅ Remove duplicates by displayName (case-insensitive) - ensure each field appears only once
          const uniqueFieldsMap = new Map();
          contactFieldsResult.data.forEach(field => {
            const displayNameKey = (field.displayName || field.name).toLowerCase().trim();
            if (!uniqueFieldsMap.has(displayNameKey)) {
              uniqueFieldsMap.set(displayNameKey, field);
            } else {
              // If duplicate found, prefer customFields over details
              const existingField = uniqueFieldsMap.get(displayNameKey);
              if (field.source === 'customFields' && existingField.source === 'details') {
                uniqueFieldsMap.set(displayNameKey, field);
              }
            }
          });
          const uniqueFields = Array.from(uniqueFieldsMap.values());
          setAvailableFields((prev) => ({ ...prev, contact: uniqueFields }));
          setTotalFields((prev) => ({ ...prev, contact: uniqueFields.length }));
        } else {
          setAvailableFields((prev) => ({ ...prev, contact: [] }));
          setTotalFields((prev) => ({ ...prev, contact: 0 }));
        }
        
        // Fetch deal fields (no contactType filter needed)
        const dealFieldsResult = await apiClient.get('/contacts/fields?entity=deal').catch((err) => {
          console.error('Error fetching deal fields:', err);
          return { data: [] };
        });
        
        if (dealFieldsResult.data && dealFieldsResult.data.length > 0) {
          // ✅ Remove duplicates by displayName (case-insensitive) - ensure each field appears only once
          const uniqueFieldsMap = new Map();
          dealFieldsResult.data.forEach(field => {
            const displayNameKey = (field.displayName || field.name).toLowerCase().trim();
            if (!uniqueFieldsMap.has(displayNameKey)) {
              uniqueFieldsMap.set(displayNameKey, field);
            } else {
              // If duplicate found, prefer customFields over details
              const existingField = uniqueFieldsMap.get(displayNameKey);
              if (field.source === 'customFields' && existingField.source === 'details') {
                uniqueFieldsMap.set(displayNameKey, field);
              }
            }
          });
          const uniqueFields = Array.from(uniqueFieldsMap.values());
          setAvailableFields((prev) => ({ ...prev, deal: uniqueFields }));
          setTotalFields((prev) => ({ ...prev, deal: uniqueFields.length }));
        } else {
          setAvailableFields((prev) => ({ ...prev, deal: [] }));
          setTotalFields((prev) => ({ ...prev, deal: 0 }));
        }
      } catch (error) {
        console.error('Fetch fields error:', error);
      } finally {
        setLoadingFields(false);
      }
    };
    
    fetchFields();
  }, [contactType]); // Re-fetch when contactType changes

  // Fetch unique values with chunked loading
  const fetchUniqueValues = async (entity, field, page = 1, append = false) => {
    const key = `${entity}:${field}`;
    
    // If we already have all values loaded, don't fetch again
    if (!append && fieldUniqueValues[key] && fieldUniqueValues[key].length > 0) {
      return fieldUniqueValues[key];
    }

    setLoadingValues((prev) => ({ ...prev, [key]: true }));
    try {
      // Fetch values - API returns all values, we'll handle pagination client-side
      const result = await apiClient.get(
        `/contacts/field-values?entity=${entity}&field=${encodeURIComponent(field)}`
      );
      const values = result.data || [];
      
      if (append && fieldUniqueValues[key]) {
        // Append new values (for infinite scroll)
        const existingValues = fieldUniqueValues[key] || [];
        const newValues = values.filter(v => !existingValues.includes(v));
        setFieldUniqueValues((prev) => ({ ...prev, [key]: [...existingValues, ...newValues] }));
        setTotalValues((prev) => ({ ...prev, [key]: values.length }));
      } else {
        // Replace all values
        setFieldUniqueValues((prev) => ({ ...prev, [key]: values }));
        setTotalValues((prev) => ({ ...prev, [key]: values.length }));
      }
      
      return fieldUniqueValues[key] || values;
    } catch (error) {
      console.error('Fetch field values error:', error);
      return [];
    } finally {
      setLoadingValues((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Filter contacts/deals based on conditions - always show if conditions are set
  useEffect(() => {
    if (conditions.length > 0 && conditions.every(c => c.field && c.selectedValue) && contactType && timingType) {
      filterContactsAndDeals();
    } else {
      setFilteredContacts([]);
      setFilteredDeals([]);
      setTotalContacts(0);
      setTotalDeals(0);
    }
  }, [conditions, contactType, contactsPage, dealsPage, timingType]);

  const filterContactsAndDeals = async () => {
    setIsLoadingContacts(true);
    try {
      console.log('[Step3] Filtering with:', { contactType, conditions, page: contactsPage });
      const result = await apiClient.post('/contacts/filter', {
        contactType,
        conditions, // API now handles both selectedValue and selectedValues
        page: contactsPage,
        limit: 10,
      });
      
      console.log('[Step3] Filter result:', result);
      
      if (result.success) {
        setFilteredContacts(result.data?.contacts || []);
        setFilteredDeals(result.data?.deals || []);
        setTotalContacts(result.data?.totalContacts || 0);
        setTotalDeals(result.data?.totalDeals || 0);
        console.log('[Step3] Set filtered contacts:', result.data?.contacts?.length || 0, 'total:', result.data?.totalContacts || 0);
      } else {
        console.error('[Step3] Filter failed:', result.error);
        setFilteredContacts([]);
        setFilteredDeals([]);
        setTotalContacts(0);
        setTotalDeals(0);
      }
    } catch (error) {
      console.error('[Step3] Filter error:', error);
      setFilteredContacts([]);
      setFilteredDeals([]);
      setTotalContacts(0);
      setTotalDeals(0);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  // Filter contacts by search term
  const filteredContactsBySearch = useMemo(() => {
    if (!contactSearch.trim()) return filteredContacts;
    
    const searchLower = contactSearch.toLowerCase();
    return filteredContacts.filter(contact => {
      const name = (contact.name || contact.displayName || '').toLowerCase();
      const email = (contact.email || '').toLowerCase();
      const phone = (contact.phone || '').toLowerCase();
      const contactId = (contact.contact_id || contact._id || '').toString().toLowerCase();
      
      return name.includes(searchLower) || 
             email.includes(searchLower) || 
             phone.includes(searchLower) ||
             contactId.includes(searchLower);
    });
  }, [filteredContacts, contactSearch]);

  // Filter deals by search term
  const filteredDealsBySearch = useMemo(() => {
    if (!dealSearch.trim()) return filteredDeals;
    
    const searchLower = dealSearch.toLowerCase();
    return filteredDeals.filter(deal => {
      const name = (deal.name || '').toLowerCase();
      const dealId = (deal.deal_id || deal._id || '').toString().toLowerCase();
      const stage = (deal.stage || '').toLowerCase();
      const status = (deal.status || '').toLowerCase();
      
      // Also search in details object
      const detailsStr = deal.details ? JSON.stringify(deal.details).toLowerCase() : '';
      
      return name.includes(searchLower) || 
             dealId.includes(searchLower) ||
             stage.includes(searchLower) ||
             status.includes(searchLower) ||
             detailsStr.includes(searchLower);
    });
  }, [filteredDeals, dealSearch]);

  const addCondition = () => {
    setConditions([
      ...conditions,
      {
        entity: 'contact',
        field: '',
        selectedValue: '',
        logicalOperator: 'AND',
      },
    ]);
  };

  const removeCondition = (index) => {
    if (!Array.isArray(conditions)) {
      setConditions([]);
      return;
    }
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index, updates) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    setConditions(newConditions);
  };

  const handleFieldSelect = async (index, field) => {
    const condition = conditions[index];
    // Clear selected value when field changes
    updateCondition(index, { field, selectedValue: '' });
    setOpenFieldPopovers(prev => ({ ...prev, [index]: false }));
    
    // Clear errors for this condition
    setErrors(prev => ({
      ...prev,
      conditions: prev.conditions.map((err, i) => i === index ? '' : err)
    }));
    
    // Fetch unique values for this field
    if (field && condition.entity) {
      await fetchUniqueValues(condition.entity, field);
    }
  };
  
  // Load values when field is already selected (e.g., when navigating back to step)
  useEffect(() => {
    const loadValuesForConditions = async () => {
      const promises = conditions
        .filter(condition => condition.entity && condition.field)
        .map(async (condition) => {
          const fieldKey = `${condition.entity}:${condition.field}`;
          // Only fetch if we don't already have values for this field
          if (!fieldUniqueValues[fieldKey] || fieldUniqueValues[fieldKey].length === 0) {
            if (!loadingValues[fieldKey]) {
              try {
                await fetchUniqueValues(condition.entity, condition.field);
              } catch (err) {
                console.error('Error loading values for field:', err);
              }
            }
          }
        });
      
      await Promise.all(promises);
    };
    
    if (conditions.length > 0) {
      loadValuesForConditions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.isArray(conditions) ? conditions.map(c => `${c.entity || ''}:${c.field || ''}`).join('|') : '']); // Re-run when entity:field combinations change

  const handleValueSelect = (index, value) => {
    updateCondition(index, { selectedValue: value });
    setOpenValuePopovers(prev => ({ ...prev, [index]: false }));
    
    // Clear errors for this condition
    setErrors(prev => ({
      ...prev,
      conditions: prev.conditions.map((err, i) => i === index ? '' : err)
    }));
  };
  
  // Update scheduledAt when date, hour, or minute changes
  useEffect(() => {
    if (scheduleDate && scheduleHour !== null && scheduleMinute !== null) {
      const newDate = new Date(scheduleDate);
      newDate.setHours(scheduleHour, scheduleMinute, 0, 0);
      
      // Validate that the scheduled time is in the future
      const now = new Date();
      if (newDate > now) {
        setScheduledAt(newDate.toISOString());
      }
    } else {
      setScheduledAt(null);
    }
  }, [scheduleDate, scheduleHour, scheduleMinute]);

  // Handle date selection from calendar
  const handleDateSelect = (date) => {
    if (date) {
      // If date is today, ensure time is in the future
      const now = new Date();
      const selectedDate = new Date(date);
      selectedDate.setHours(scheduleHour, scheduleMinute, 0, 0);
      
      if (selectedDate <= now) {
        // If selected time is in the past, adjust to current time + 1 minute
        const adjustedTime = new Date(now.getTime() + 60000);
        setScheduleDate(date);
        setScheduleHour(adjustedTime.getHours());
        setScheduleMinute(adjustedTime.getMinutes());
      } else {
        setScheduleDate(date);
      }
      setCalendarOpen(false);
    }
  };

  // Handle hour change
  const handleHourChange = (hour) => {
    const newHour = parseInt(hour);
    setScheduleHour(newHour);
    
    // Validate that the time is in the future
    if (scheduleDate) {
      const newDate = new Date(scheduleDate);
      newDate.setHours(newHour, scheduleMinute, 0, 0);
      const now = new Date();
      
      if (newDate <= now) {
        // If time is in the past, adjust to current time + 1 minute
        const adjustedTime = new Date(now.getTime() + 60000);
        setScheduleHour(adjustedTime.getHours());
        setScheduleMinute(adjustedTime.getMinutes());
        toast.error('Selected time must be in the future');
      }
    }
  };

  // Handle minute change
  const handleMinuteChange = (minute) => {
    const newMinute = parseInt(minute);
    setScheduleMinute(newMinute);
    
    // Validate that the time is in the future
    if (scheduleDate) {
      const newDate = new Date(scheduleDate);
      newDate.setHours(scheduleHour, newMinute, 0, 0);
      const now = new Date();
      
      if (newDate <= now) {
        // If time is in the past, adjust to current time + 1 minute
        const adjustedTime = new Date(now.getTime() + 60000);
        setScheduleHour(adjustedTime.getHours());
        setScheduleMinute(adjustedTime.getMinutes());
        toast.error('Selected time must be in the future');
      }
    }
  };

  // Disable past dates in calendar
  const isDateDisabled = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate < today;
  };

  const handleSave = async () => {
    // Clear previous errors
    setErrors({
      contactType: '',
      conditions: [],
      timing: '',
    });
    
    let hasErrors = false;
    const newErrors = {
      contactType: '',
      conditions: [],
      timing: '',
    };
    
    // Validate contact type
    if (!contactType) {
      newErrors.contactType = 'Contact type is required';
      hasErrors = true;
    }
    
    // Validate conditions
    if (conditions.length === 0) {
      newErrors.conditions = ['At least one trigger condition is required'];
      hasErrors = true;
    } else {
      if (!Array.isArray(conditions)) {
        errors.conditions = 'Conditions must be an array';
        setErrors(errors);
        return;
      }
      conditions.forEach((cond, i) => {
        const conditionErrors = [];
        if (!cond.entity) {
          conditionErrors.push('Entity is required');
        }
        if (!cond.field) {
          conditionErrors.push('Field is required');
        }
        if (!cond.selectedValue || cond.selectedValue === '') {
          conditionErrors.push('Value is required');
        }
        if (conditionErrors.length > 0) {
          newErrors.conditions[i] = conditionErrors.join(', ');
          hasErrors = true;
        }
      });
    }
    
    // Validate timing
    if (!timingType) {
      newErrors.timing = 'Timing type is required';
      hasErrors = true;
    } else if (timingType === 'delayed') {
      if (delay.days === 0 && delay.hours === 0 && delay.minutes === 0) {
        newErrors.timing = 'Please specify a delay period (at least 1 minute)';
        hasErrors = true;
      }
    } else if (timingType === 'schedule') {
      if (!scheduleDate || scheduleHour === null || scheduleMinute === null) {
        newErrors.timing = 'Please select a scheduled date, hour, and minute';
        hasErrors = true;
      } else if (!scheduledAt) {
        newErrors.timing = 'Please select a valid scheduled date and time';
        hasErrors = true;
      } else {
        const scheduledDateObj = new Date(scheduledAt);
        const now = new Date();
        if (scheduledDateObj <= now) {
          newErrors.timing = 'Scheduled date and time must be in the future';
          hasErrors = true;
        }
      }
    }
    
    // Set errors and return if validation failed
    if (hasErrors) {
      setErrors(newErrors);
      return;
    }

    // All validation passed - proceed with save
    try {
      // Ensure all conditions have selectedValue (not empty string)
      const cleanedConditions = conditions
        .filter(cond => cond.entity && cond.field && cond.selectedValue && cond.selectedValue !== '')
        .map((cond) => ({
          entity: cond.entity,
          field: cond.field,
          selectedValue: cond.selectedValue,
          logicalOperator: cond.logicalOperator || 'AND',
        }));

      // Double-check we have at least one valid condition
      if (cleanedConditions.length === 0) {
        setErrors({
          ...errors,
          conditions: ['At least one complete trigger condition is required'],
        });
        toast.error('Please complete at least one trigger condition');
        return;
      }

      setIsSaving(true);
      try {
        const timingData = {
          type: timingType,
          delay: timingType === 'delayed' ? delay : { days: 0, hours: 0, minutes: 0 },
          scheduledAt: timingType === 'schedule' ? scheduledAt : null,
        };
        
        const updatedData = {
          triggerConditions: {
            contactType: contactType,
            conditions: cleanedConditions,
          },
          timing: timingData,
        };
        
        updateFormData(updatedData);
        // ✅ Pass the updated data directly to onSave so it can check completion immediately
        await onSave(updatedData);
        setHasSaved(true);
        
        // Update saved state after successful save
        setSavedState({
          contactType: contactType,
          conditions: JSON.stringify(cleanedConditions),
          timing: JSON.stringify(timingData),
        });
        
        // Clear errors after successful save
        setErrors({
          contactType: '',
          conditions: [],
          timing: '',
        });
        
        toast.success('Trigger conditions and timing saved successfully');
      } catch (error) {
        console.error('Save error:', error);
        toast.error(error.message || 'Failed to save trigger conditions');
      } finally {
        setIsSaving(false);
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast.error('Validation failed');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 min-h-[500px] sm:min-h-[600px]"
    >
      <Card className="bg-card border-border h-full">
        <CardHeader>
          <CardTitle className="text-foreground">Trigger Conditions & Filtering</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Select fields and their values to filter contacts and deals
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Contact Type */}
          <div className="space-y-2">
            <Label>Contact Type *</Label>
            <Select value={contactType} onValueChange={(value) => {
              setContactType(value);
              setErrors(prev => ({ ...prev, contactType: '' }));
            }}>
              <SelectTrigger className={cn("w-60", errors.contactType && "border-destructive")}>
                <SelectValue placeholder="Select contact type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="handyman">Handyman</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
            {errors.contactType && (
              <p className="text-sm text-destructive mt-1">
                {errors.contactType}
              </p>
            )}
            {!contactType && !errors.contactType && (
              <p className="text-sm text-muted-foreground mt-1">
                Please select a contact type to see available fields
              </p>
            )}
          </div>

          {/* Conditions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Trigger Conditions *</Label>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <Plus className="mr-2 h-4 w-4" />
                Add Condition
              </Button>
            </div>

            {errors.conditions && typeof errors.conditions === 'string' && (
              <p className="text-sm text-destructive">
                {errors.conditions}
              </p>
            )}
            <AnimatePresence>
              {Array.isArray(conditions) && conditions.map((condition, index) => {
                const fieldKey = `${condition.entity}:${condition.field}`;
                const uniqueValues = fieldUniqueValues[fieldKey] || [];
                const isLoading = loadingValues[fieldKey];
                const fields = availableFields[condition.entity] || [];
                const selectedField = fields.find(f => f.name === condition.field);
                const conditionError = errors.conditions[index];

                return (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="border rounded-lg p-4 space-y-3 border-border bg-card"
                  >
                    {/* Logical Operator - Above row on mobile, inline on desktop */}
                    {index > 0 && (
                      <div className="flex items-center gap-2 mb-2">
                        <Label className="text-sm font-medium whitespace-nowrap">Logical Operator:</Label>
                        <Select
                          value={condition.logicalOperator || 'AND'}
                          onValueChange={(value) =>
                            updateCondition(index, { logicalOperator: value })
                          }
                        >
                          <SelectTrigger className="w-24 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="AND">AND</SelectItem>
                            <SelectItem value="OR">OR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Single Row Layout: Entity, Field, Value */}
                    <div className="flex flex-col md:flex-row gap-3 items-start">
                      {/* Entity - Wider with fixed min-width for elegance */}
                      <div className="flex flex-col w-full md:w-[180px] lg:w-[200px] md:min-w-[180px] lg:min-w-[200px] md:flex-shrink-0">
                        <Label className="text-xs font-medium mb-1">Entity *</Label>
                        <Select
                          value={condition.entity || ''}
                          onValueChange={(value) => {
                            updateCondition(index, { entity: value, field: '', selectedValue: '' });
                            setErrors(prev => ({
                              ...prev,
                              conditions: prev.conditions.map((err, i) => i === index ? '' : err)
                            }));
                          }}
                        >
                          <SelectTrigger 
                            size="default"
                            className={cn(
                              "!h-10 w-full text-sm justify-between items-center",
                              conditionError && !condition.entity && "border-destructive"
                            )}
                          >
                            <SelectValue placeholder="Select entity" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contact">Contact</SelectItem>
                            <SelectItem value="deal">Deal</SelectItem>
                          </SelectContent>
                        </Select>
                        {conditionError && !condition.entity && (
                          <p className="text-xs text-destructive mt-1">Entity required</p>
                        )}
                      </div>

                      {/* Field - Flexible width */}
                      <div className="flex flex-col flex-1 min-w-0 w-full md:w-auto">
                        <Label className="text-xs font-medium mb-1">Field *</Label>
                        {loadingFields ? (
                          <div className="flex items-center justify-center p-2 border rounded-lg h-10 bg-muted">
                            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground mr-2" />
                            <span className="text-xs text-muted-foreground">Loading...</span>
                          </div>
                        ) : !contactType && condition.entity === 'contact' ? (
                          <div className="p-2 border rounded-lg bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 h-10 flex items-center">
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              Select contact type first
                            </p>
                          </div>
                        ) : fields.length === 0 ? (
                          <div className="p-2 border rounded-lg bg-muted border-border h-10 flex items-center">
                            <p className="text-xs text-muted-foreground">
                              No fields available
                            </p>
                          </div>
                        ) : (
                          <>
                            <Popover
                              open={openFieldPopovers[index]}
                              onOpenChange={(open) => setOpenFieldPopovers(prev => ({ ...prev, [index]: open }))}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between h-10 text-left font-normal",
                                    conditionError && !condition.field && "border-destructive"
                                  )}
                                >
                                  <span className="truncate">
                                    {selectedField ? (selectedField.displayName || selectedField.name) : 'Select field...'}
                                  </span>
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[350px] md:w-[400px] max-w-[95vw] p-0" align="start">
                                <Command>
                                  <CommandInput 
                                    placeholder="Search fields..." 
                                    className="h-10 border-0 focus:ring-0 pl-3"
                                  />
                                  <CommandList className="max-h-[300px]">
                                    <CommandEmpty>No fields found.</CommandEmpty>
                                    <CommandGroup>
                                      {fields.map((field) => (
                                        <CommandItem
                                          key={field.name}
                                          value={field.displayName || field.name}
                                          onSelect={() => handleFieldSelect(index, field.name)}
                                          className="cursor-pointer"
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              condition.field === field.name ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          <span className="truncate">{field.displayName || field.name}</span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            {conditionError && !condition.field && (
                              <p className="text-xs text-destructive mt-1">Field required</p>
                            )}
                          </>
                        )}
                      </div>

                      {/* Value - Flexible width */}
                      <div className="flex flex-col flex-1 min-w-0 w-full md:w-auto">
                        <Label className="text-xs font-medium mb-1">Select Value *</Label>
                        <div className="flex flex-col">
                          {!condition.field ? (
                            <div className="p-2 border rounded-lg bg-muted border-border h-10 flex items-center">
                              <p className="text-xs text-muted-foreground">
                                Select field first
                              </p>
                            </div>
                          ) : isLoading ? (
                            <div className="flex items-center justify-center p-2 border rounded-lg h-10 bg-muted">
                              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-muted-foreground mr-2" />
                              <span className="text-xs text-muted-foreground">Loading values...</span>
                            </div>
                          ) : uniqueValues.length === 0 ? (
                            <div className="p-2 border rounded-lg bg-muted border-border h-10 flex items-center justify-center">
                              <p className="text-xs text-muted-foreground">No values available</p>
                            </div>
                          ) : (
                            <>
                              <Popover
                                open={openValuePopovers[index]}
                                onOpenChange={(open) => setOpenValuePopovers(prev => ({ ...prev, [index]: open }))}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      "w-full justify-between h-10 text-left font-normal",
                                      conditionError && !condition.selectedValue && "border-destructive"
                                    )}
                                  >
                                    <span className="truncate">
                                      {condition.selectedValue 
                                        ? (() => {
                                            const valueStr = condition.selectedValue === null || condition.selectedValue === undefined 
                                              ? '(Empty)' 
                                              : String(condition.selectedValue);
                                            return valueStr.length > 50 ? valueStr.substring(0, 50) + '...' : valueStr;
                                          })()
                                        : 'Select value...'}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[350px] md:w-[400px] max-w-[95vw] p-0" align="start">
                                  <Command>
                                    <CommandInput 
                                      placeholder="Search values..." 
                                      className="h-10 border-0 focus:ring-0 pl-3"
                                    />
                                    <CommandList className="max-h-[300px]">
                                      <CommandEmpty>No values found.</CommandEmpty>
                                      <CommandGroup>
                                        {uniqueValues.slice(0, valuePageSize).map((value, valueIndex) => {
                                          const valueStr = value === null || value === undefined ? '(Empty)' : String(value);
                                          const isSelected = condition.selectedValue === value;
                                          return (
                                            <CommandItem
                                              key={valueIndex}
                                              value={valueStr}
                                              onSelect={() => {
                                                handleValueSelect(index, value);
                                                setErrors(prev => ({
                                                  ...prev,
                                                  conditions: prev.conditions.map((err, i) => i === index ? '' : err)
                                                }));
                                              }}
                                              className="cursor-pointer"
                                            >
                                              <Check
                                                className={cn(
                                                  "mr-2 h-4 w-4 shrink-0",
                                                  isSelected ? "opacity-100" : "opacity-0"
                                                )}
                                              />
                                              <span className="truncate">{valueStr}</span>
                                            </CommandItem>
                                          );
                                        })}
                                      </CommandGroup>
                                      {uniqueValues.length > valuePageSize && (
                                        <div className="p-2 text-center text-xs text-muted-foreground">
                                          Showing first {valuePageSize} of {uniqueValues.length} values
                                        </div>
                                      )}
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              {conditionError && !condition.selectedValue && (
                                <p className="text-xs text-destructive mt-1">Value required</p>
                              )}
                              {/* Badge appears below input field - always reserve space to maintain position */}
                              <div className="mt-1 min-h-[24px] w-full min-w-0">
                                {condition.selectedValue && (() => {
                                  const valueStr = condition.selectedValue === null || condition.selectedValue === undefined 
                                    ? '(Empty)' 
                                    : String(condition.selectedValue);
                                  const displayValue = valueStr.length > 50 ? valueStr.substring(0, 50) + '...' : valueStr;
                                  const shouldShowTooltip = valueStr.length > 50;
                                  
                                  const badgeContent = (
                                    <Badge variant="secondary" className="text-xs inline-block max-w-full truncate">
                                      <span className="block truncate">{displayValue}</span>
                                    </Badge>
                                  );
                                  
                                  return shouldShowTooltip ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="cursor-help w-full min-w-0 inline-block">
                                          {badgeContent}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-md break-words">
                                        <p className="whitespace-normal">{valueStr}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : (
                                    <div className="w-full min-w-0">
                                      {badgeContent}
                                    </div>
                                  );
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Delete Button - Fixed width, responsive alignment */}
                      <div className="flex flex-col flex-shrink-0 w-full md:w-auto md:self-center">
                        <div className="flex justify-end md:justify-start">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              removeCondition(index);
                              setErrors(prev => ({
                                ...prev,
                                conditions: prev.conditions.filter((_, i) => i !== index)
                              }));
                            }}
                            className="h-10 w-10 p-0 md:mt-4"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Show full error message if exists */}
                    {conditionError && (
                      <p className="text-xs text-destructive mt-1">
                        {conditionError}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Affected Contacts Table - Always show when conditions are set */}
          {conditions.length > 0 && conditions.every(c => c.field && c.selectedValue) && contactType && timingType && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 mt-6"
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <div>
                        <CardTitle className="text-foreground">Affected Contacts</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Filter Contacts Based on Automation Criteria
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">Total: {totalContacts}</Badge>
                      <Badge variant="outline">Pages: {Math.ceil(totalContacts / 10)}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                    <Input
                      placeholder="Search contacts by name, email, phone, or ID..."
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      className="pl-10 h-10 focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Loading State */}
                  {isLoadingContacts ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary mb-4" />
                      <p className="text-sm text-muted-foreground">
                        Loading contacts...
                      </p>
                    </div>
                  ) : filteredContactsBySearch.length > 0 ? (
                    <>
                      <div className="border rounded-lg overflow-hidden border-border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>NAME</TableHead>
                              <TableHead>FIRST NAME</TableHead>
                              <TableHead>LAST NAME</TableHead>
                              <TableHead>PHONE</TableHead>
                              <TableHead>EMAIL</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredContactsBySearch.map((contact) => (
                              <TableRow key={contact._id} className="hover:bg-muted/50">
                                <TableCell className="font-medium text-foreground">
                                  {contact.name || contact.displayName || '-'}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {contact.firstName || '-'}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {contact.lastName || '-'}
                                </TableCell>
                                <TableCell>
                                  {contact.phone ? (
                                    <PhoneNumberDisplay phone={contact.phone} />
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {contact.email || '-'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      
                      {/* Pagination */}
                      {totalContacts > 10 && (
                        <Pagination
                          pagination={{
                            page: contactsPage,
                            limit: 10,
                            total: totalContacts,
                            pages: Math.ceil(totalContacts / 10),
                          }}
                          onPageChange={setContactsPage}
                        />
                      )}
                      {totalContacts <= 10 && totalContacts > 0 && (
                        <p className="text-sm text-muted-foreground text-center">
                          Showing {((contactsPage - 1) * 10) + 1} to {Math.min(contactsPage * 10, totalContacts)} of {totalContacts} entries
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      {contactSearch ? 'No contacts match your search' : 'No contacts match the conditions'}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Affected Deals Table - Always show when conditions are set */}
          {conditions.length > 0 && conditions.every(c => c.field && c.selectedValue) && conditions.some(c => c.entity === 'deal') && timingType && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 mt-6"
            >
              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <div>
                        <CardTitle className="text-foreground">Affected Deals</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Filter Deals Based on Automation Criteria
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">Total: {totalDeals}</Badge>
                      <Badge variant="outline">Pages: {Math.ceil(totalDeals / 10)}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                    <Input
                      placeholder="Search deals by name, ID, stage, or status..."
                      value={dealSearch}
                      onChange={(e) => setDealSearch(e.target.value)}
                      className="pl-10 h-10 focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {/* Loading State */}
                  {isLoadingContacts ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin motion-reduce:animate-none text-primary mb-4" />
                      <p className="text-sm text-muted-foreground">
                        Loading deals...
                      </p>
                    </div>
                  ) : filteredDealsBySearch.length > 0 ? (
                    <>
                      <div className="border rounded-lg overflow-hidden border-border">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="min-w-[120px]">DEAL ID</TableHead>
                                <TableHead className="min-w-[200px]">NAME</TableHead>
                                <TableHead className="min-w-[120px]">STAGE</TableHead>
                                <TableHead className="min-w-[120px]">STATUS</TableHead>
                                <TableHead className="min-w-[150px]">CREATED</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredDealsBySearch.map((deal) => (
                                <TableRow key={deal._id} className="hover:bg-muted/50">
                                  <TableCell className="font-mono text-sm text-foreground">
                                    {deal.deal_id || deal._id?.toString().slice(-8) || '-'}
                                  </TableCell>
                                  <TableCell className="font-medium text-foreground">
                                    {deal.name || '-'}
                                  </TableCell>
                                  <TableCell>
                                    {deal.stage ? (
                                      <Badge variant="outline" className="text-xs">
                                        {deal.stage}
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {deal.status ? (
                                      <Badge 
                                        variant={deal.status.toLowerCase() === 'won' ? 'default' : deal.status.toLowerCase() === 'lost' ? 'destructive' : 'secondary'}
                                        className="text-xs"
                                      >
                                        {deal.status}
                                      </Badge>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-muted-foreground text-sm">
                                    {deal.createdAt ? new Date(deal.createdAt).toLocaleDateString() : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                      
                      {/* Pagination */}
                      {totalDeals > 10 && (
                        <Pagination
                          pagination={{
                            page: dealsPage,
                            limit: 10,
                            total: totalDeals,
                            pages: Math.ceil(totalDeals / 10),
                          }}
                          onPageChange={setDealsPage}
                        />
                      )}
                      {totalDeals <= 10 && totalDeals > 0 && (
                        <p className="text-sm text-muted-foreground text-center">
                          Showing {((dealsPage - 1) * 10) + 1} to {Math.min(dealsPage * 10, totalDeals)} of {totalDeals} entries
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      {dealSearch ? 'No deals match your search' : 'No deals match the conditions'}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Timing Configuration Section */}
          <Card className="mt-6 bg-card border-border">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <CardTitle className="text-foreground">Timing Configuration</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Configure when messages should be sent to filtered contacts
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Timing Type */}
              <div className="space-y-2">
                <Label>Timing Type *</Label>
                <Select value={timingType} onValueChange={(value) => {
                  setTimingType(value);
                  setErrors(prev => ({ ...prev, timing: '' }));
                }}>
                  <SelectTrigger className={cn("w-60", errors.timing && "border-destructive")}>
                    <SelectValue placeholder="Select timing type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                    <SelectItem value="schedule">Schedule</SelectItem>
                  </SelectContent>
                </Select>
                {errors.timing && (
                  <p className="text-sm text-destructive">
                    {errors.timing}
                  </p>
                )}
                {!errors.timing && (
                  <p className="text-sm text-muted-foreground">
                    {timingType === 'immediate' &&
                      'Messages will be sent immediately when contacts match the conditions'}
                    {timingType === 'delayed' &&
                      'Messages will be sent after the specified delay period'}
                    {timingType === 'schedule' &&
                      'Messages will be sent at the specified date and time'}
                    {!timingType && 'Select when messages should be sent'}
                  </p>
                )}
              </div>

              {/* Delayed Configuration */}
              {timingType === 'delayed' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4"
                >
                  <Label className="text-base font-semibold text-foreground">Delay Period *</Label>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Select Day *</Label>
                      <Select
                        value={delay.days?.toString() || '0'}
                        onValueChange={(value) =>
                          setDelay({ ...delay, days: parseInt(value) || 0 })
                        }
                      >
                        <SelectTrigger className="w-full text-foreground">
                          <SelectValue placeholder="Days" />
                        </SelectTrigger>
                        <SelectContent className="border-border">
                          {Array.from({ length: 31 }, (_, i) => (
                            <SelectItem
                              key={i}
                              value={i.toString()}
                              className="text-foreground"
                            >
                              {i === 0 ? '0 day' : i === 1 ? '1 day' : `${i} days`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Select Hour *</Label>
                      <Select
                        value={delay.hours?.toString() || '0'}
                        onValueChange={(value) =>
                          setDelay({ ...delay, hours: parseInt(value) || 0 })
                        }
                      >
                        <SelectTrigger className="w-full text-foreground">
                          <SelectValue placeholder="Hours" />
                        </SelectTrigger>
                        <SelectContent className="border-border">
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem
                              key={i}
                              value={i.toString()}
                              className="text-foreground"
                            >
                              {i === 0 ? '0 hour' : i === 1 ? '1 hour' : `${i} hours`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Select Minute *</Label>
                      <Select
                        value={delay.minutes?.toString() || '0'}
                        onValueChange={(value) =>
                          setDelay({ ...delay, minutes: parseInt(value) || 0 })
                        }
                      >
                        <SelectTrigger className="w-full text-foreground">
                          <SelectValue placeholder="Minutes" />
                        </SelectTrigger>
                        <SelectContent className="border-border">
                          {Array.from({ length: 60 }, (_, i) => (
                            <SelectItem
                              key={i}
                              value={i.toString()}
                              className="text-foreground"
                            >
                              {i === 0 ? '0 minute' : i === 1 ? '1 minute' : `${i} minutes`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {/* Show calculated execution time in local timezone */}
                  {(delay.days > 0 || delay.hours > 0 || delay.minutes > 0) && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border-2 border-blue-200 dark:border-blue-800 rounded-lg shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                            Messages will be sent at:
                          </p>
                          <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                            {(() => {
                              const now = new Date();
                              const delayMs = (delay.days * 24 * 60 * 60 * 1000) + 
                                             (delay.hours * 60 * 60 * 1000) + 
                                             (delay.minutes * 60 * 1000);
                              const scheduledTime = new Date(now.getTime() + delayMs);
                              
                              return scheduledTime.toLocaleString(undefined, {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                timeZoneName: 'short'
                              });
                            })()}
                          </p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                            ⏰ Calculated based on your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Schedule Configuration */}
              {timingType === 'schedule' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-black dark:bg-white"></div>
                    <Label className="text-base font-semibold text-foreground">Schedule</Label>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4">
                    {/* Date Picker */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Select Date *</Label>
                      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal h-10 text-foreground hover:bg-muted",
                              !scheduleDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {scheduleDate ? (
                              format(scheduleDate, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={scheduleDate}
                            onSelect={handleDateSelect}
                            disabled={isDateDisabled}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Hour Selector */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Select Hour *</Label>
                      <Select
                        value={scheduleHour?.toString() || '0'}
                        onValueChange={handleHourChange}
                      >
                        <SelectTrigger className="w-full text-foreground h-10">
                          <SelectValue placeholder="Hour" />
                        </SelectTrigger>
                        <SelectContent className="border-border max-h-[200px]">
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem
                              key={i}
                              value={i.toString()}
                              className="text-foreground"
                            >
                              {String(i).padStart(2, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Minute Selector */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-muted-foreground">Select Minute *</Label>
                      <Select
                        value={scheduleMinute?.toString() || '0'}
                        onValueChange={handleMinuteChange}
                      >
                        <SelectTrigger className="w-full text-foreground h-10">
                          <SelectValue placeholder="Minute" />
                        </SelectTrigger>
                        <SelectContent className="border-border max-h-[200px]">
                          {Array.from({ length: 60 }, (_, i) => (
                            <SelectItem
                              key={i}
                              value={i.toString()}
                              className="text-foreground"
                            >
                              {String(i).padStart(2, '0')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Show selected scheduled time */}
                  {scheduledAt && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border-2 border-purple-200 dark:border-purple-800 rounded-lg shadow-sm">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-1">
                            Messages will be sent at:
                          </p>
                          <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                            {new Date(scheduledAt).toLocaleString(undefined, {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZoneName: 'short'
                            })}
                          </p>
                          <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                            ⏰ Scheduled in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Completion Indicator */}
          {isCompleted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg"
            >
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                ✓ This section has been completed
              </span>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="flex gap-3">
              <Button 
                onClick={handleSave} 
                disabled={isSaving || (!hasUnsavedChanges && isCompleted) || !contactType || conditions.length === 0 || !timingType}
                variant={isCompleted && !hasUnsavedChanges ? "outline" : "default"}
                className={cn(isCompleted && !hasUnsavedChanges && "opacity-50 cursor-not-allowed")}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </>
                )}
              </Button>
              {isCompleted && (
                <Button onClick={onNext} className="bg-primary hover:bg-primary/90">
                  Next
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

