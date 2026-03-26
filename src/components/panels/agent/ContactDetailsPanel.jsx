// src/components/panels/agent/ContactDetailsPanel.jsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Calendar, 
  User, 
  Building2, 
  Tag,
  FileText,
  MessageSquare,
  Info,
  Search,
  Copy,
  Check
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ContactTags from '@/components/chat/ContactTags';

// Contact Type keys to exclude from nested section entries (value shown as Contact_Type in header)
const CONTACT_TYPE_KEYS_SET = new Set(['Contact Type', 'Contact_Type', 'ContactType', 'contact_type', 'contactType']);
function isContactTypeKey(key) {
  if (!key) return false;
  const n = key.toLowerCase().replace(/\s+/g, '_');
  return CONTACT_TYPE_KEYS_SET.has(key) || n === 'contact_type' || n === 'contacttype';
}

// Helper component for Details sub-tabs — tabs match data structure (nested sections)
function DetailsSubTabs({ details, formatFieldName, formatFieldValue }) {
  const [searchQuery, setSearchQuery] = useState('');

  const { sections, generalFields, allFieldsFlat } = useMemo(() => {
    const sections = {};
    const generalFields = [];
    const allFieldsFlat = [];

    Object.entries(details).forEach(([key, value]) => {
      const isNestedObject =
        value !== null &&
        typeof value === 'object' &&
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
  }, [details]);

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
    const tabs = ['all'];
    if (generalFields.length > 0) tabs.push('general');
    Object.keys(sections).forEach((sectionKey) => tabs.push(sectionKey));
    return tabs;
  }, [sections, generalFields]);

  const [activeSubTab, setActiveSubTab] = useState('all');

  useEffect(() => {
    if (!visibleTabs.includes(activeSubTab)) {
      setActiveSubTab(visibleTabs[0] || 'all');
    }
  }, [visibleTabs, activeSubTab]);

  const getActiveFields = () => {
    if (activeSubTab === 'all') return allFieldsFlat;
    if (activeSubTab === 'general') return generalFields;
    return sections[activeSubTab] || [];
  };

  const activeFields = filterFields(getActiveFields());

  const getCategoryCount = (category) => {
    if (category === 'all') return allFieldsFlat.length;
    if (category === 'general') return generalFields.length;
    return sections[category]?.length || 0;
  };

  const getTabLabel = (category) => {
    if (category === 'all') return 'All';
    if (category === 'general') return 'General';
    return category.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.3 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: (i) => ({
      opacity: 1,
      x: 0,
      transition: { delay: i * 0.03, duration: 0.2 }
    })
  };

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Additional Details
            </CardTitle>
            {/* Search Input */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search fields..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="w-full">
            <TabsList 
              className="grid w-full mb-4"
              style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
            >
              {visibleTabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="text-xs">
                  {getTabLabel(tab)} ({getCategoryCount(tab)})
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={activeSubTab} className="mt-0">
              {activeFields.length > 0 ? (
                <div className="space-y-1 max-h-[500px] overflow-y-auto pr-2">
                  {activeFields.map(([key, value], index) => (
                    <motion.div
                      key={key}
                      variants={itemVariants}
                      custom={index}
                      initial="hidden"
                      animate="visible"
                      className="flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-4 py-3 px-3 rounded-lg bg-gray-50/80 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800/80 hover:bg-gray-100/80 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400 shrink-0 sm:w-[180px]">
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
                      {searchQuery ? 'No fields match your search' : 'No fields in this category'}
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function ContactDetailsPanel({ contact, conversation }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!contact) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No contact information
      </div>
    );
  }

  // Convert details Map to object if needed
  const details = contact.details instanceof Map 
    ? Object.fromEntries(contact.details) 
    : (contact.details || {});

  // Convert metadata Map to object if needed and merge with details
  const metadata = contact.metadata instanceof Map
    ? Object.fromEntries(contact.metadata)
    : (contact.metadata || {});
  
  // Contact Type belongs to schema Contact_Type only — exclude from details list
  const CONTACT_TYPE_KEYS = ['Contact Type', 'Contact_Type', 'ContactType', 'contact_type', 'contactType'];
  const isContactTypeKey = (key) =>
    CONTACT_TYPE_KEYS.some((k) => key === k || key.toLowerCase().replace(/\s+/g, '_') === k.toLowerCase());
  const allDetailsRaw = { ...details, ...metadata };
  const allDetails = Object.fromEntries(
    Object.entries(allDetailsRaw).filter(([key]) => !isContactTypeKey(key))
  );

  // Helper function to format field names (convert underscores to spaces, capitalize)
  const formatFieldName = (key) => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatDateTime = (v) => {
    try {
      const d = v instanceof Date ? v : new Date(v);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return null;
    }
  };

  const parseRunOnString = (s) => {
    const trimmed = String(s).trim();
    if (!trimmed) return null;
    if (trimmed.includes('=') && (trimmed.includes('&') || trimmed.includes('.'))) {
      const pairs = trimmed.split(/[&]/).map((part) => {
        const eq = part.indexOf('=');
        if (eq === -1) return null;
        const k = part.slice(0, eq).trim().replace(/_/g, ' ');
        const v = part.slice(eq + 1).trim();
        if (!k) return null;
        return `${k.replace(/\b\w/g, l => l.toUpperCase())}: ${v}`;
      });
      const filtered = pairs.filter(Boolean);
      if (filtered.length > 0) return filtered.join('\n');
    }
    if (/:\s*[^.]+\.[\s]*[A-Za-z]/.test(trimmed) || trimmed.includes('. ')) {
      const parts = trimmed.split(/\.\s+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) return parts.join('\n');
    }
    return null;
  };

  const formatSingleValue = (v) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v.trim())) {
      const formatted = formatDateTime(v);
      if (formatted) return formatted;
    }
    if (v instanceof Date || (typeof v === 'string' && !isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}/.test(v))) {
      const formatted = formatDateTime(v);
      if (formatted) return formatted;
      return String(v);
    }
    if (typeof v === 'object') return formatComplexValue(v);
    const s = String(v).trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        return formatComplexValue(JSON.parse(s));
      } catch {
        const parsed = parseRunOnString(s);
        return parsed || s || '—';
      }
    }
    const parsed = parseRunOnString(s);
    return parsed || s || '—';
  };

  const formatComplexValue = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return String(value);
    if (Array.isArray(value)) {
      const parts = value.map((item) =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
          ? Object.entries(item).map(([k, v]) => `${formatFieldName(k)}: ${formatSingleValue(v)}`).join(', ')
          : formatSingleValue(item)
      );
      return parts.length ? parts.join('\n') : '—';
    }
    if (typeof value === 'object') {
      const pairs = Object.entries(value)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${formatFieldName(k)}: ${formatSingleValue(v)}`);
      return pairs.length ? pairs.join('\n') : 'N/A';
    }
    return String(value).trim() || 'N/A';
  };

  const formatFieldValue = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return formatComplexValue(value);
    const s = String(value).trim();
    if (!s) return 'N/A';
    if (s.startsWith('{') || s.startsWith('[')) {
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

  // Animation variants
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.3 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: (i) => ({
      opacity: 1,
      x: 0,
      transition: { delay: i * 0.05, duration: 0.2 }
    })
  };

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      {/* Contact Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center mb-4">
              <Avatar className="h-20 w-20 mb-3 ring-2 ring-primary/20">
              <AvatarImage src={contact.avatar} />
                <AvatarFallback className="text-lg bg-gradient-to-br from-primary/20 to-primary/10">
                  {(contact.firstName?.[0] || contact.name?.[0] || 'U').toUpperCase()}
              </AvatarFallback>
            </Avatar>
              <h3 className="font-semibold text-lg">
                {contact.firstName && contact.lastName
                  ? `${contact.firstName} ${contact.lastName}`
                  : contact.name || 'Unknown'}
              </h3>
              {contact.Salutation && (
                <p className="text-sm text-gray-500">{contact.Salutation}</p>
              )}
              {contact.email && (
            <p className="text-sm text-gray-500">{contact.email}</p>
              )}
              {contact.Contact_Type && (
                <Badge variant="outline" className="mt-2">
                  {contact.Contact_Type}
                </Badge>
              )}
          </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="details" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contact.firstName && (
                  <motion.div 
                    variants={itemVariants}
                    custom={0}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <User className="h-3.5 w-3.5" />
                      First Name
                    </span>
                    <span className="text-sm font-medium">{contact.firstName}</span>
                  </motion.div>
                )}
                {contact.lastName && (
                  <motion.div 
                    variants={itemVariants}
                    custom={1}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <User className="h-3.5 w-3.5" />
                      Last Name
                    </span>
                    <span className="text-sm font-medium">{contact.lastName}</span>
                  </motion.div>
                )}
                {contact.displayName && (
                  <motion.div 
                    variants={itemVariants}
                    custom={2}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500">Display Name</span>
                    <span className="text-sm font-medium">{contact.displayName}</span>
                  </motion.div>
                )}
                {contact.name && (
                  <motion.div 
                    variants={itemVariants}
                    custom={3}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500">Full Name</span>
                    <span className="text-sm font-medium">{contact.name}</span>
                  </motion.div>
                )}
            {contact.email && (
                  <motion.div 
                    variants={itemVariants}
                    custom={4}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      Email
                    </span>
                    <span className="text-sm font-medium">{contact.email}</span>
                  </motion.div>
            )}
            {contact.phone && (
                  <motion.div 
                    variants={itemVariants}
                    custom={5}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      Phone
                    </span>
                    <span className="text-sm font-medium">{contact.phone}</span>
                  </motion.div>
                )}
                {contact.Salutation && (
                  <motion.div 
                    variants={itemVariants}
                    custom={6}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <User className="h-3.5 w-3.5" />
                      Salutation
                    </span>
                    <span className="text-sm font-medium">{contact.Salutation}</span>
                  </motion.div>
                )}
                {contact.Contact_Type && (
                  <motion.div 
                    variants={itemVariants}
                    custom={7}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5" />
                      Contact Type
                    </span>
                    <Badge variant="outline">{contact.Contact_Type}</Badge>
                  </motion.div>
                )}
                <motion.div 
                  variants={itemVariants}
                  custom={8}
                  initial="hidden"
                  animate="visible"
                  className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                >
                  <span className="text-sm text-gray-500">Status</span>
                  <Badge 
                    className={
                      contact.Is_Active !== false 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                    }
                  >
                    {contact.Is_Active !== false ? 'Active' : 'Inactive'}
                  </Badge>
                </motion.div>
                {contact.SF_id && (
                  <motion.div 
                    variants={itemVariants}
                    custom={9}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5" />
                      Salesforce ID
                    </span>
                    <span className="text-sm font-medium font-mono">{contact.SF_id}</span>
                  </motion.div>
                )}
                {contact.company && (
                  <motion.div 
                    variants={itemVariants}
                    custom={10}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5" />
                      Company
                    </span>
                    <span className="text-sm font-medium">{contact.company}</span>
                  </motion.div>
                )}
                {contact.jobTitle && (
                  <motion.div 
                    variants={itemVariants}
                    custom={11}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500">Job Title</span>
                    <span className="text-sm font-medium">{contact.jobTitle}</span>
                  </motion.div>
                )}
                {contact.timezone && (
                  <motion.div 
                    variants={itemVariants}
                    custom={12}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500">Timezone</span>
                    <span className="text-sm font-medium">{contact.timezone}</span>
                  </motion.div>
                )}
                {contact.language && (
                  <motion.div 
                    variants={itemVariants}
                    custom={13}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500">Language</span>
                    <span className="text-sm font-medium">{contact.language}</span>
                  </motion.div>
                )}
                {contact.webchatLink && (
                  <motion.div 
                    variants={itemVariants}
                    custom={14}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 gap-2"
                  >
                    <span className="text-sm text-gray-500">WebChat Link</span>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <span className="text-sm font-medium break-all text-blue-600 max-w-[200px] truncate">{contact.webchatLink}</span>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(contact.webchatLink);
                            setCopiedLink(true);
                            setTimeout(() => setCopiedLink(false), 2000);
                          } catch (error) {
                            console.error('Failed to copy link');
                          }
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                        title="Copy link"
                      >
                        {copiedLink ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </button>
              </div>
                  </motion.div>
                )}
                {contact.conversationCount !== undefined && (
                  <motion.div 
                    variants={itemVariants}
                    custom={15}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Conversations
                    </span>
                    <span className="text-sm font-medium">{contact.conversationCount || 0}</span>
                  </motion.div>
                )}
                {contact.messageCount !== undefined && (
                  <motion.div 
                    variants={itemVariants}
                    custom={16}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500">Messages</span>
                    <span className="text-sm font-medium">{contact.messageCount || 0}</span>
                  </motion.div>
                )}
                {contact.blocked && (
                  <motion.div 
                    variants={itemVariants}
                    custom={17}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500">Blocked</span>
                    <Badge variant="destructive">Yes</Badge>
                  </motion.div>
                )}
                {contact.department && (
                  <motion.div 
                    variants={itemVariants}
                    custom={19}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800"
                  >
                    <span className="text-sm text-gray-500 flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5" />
                      Department
                    </span>
                    <span className="text-sm font-medium">
                      {typeof contact.department === 'object' && contact.department.name
                        ? contact.department.name
                        : String(contact.department)}
                    </span>
                  </motion.div>
                )}
                {contact.blockedBy && (
                  <motion.div 
                    variants={itemVariants}
                    custom={20}
                    initial="hidden"
                    animate="visible"
                    className="flex justify-between items-center py-2"
                  >
                    <span className="text-sm text-gray-500">Blocked By</span>
                    <span className="text-sm font-medium font-mono">
                      {typeof contact.blockedBy === 'object' && contact.blockedBy.name
                        ? contact.blockedBy.name
                        : String(contact.blockedBy)}
                    </span>
                  </motion.div>
                )}
        </CardContent>
      </Card>
          </motion.div>

      {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
      <Card>
        <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Tags
                  </CardTitle>
        </CardHeader>
        <CardContent>
          <ContactTags contactId={contact._id} tags={contact.tags || []} />
        </CardContent>
      </Card>
            </motion.div>
          )}


          {/* Activity */}
          {contact.lastInteraction && (
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
        <Card>
          <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Activity
                  </CardTitle>
          </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-500">Last interaction</span>
                    <span className="font-medium">
                      {formatDistanceToNow(new Date(contact.lastInteraction), { addSuffix: true })}
                    </span>
                  </div>
                  {contact.conversationCount !== undefined && (
                    <div className="flex justify-between items-center py-2 border-t border-gray-100 dark:border-gray-800">
                      <span className="text-sm text-gray-500">Conversations</span>
                      <span className="text-sm font-medium">{contact.conversationCount || 0}</span>
                </div>
                  )}
                  {contact.messageCount !== undefined && (
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-gray-500">Messages</span>
                      <span className="text-sm font-medium">{contact.messageCount || 0}</span>
            </div>
                  )}
          </CardContent>
        </Card>
            </motion.div>
      )}

      {/* Conversation Info */}
          {conversation && (
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
            >
      <Card>
        <CardHeader>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Conversation Details
                  </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-sm text-gray-500">Status</span>
            <Badge variant={conversation.status === 'open' ? 'default' : 'secondary'}>
              {conversation.status}
            </Badge>
          </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-sm text-gray-500">Channel</span>
                    <span className="text-sm font-medium capitalize">{conversation.channel}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-gray-500">Messages</span>
                    <span className="text-sm font-medium">{conversation.messageCount || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </TabsContent>

        {/* Details Tab - Display all details from details column with sub-tabs */}
        <TabsContent value="details" className="space-y-4 mt-4">
          {Object.keys(allDetails).length > 0 ? (
            <DetailsSubTabs details={allDetails} formatFieldName={formatFieldName} formatFieldValue={formatFieldValue} />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center py-12 text-gray-500"
            >
              <div className="text-center">
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">No additional details available</p>
              </div>
            </motion.div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4 mt-4">
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Activity Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {contact.lastInteraction && (
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
                        <div className="h-full w-px bg-gray-200 dark:bg-gray-700 mt-2" />
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm font-medium">Last Interaction</p>
                        <p className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(contact.lastInteraction), { addSuffix: true })}
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
                        <p className="text-sm font-medium">Contact Created</p>
                        <p className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(contact.createdAt), { addSuffix: true })}
                        </p>
                      </div>
          </div>
                  )}
          </div>
        </CardContent>
      </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}