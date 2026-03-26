// src/components/webchat/WebChatEmojiPicker.jsx
/**
 * Enhanced Emoji Picker for WebChat
 * Allows multiple emoji selections and positioned on the left
 */

'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Smile, Heart, ThumbsUp, Laugh, Flame, Zap, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const EMOJI_CATEGORIES = {
  smileys: {
    name: 'Smileys',
    icon: Smile,
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😌', '😔', '😑', '😐', '😏', '🥱'],
  },
  hearts: {
    name: 'Hearts',
    icon: Heart,
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  },
  thumbs: {
    name: 'Hands',
    icon: ThumbsUp,
    emojis: ['👍', '👎', '👏', '🙌', '👐', '🤲', '🤝', '🤜', '🤛', '✊', '👊', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤞', '🫰', '🤟', '🤘', '🤙'],
  },
  laughing: {
    name: 'Emotion',
    icon: Laugh,
    emojis: ['😀', '😂', '😍', '🤩', '😘', '😜', '🤣', '😅', '😆', '😉', '😊', '🥰', '😗', '😚', '😙', '🤪', '😌', '😔', '😢', '😭', '😤', '😠', '😡', '🤬', '😈'],
  },
  fire: {
    name: 'Popular',
    icon: Flame,
    emojis: ['🔥', '✨', '⭐', '💫', '🎉', '🎊', '🎈', '🎁', '🏆', '👑', '💯', '💥', '🚀', '⚡', '🌟', '💎', '🎯', '🎪', '🎭', '🎨', '🎬', '🎤', '🎧', '🎮', '🎲'],
  },
  animals: {
    name: 'Animals',
    icon: Zap,
    emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗'],
  },
};

export default function WebChatEmojiPicker({ onSelect, isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [selectedEmojis, setSelectedEmojis] = useState([]);
  const { theme } = useTheme();
  const pickerRef = useRef(null);

  const filteredEmojis = useMemo(() => {
    if (!searchQuery) {
      return EMOJI_CATEGORIES[activeCategory]?.emojis || [];
    }
    return Object.values(EMOJI_CATEGORIES)
      .flatMap((cat) => cat.emojis)
      .filter((emoji) => emoji.includes(searchQuery.toLowerCase()));
  }, [searchQuery, activeCategory]);

  const handleEmojiClick = (emoji) => {
    // Add emoji to selected list (multiple selection)
    setSelectedEmojis(prev => [...prev, emoji]);
    // Call onSelect with the emoji
    onSelect(emoji);
    // Keep picker open for multiple selections
    setSearchQuery('');
  };

  const removeSelectedEmoji = (index) => {
    setSelectedEmojis(prev => prev.filter((_, i) => i !== index));
  };

  const handleInsertAll = () => {
    if (selectedEmojis.length > 0) {
      selectedEmojis.forEach(emoji => onSelect(emoji));
      setSelectedEmojis([]);
    }
  };

  // Reset selected emojis when picker closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedEmojis([]);
    }
  }, [isOpen]);

  // Focus trap - keep focus inside picker when open
  useEffect(() => {
    if (!isOpen || !pickerRef.current) return;

    const picker = pickerRef.current;
    const focusableElements = picker.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
    const firstEl = focusableElements[0];
    const lastEl = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    };

    picker.addEventListener('keydown', handleKeyDown);
    // Auto-focus search input
    const searchInput = picker.querySelector('input');
    searchInput?.focus();

    return () => picker.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={pickerRef}
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 10 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-label="Emoji picker"
          className={cn(
            'absolute bottom-full left-0 mb-2 z-[100] w-[calc(100vw-2rem)] sm:w-[320px] md:w-[360px] max-w-[360px]',
            'bg-white dark:bg-gray-900',
            'rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700',
            'overflow-hidden',
            'max-h-[85vh] flex flex-col'
          )}
        >
          {/* Selected Emojis Bar */}
          {selectedEmojis.length > 0 && (
            <div className="p-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 flex items-center gap-2 flex-wrap max-h-20 overflow-y-auto">
              {selectedEmojis.map((emoji, index) => (
                <motion.div
                  key={index}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="relative group"
                >
                  <span className="text-2xl">{emoji}</span>
                  <button
                    onClick={() => removeSelectedEmoji(index)}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </motion.div>
              ))}
              {selectedEmojis.length > 0 && (
                <button
                  onClick={handleInsertAll}
                  className="ml-auto text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 transition-colors"
                >
                  Insert All
                </button>
              )}
            </div>
          )}

          {/* Search */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <Input
              placeholder="Search emojis..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8"
              autoFocus
            />
          </div>

          {/* Categories & Emojis */}
          <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex-1 flex flex-col min-h-0">
            {/* Tab list */}
            <div className="px-3 pt-3 flex-shrink-0">
              <TabsList className="grid w-full grid-cols-6 bg-gray-100 dark:bg-gray-800 h-8">
                {Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => {
                  const Icon = cat.icon;
                  return (
                    <TabsTrigger
                      key={key}
                      value={key}
                      className="h-6 p-0 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700"
                    >
                      <Icon className="h-4 w-4" />
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {/* Emoji grid */}
            <div className="px-3 py-3 flex-1 overflow-y-auto min-h-0">
              {searchQuery ? (
                <div className="grid grid-cols-8 gap-1">
                  {filteredEmojis.map((emoji, i) => (
                    <motion.button
                      key={i}
                      onClick={() => handleEmojiClick(emoji)}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1 transition-colors"
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>
              ) : (
                Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => (
                  <TabsContent key={key} value={key} className="m-0">
                    <div className="grid grid-cols-8 gap-1">
                      {cat.emojis.map((emoji, i) => (
                        <motion.button
                          key={i}
                          onClick={() => handleEmojiClick(emoji)}
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1 transition-colors"
                        >
                          {emoji}
                        </motion.button>
                      ))}
                    </div>
                  </TabsContent>
                ))
              )}
            </div>
          </Tabs>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

