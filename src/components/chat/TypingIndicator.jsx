// src/components/chat/TypingIndicator.jsx
'use client';

export default function TypingIndicator({ isTyping = false }) {
  if (!isTyping) return null;

  return (
    <div className="flex items-center gap-2 text-gray-500">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-sm">Typing...</span>
    </div>
  );
}