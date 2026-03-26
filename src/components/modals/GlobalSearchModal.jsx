// src/components/modals/GlobalSearchModal.jsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, User, MessageSquare, Users, Loader2, ArrowRight, Clock, Trash2, Briefcase, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/api/client';
import { useDebounce } from '@/hooks/useDebounce';

const RECENT_SEARCHES_KEY = 'global_search_recent';
const MAX_RECENT_SEARCHES = 5;

export default function GlobalSearchModal({ open, onOpenChange }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState([]);
  const inputRef = useRef(null);

  // Debounce search query (200ms for snappier feel)
  const debouncedSearchQuery = useDebounce(searchQuery, 200);

  // ✅ Load recent searches from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        if (stored) {
          setRecentSearches(JSON.parse(stored));
        }
      } catch (error) {
        console.error('Failed to load recent searches:', error);
      }
    }
  }, []);

  // ✅ Save clicked result to recent searches (store full result object)
  const saveToRecentSearches = (result) => {
    if (!result || !result.id) return;
    
    // Create a unique key for the result
    const resultKey = `${result.type}-${result.id}`;
    
    // Remove if already exists and add to top
    const updated = [
      { ...result, clickedAt: new Date().toISOString() },
      ...recentSearches.filter(s => `${s.type}-${s.id}` !== resultKey)
    ].slice(0, MAX_RECENT_SEARCHES);
    
    setRecentSearches(updated);
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save recent searches:', error);
      }
    }
  };

  // ✅ Clear recent searches
  const clearRecentSearches = () => {
    setRecentSearches([]);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
      } catch (error) {
        console.error('Failed to clear recent searches:', error);
      }
    }
  };

  // ✅ Remove single recent search
  const removeRecentSearch = (resultToRemove, e) => {
    e.stopPropagation(); // Prevent triggering the click handler
    const resultKey = `${resultToRemove.type}-${resultToRemove.id}`;
    const updated = recentSearches.filter(s => `${s.type}-${s.id}` !== resultKey);
    setRecentSearches(updated);
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to remove recent search:', error);
      }
    }
  };

  // ✅ Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      // Use multiple attempts to ensure focus works with Dialog animations
      const timeouts = [
        setTimeout(() => inputRef.current?.focus(), 0),
        setTimeout(() => inputRef.current?.focus(), 50),
        setTimeout(() => inputRef.current?.focus(), 150),
      ];
      
      return () => {
        timeouts.forEach(clearTimeout);
      };
    }
  }, [open]);

  // ✅ Clear search when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  // ✅ Global search query - use debounced query with proper cancellation
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['globalSearch', debouncedSearchQuery],
    queryFn: async ({ signal }) => {
      if (!debouncedSearchQuery || debouncedSearchQuery.trim().length < 2) {
        return { contacts: [], conversations: [], users: [], deals: [], messages: [] };
      }
      
      try {
        // Use AbortSignal for request cancellation (React Query provides this automatically)
        const response = await apiClient.get(`/search/global?q=${encodeURIComponent(debouncedSearchQuery)}&limit=15`, {
          signal, // Pass signal for cancellation
          timeout: 8000 // 8 second timeout (apiClient has 10s default, but be explicit)
        });
        return response.data || { contacts: [], conversations: [], users: [], deals: [], messages: [] };
      } catch (error) {
        // Don't throw on cancellation - just return empty results
        if (error.name === 'AbortError' || error.name === 'CanceledError') {
          return { contacts: [], conversations: [], users: [], deals: [], messages: [] };
        }
        throw error;
      }
    },
    enabled: debouncedSearchQuery.trim().length >= 2,
    staleTime: 30000, // Cache for 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1, // Only retry once on failure
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  const handleResultClick = (result) => {
    let path = '';
    
    switch (result.type) {
      case 'contact':
        path = `/c/contacts/${result.id}`;
        break;
      case 'conversation':
        path = `/c/conversations/${result.id}`;
        break;
      case 'user':
        path = `/c/users/${result.id}/edit`;
        break;
      case 'deal':
        path = `/c/deals/${result.id}`;
        break;
      case 'message':
        // Navigate to the conversation that contains this message
        if (result.metadata?.conversationId) {
          path = `/c/conversations/${result.metadata.conversationId}`;
        } else {
          return; // Can't navigate without conversation ID
        }
        break;
      default:
        return;
    }
    
    if (path) {
      // Save the clicked result (not the query) to recent searches
      saveToRecentSearches(result);
      onOpenChange(false);
      router.push(path);
    }
  };

  const handleRecentSearchClick = (result) => {
    // Navigate directly to the result
    handleResultClick(result);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    inputRef.current?.focus();
  };

  // Deduplicate results across categories by id
  const allResults = (() => {
    const raw = [
      ...(searchResults?.contacts || []),
      ...(searchResults?.conversations || []),
      ...(searchResults?.users || []),
      ...(searchResults?.deals || []),
      ...(searchResults?.messages || [])
    ];
    const seen = new Set();
    return raw.filter(r => {
      const key = `${r.type}-${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const showRecentSearches = !debouncedSearchQuery && recentSearches.length > 0;
  const showEmptyState = !debouncedSearchQuery && recentSearches.length === 0;
  const showSearchResults = debouncedSearchQuery.trim().length >= 2;

  // Animation variants
  const modalVariants = {
    hidden: {
      opacity: 0,
      scale: 0.95,
      y: -20,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        type: 'spring',
        damping: 25,
        stiffness: 300,
        duration: 0.3,
      },
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      y: -20,
      transition: {
        duration: 0.2,
      },
    },
  };

  const resultVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: (i) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.03,
        duration: 0.2,
      },
    }),
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'contact':
        return <User className="h-4 w-4" />;
      case 'conversation':
        return <MessageSquare className="h-4 w-4" />;
      case 'user':
        return <Users className="h-4 w-4" />;
      case 'deal':
        return <Briefcase className="h-4 w-4" />;
      case 'message':
        return <FileText className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'contact':
        return 'Contact';
      case 'conversation':
        return 'Conversation';
      case 'user':
        return 'User';
      case 'deal':
        return 'Deal';
      case 'message':
        return 'Message';
      default:
        return 'Result';
    }
  };

  // ✅ Truncate title to 50 characters for recent searches
  const truncateTitle = (title, maxLength = 50) => {
    if (!title) return 'Unknown';
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  return (
    <AnimatePresence>
      {open && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent 
            className="sm:max-w-2xl max-w-[95vw] p-0 overflow-hidden max-h-[85vh] h-[85vh] flex flex-col"
            onKeyDown={handleKeyDown}
            onInteractOutside={() => onOpenChange(false)}
            showCloseButton={false}
          >
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-col h-full"
            >
              {/* DialogTitle for accessibility (visually hidden) */}
              <DialogTitle className="sr-only">Global Search</DialogTitle>
              
              {/* Search Input Header */}
              <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 border-b shrink-0">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex-1">
                    Search
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onOpenChange(false)}
                    className="h-8 w-8 min-h-[44px] min-w-[44px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    aria-label="Close search"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" aria-hidden="true" />
                  <Input
                    ref={inputRef}
                    type="search"
                    placeholder="Search contacts, conversations, users, deals, messages..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10 h-12 text-base"
                    onKeyDown={handleKeyDown}
                    aria-label="Global search"
                    autoComplete="off"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={handleClearSearch}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-md"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Results Content */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="px-4 sm:px-6 py-4">
                  {(isLoading || (searchQuery.trim().length >= 2 && searchQuery !== debouncedSearchQuery)) ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-center py-12"
                    >
                      <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none text-gray-400" />
                    </motion.div>
                  ) : showRecentSearches ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Recent Searches
                        </h3>
                        {recentSearches.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearRecentSearches}
                            className="h-7 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {recentSearches.map((result, index) => {
                          const truncatedTitle = truncateTitle(result.title);
                          return (
                            <motion.div
                              key={`${result.type}-${result.id}`}
                              variants={resultVariants}
                              custom={index}
                              initial="hidden"
                              animate="visible"
                              onClick={() => handleRecentSearchClick(result)}
                              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors group relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleRecentSearchClick(result);
                                }
                              }}
                              aria-label={`Recent: ${result.title || 'Unknown'}`}
                            >
                              <Avatar className="h-10 w-10 shrink-0 ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-indigo-500 dark:group-hover:ring-indigo-400 transition-all">
                                <AvatarImage src={result.avatar} />
                                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-medium">
                                  {result.title?.charAt(0)?.toUpperCase() || '?'}
                                </AvatarFallback>
                              </Avatar>
                              
                              <div className="min-w-0 overflow-hidden">
                                <div className="flex items-center gap-2 mb-1 min-w-0">
                                  <div className="text-gray-400 dark:text-gray-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors shrink-0">
                                    {getTypeIcon(result.type)}
                                  </div>
                                  <p 
                                    className="font-medium text-gray-900 dark:text-gray-100 min-w-0 flex-1 truncate" 
                                    title={result.title || 'Unknown'}
                                  >
                                    {truncatedTitle}
                                  </p>
                                  <Badge variant="outline" className="text-xs shrink-0 border-gray-200 dark:border-gray-700">
                                    {getTypeLabel(result.type)}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                  {result.subtitle || 'No description'}
                                </p>
                              </div>
                              
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={(e) => removeRecentSearch(result, e)}
                                  className="h-7 w-7 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                  aria-label="Remove from recent searches"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                                <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 shrink-0 opacity-0 group-hover:opacity-100 transition-all" />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : showEmptyState ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center justify-center py-12 text-center"
                    >
                      <div className="h-16 w-16 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/20 dark:to-purple-900/20 flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-300 font-medium mb-1">
                        Start searching
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm">
                        Search across contacts, conversations, users, deals, and messages to quickly find what you're looking for
                      </p>
                    </motion.div>
                  ) : debouncedSearchQuery.trim().length >= 2 && allResults.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center justify-center py-12 text-center"
                    >
                      <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                        <Search className="h-8 w-8 text-gray-400" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-300 font-medium mb-1">
                        No results found
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">
                        Try a different search term
                      </p>
                    </motion.div>
                  ) : debouncedSearchQuery.trim().length >= 2 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-1"
                    >
                      {/* Result count */}
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {allResults.length} result{allResults.length !== 1 ? 's' : ''} found
                        </p>
                      </div>
                      {allResults.map((result, index) => (
                        <motion.div
                          key={`${result.type}-${result.id}`}
                          variants={resultVariants}
                          custom={index}
                          initial="hidden"
                          animate="visible"
                          onClick={() => handleResultClick(result)}
                          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors group"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleResultClick(result);
                            }
                          }}
                          aria-label={`${getTypeLabel(result.type)}: ${result.title || 'Unknown'}`}
                        >
                          <Avatar className="h-10 w-10 shrink-0 ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-indigo-500 dark:group-hover:ring-indigo-400 transition-all">
                            <AvatarImage src={result.avatar} />
                            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-medium">
                              {result.title?.charAt(0)?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>

                          <div className="min-w-0 overflow-hidden">
                            <div className="flex items-center gap-2 mb-1 min-w-0">
                              <div className="text-gray-400 dark:text-gray-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors shrink-0">
                                {getTypeIcon(result.type)}
                              </div>
                              <p
                                className="font-medium text-gray-900 dark:text-gray-100 min-w-0 flex-1 truncate"
                                title={result.title || 'Unknown'}
                              >
                                {result.title || 'Unknown'}
                              </p>
                              <Badge variant="outline" className="text-xs shrink-0 border-gray-200 dark:border-gray-700">
                                {getTypeLabel(result.type)}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {result.subtitle || 'No description'}
                            </p>
                          </div>

                          <ArrowRight className="h-4 w-4 text-gray-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 shrink-0 opacity-0 group-hover:opacity-100 transition-all" />
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : null}
                </div>
              </ScrollArea>
            </motion.div>
          </DialogContent>
        </Dialog>
      )}
    </AnimatePresence>
  );
}
