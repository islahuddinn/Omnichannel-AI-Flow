// src/components/chat/EmojiPicker.jsx

'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Smile, Heart, ThumbsUp, Laugh, Flame, Zap } from 'lucide-react';

// Emoji data with search keywords
const EMOJI_CATEGORIES = {
  smileys: {
    name: 'Smileys',
    icon: Smile,
    emojis: [
      { emoji: '😀', keywords: ['grinning', 'happy', 'smile', 'face'] },
      { emoji: '😃', keywords: ['grinning', 'eyes', 'happy', 'smile'] },
      { emoji: '😄', keywords: ['grinning', 'smiling', 'eyes', 'happy'] },
      { emoji: '😁', keywords: ['beaming', 'smiling', 'eyes', 'happy'] },
      { emoji: '😆', keywords: ['squinting', 'laughing', 'happy'] },
      { emoji: '😅', keywords: ['sweat', 'smile', 'relieved'] },
      { emoji: '🤣', keywords: ['rolling', 'floor', 'laughing', 'rofl'] },
      { emoji: '😂', keywords: ['tears', 'joy', 'laughing', 'crying'] },
      { emoji: '🙂', keywords: ['slightly', 'smiling', 'face'] },
      { emoji: '🙃', keywords: ['upside', 'down', 'face'] },
      { emoji: '😉', keywords: ['winking', 'face', 'wink'] },
      { emoji: '😊', keywords: ['smiling', 'eyes', 'blush', 'happy'] },
      { emoji: '😇', keywords: ['halo', 'angel', 'innocent'] },
      { emoji: '🥰', keywords: ['smiling', 'hearts', 'love', 'in love'] },
      { emoji: '😍', keywords: ['heart', 'eyes', 'love', 'like'] },
      { emoji: '🤩', keywords: ['star', 'struck', 'excited'] },
      { emoji: '😘', keywords: ['kiss', 'blowing', 'love'] },
      { emoji: '😗', keywords: ['kissing', 'face'] },
      { emoji: '😚', keywords: ['kissing', 'closed', 'eyes'] },
      { emoji: '😙', keywords: ['kissing', 'smiling', 'eyes'] },
      { emoji: '🥲', keywords: ['smiling', 'tear', 'sad', 'happy'] },
      { emoji: '😋', keywords: ['yum', 'delicious', 'tasty'] },
      { emoji: '😛', keywords: ['tongue', 'silly'] },
      { emoji: '😜', keywords: ['winking', 'tongue', 'silly'] },
      { emoji: '🤪', keywords: ['zany', 'crazy', 'silly'] },
      { emoji: '😌', keywords: ['relieved', 'calm', 'peaceful'] },
      { emoji: '😔', keywords: ['pensive', 'sad', 'thoughtful'] },
      { emoji: '😑', keywords: ['expressionless', 'neutral'] },
      { emoji: '😐', keywords: ['neutral', 'face'] },
      { emoji: '😏', keywords: ['smirking', 'smug'] },
      { emoji: '🥱', keywords: ['yawning', 'tired', 'sleepy'] },
    ],
  },
  hearts: {
    name: 'Hearts',
    icon: Heart,
    emojis: [
      { emoji: '❤️', keywords: ['red', 'heart', 'love'] },
      { emoji: '🧡', keywords: ['orange', 'heart'] },
      { emoji: '💛', keywords: ['yellow', 'heart'] },
      { emoji: '💚', keywords: ['green', 'heart'] },
      { emoji: '💙', keywords: ['blue', 'heart'] },
      { emoji: '💜', keywords: ['purple', 'heart'] },
      { emoji: '🖤', keywords: ['black', 'heart'] },
      { emoji: '🤍', keywords: ['white', 'heart'] },
      { emoji: '🤎', keywords: ['brown', 'heart'] },
      { emoji: '💔', keywords: ['broken', 'heart', 'sad'] },
      { emoji: '💕', keywords: ['two', 'hearts', 'love'] },
      { emoji: '💞', keywords: ['revolving', 'hearts'] },
      { emoji: '💓', keywords: ['beating', 'heart', 'pulse'] },
      { emoji: '💗', keywords: ['growing', 'heart'] },
      { emoji: '💖', keywords: ['sparkling', 'heart'] },
      { emoji: '💘', keywords: ['cupid', 'arrow', 'love'] },
      { emoji: '💝', keywords: ['gift', 'heart', 'present'] },
      { emoji: '💟', keywords: ['heart', 'decoration'] },
    ],
  },
  thumbs: {
    name: 'Hands',
    icon: ThumbsUp,
    emojis: [
      { emoji: '👍', keywords: ['thumbs', 'up', 'like', 'good', 'yes'] },
      { emoji: '👎', keywords: ['thumbs', 'down', 'dislike', 'no'] },
      { emoji: '👏', keywords: ['clapping', 'hands', 'applause'] },
      { emoji: '🙌', keywords: ['raising', 'hands', 'celebration'] },
      { emoji: '👐', keywords: ['open', 'hands'] },
      { emoji: '🤲', keywords: ['palms', 'together', 'pray'] },
      { emoji: '🤝', keywords: ['handshake', 'deal', 'agreement'] },
      { emoji: '🤜', keywords: ['fist', 'bump', 'punch'] },
      { emoji: '🤛', keywords: ['fist', 'bump', 'punch'] },
      { emoji: '✊', keywords: ['fist', 'power', 'strength'] },
      { emoji: '👊', keywords: ['oncoming', 'fist', 'punch'] },
      { emoji: '🤚', keywords: ['raised', 'back', 'hand'] },
      { emoji: '🖐️', keywords: ['hand', 'fingers', 'splayed'] },
      { emoji: '✋', keywords: ['raised', 'hand', 'stop'] },
      { emoji: '🖖', keywords: ['vulcan', 'salute', 'star trek'] },
      { emoji: '👌', keywords: ['ok', 'hand', 'perfect'] },
      { emoji: '🤌', keywords: ['pinched', 'fingers'] },
      { emoji: '🤞', keywords: ['crossed', 'fingers', 'luck'] },
      { emoji: '🫰', keywords: ['hand', 'index', 'thumb'] },
      { emoji: '🤟', keywords: ['love', 'you', 'gesture'] },
      { emoji: '🤘', keywords: ['rock', 'on', 'metal'] },
      { emoji: '🤙', keywords: ['call', 'me', 'hand'] },
    ],
  },
  laughing: {
    name: 'Emotion',
    icon: Laugh,
    emojis: [
      { emoji: '😀', keywords: ['grinning', 'happy', 'smile'] },
      { emoji: '😂', keywords: ['tears', 'joy', 'laughing'] },
      { emoji: '😍', keywords: ['heart', 'eyes', 'love'] },
      { emoji: '🤩', keywords: ['star', 'struck', 'excited'] },
      { emoji: '😘', keywords: ['kiss', 'blowing', 'love'] },
      { emoji: '😜', keywords: ['winking', 'tongue', 'silly'] },
      { emoji: '🤣', keywords: ['rolling', 'floor', 'laughing'] },
      { emoji: '😅', keywords: ['sweat', 'smile', 'relieved'] },
      { emoji: '😆', keywords: ['squinting', 'laughing'] },
      { emoji: '😉', keywords: ['winking', 'face'] },
      { emoji: '😊', keywords: ['smiling', 'eyes', 'blush'] },
      { emoji: '🥰', keywords: ['smiling', 'hearts', 'love'] },
      { emoji: '😗', keywords: ['kissing', 'face'] },
      { emoji: '😚', keywords: ['kissing', 'closed', 'eyes'] },
      { emoji: '😙', keywords: ['kissing', 'smiling', 'eyes'] },
      { emoji: '🤪', keywords: ['zany', 'crazy', 'silly'] },
      { emoji: '😌', keywords: ['relieved', 'calm'] },
      { emoji: '😔', keywords: ['pensive', 'sad'] },
      { emoji: '😢', keywords: ['crying', 'sad', 'tears'] },
      { emoji: '😭', keywords: ['loudly', 'crying', 'sob'] },
      { emoji: '😤', keywords: ['huffing', 'angry', 'proud'] },
      { emoji: '😠', keywords: ['angry', 'mad', 'annoyed'] },
      { emoji: '😡', keywords: ['pouting', 'angry', 'furious'] },
      { emoji: '🤬', keywords: ['swearing', 'angry', 'cursing'] },
      { emoji: '😈', keywords: ['smiling', 'devil', 'evil'] },
    ],
  },
  fire: {
    name: 'Popular',
    icon: Flame,
    emojis: [
      { emoji: '🔥', keywords: ['fire', 'flame', 'hot'] },
      { emoji: '✨', keywords: ['sparkles', 'star', 'magic'] },
      { emoji: '⭐', keywords: ['star', 'favorite'] },
      { emoji: '💫', keywords: ['dizzy', 'star', 'sparkle'] },
      { emoji: '🎉', keywords: ['party', 'popper', 'celebration'] },
      { emoji: '🎊', keywords: ['confetti', 'ball', 'celebration'] },
      { emoji: '🎈', keywords: ['balloon', 'party', 'birthday'] },
      { emoji: '🎁', keywords: ['gift', 'present', 'wrapped'] },
      { emoji: '🏆', keywords: ['trophy', 'winner', 'award'] },
      { emoji: '👑', keywords: ['crown', 'king', 'queen'] },
      { emoji: '💯', keywords: ['hundred', 'points', 'perfect'] },
      { emoji: '💥', keywords: ['collision', 'explosion', 'boom'] },
      { emoji: '🚀', keywords: ['rocket', 'launch', 'space'] },
      { emoji: '⚡', keywords: ['lightning', 'bolt', 'electric'] },
      { emoji: '🌟', keywords: ['glowing', 'star', 'bright'] },
      { emoji: '💎', keywords: ['diamond', 'gem', 'jewel'] },
      { emoji: '🎯', keywords: ['target', 'dart', 'bullseye'] },
      { emoji: '🎪', keywords: ['circus', 'tent', 'entertainment'] },
      { emoji: '🎭', keywords: ['theater', 'masks', 'drama'] },
      { emoji: '🎨', keywords: ['artist', 'palette', 'art'] },
      { emoji: '🎬', keywords: ['movie', 'camera', 'film'] },
      { emoji: '🎤', keywords: ['microphone', 'sing', 'karaoke'] },
      { emoji: '🎧', keywords: ['headphone', 'music', 'listen'] },
      { emoji: '🎮', keywords: ['video', 'game', 'controller'] },
      { emoji: '🎲', keywords: ['dice', 'game', 'random'] },
    ],
  },
  animals: {
    name: 'Animals',
    icon: Zap,
    emojis: [
      { emoji: '🐶', keywords: ['dog', 'face', 'pet'] },
      { emoji: '🐱', keywords: ['cat', 'face', 'pet'] },
      { emoji: '🐭', keywords: ['mouse', 'face', 'rodent'] },
      { emoji: '🐹', keywords: ['hamster', 'pet', 'cute'] },
      { emoji: '🐰', keywords: ['rabbit', 'bunny', 'face'] },
      { emoji: '🦊', keywords: ['fox', 'face', 'cunning'] },
      { emoji: '🐻', keywords: ['bear', 'face'] },
      { emoji: '🐼', keywords: ['panda', 'face', 'cute'] },
      { emoji: '🐨', keywords: ['koala', 'australia'] },
      { emoji: '🐯', keywords: ['tiger', 'face', 'stripes'] },
      { emoji: '🦁', keywords: ['lion', 'face', 'king'] },
      { emoji: '🐮', keywords: ['cow', 'face', 'moo'] },
      { emoji: '🐷', keywords: ['pig', 'face', 'oink'] },
      { emoji: '🐸', keywords: ['frog', 'face', 'green'] },
      { emoji: '🐵', keywords: ['monkey', 'face', 'ape'] },
      { emoji: '🐔', keywords: ['chicken', 'rooster', 'bird'] },
      { emoji: '🐧', keywords: ['penguin', 'antarctica', 'bird'] },
      { emoji: '🐦', keywords: ['bird', 'flying'] },
      { emoji: '🐤', keywords: ['baby', 'chick', 'bird'] },
      { emoji: '🦆', keywords: ['duck', 'bird', 'quack'] },
      { emoji: '🦅', keywords: ['eagle', 'bird', 'flying'] },
      { emoji: '🦉', keywords: ['owl', 'bird', 'wise'] },
      { emoji: '🦇', keywords: ['bat', 'vampire', 'night'] },
      { emoji: '🐺', keywords: ['wolf', 'face', 'wild'] },
      { emoji: '🐗', keywords: ['boar', 'pig', 'wild'] },
    ],
  },
};

export default function EmojiPicker({ onSelect }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('smileys');

  const filteredEmojis = useMemo(() => {
    if (!searchQuery) {
      return EMOJI_CATEGORIES[activeCategory]?.emojis || [];
    }

    // ✅ Enhanced search - search through keywords
    const query = searchQuery.toLowerCase().trim();
    return Object.values(EMOJI_CATEGORIES)
      .flatMap((cat) => cat.emojis)
      .filter((item) => {
        // Search in keywords
        const keywordMatch = item.keywords.some(keyword => 
          keyword.toLowerCase().includes(query)
        );
        // Also check if query matches emoji character (for direct emoji search)
        return keywordMatch || item.emoji.includes(query);
      });
  }, [searchQuery, activeCategory]);

  return (
    <div className="w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
      {/* Search */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <Input
          placeholder="Search emojis..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8"
        />
      </div>

      {/* Categories & Emojis */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        {/* Tab list */}
        <div className="px-3 pt-3">
          <TabsList className="grid w-full grid-cols-6 bg-gray-100 dark:bg-gray-700 h-8">
            {Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => {
              const Icon = cat.icon;
              return (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="h-6 p-0 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-600 cursor-pointer"
                >
                  <Icon className="h-4 w-4" />
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Emoji grid */}
        <div className="px-3 py-3 max-h-64 overflow-y-auto">
          {searchQuery ? (
            <div className="grid grid-cols-8 gap-1">
              {filteredEmojis.map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onSelect(item.emoji);
                    // ✅ Don't clear search - allow selecting multiple emojis
                    // setSearchQuery('');
                  }}
                  className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1 transition-colors cursor-pointer"
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          ) : (
            Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => (
              <TabsContent key={key} value={key} className="m-0">
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => onSelect(item.emoji)}
                      className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1 transition-colors cursor-pointer"
                    >
                      {item.emoji}
                    </button>
                  ))}
                </div>
              </TabsContent>
            ))
          )}
        </div>
      </Tabs>
    </div>
  );
}