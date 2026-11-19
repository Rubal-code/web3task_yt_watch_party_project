/**
 * ChatPanel: Real-time group chat for the watch party room.
 *
 * Receives messages as props from Room.tsx (which owns the WebSocket).
 * Sends messages via the onSend callback (also from Room.tsx).
 *
 * Features:
 * - Message bubbles: own messages right-aligned (blue), others left-aligned (gray)
 * - Username + timestamp display on each message
 * - Auto-scroll to latest message
 * - Enter to send, Shift+Enter for newline
 * - Empty message prevention (client-side)
 * - 500-character limit with counter
 * - Connection status indicator
 * - Disabled input when disconnected
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageCircle, Wifi, WifiOff } from 'lucide-react';
import type { ChatMessage } from '@/lib/types';

const MAX_MESSAGE_LENGTH = 500;

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (message: string) => void;
  username: string;
  isConnected: boolean;
}

export function ChatPanel({ messages, onSend, username, isConnected }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to the latest message whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const handleSend = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || !isConnected) return;
      onSend(trimmed);
      setInput('');
      textareaRef.current?.focus();
    },
    [input, isConnected, onSend]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value.slice(0, MAX_MESSAGE_LENGTH));
  };

  const charCount = input.length;
  const isNearLimit = charCount > MAX_MESSAGE_LENGTH - 50;
  const canSend = input.trim().length > 0 && isConnected;

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Chat</h2>
          {messages.length > 0 && (
            <span className="text-xs bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">
              {messages.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <>
              <Wifi size={13} className="text-green-400" />
              <span className="text-xs text-green-400">Live</span>
            </>
          ) : (
            <>
              <WifiOff size={13} className="text-red-400" />
              <span className="text-xs text-red-400">Offline</span>
            </>
          )}
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <MessageCircle size={32} className="text-gray-600 mb-2" />
            <p className="text-xs text-gray-500">
              No messages yet.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              Say hello to everyone!
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.messageId}
            className={`flex flex-col ${m.isOwn ? 'items-end' : 'items-start'}`}
          >
            {/* Username label (shown above message for others) */}
            {!m.isOwn && (
              <span className="text-xs text-gray-400 font-medium mb-0.5 px-1">
                {m.username}
              </span>
            )}

            {/* Message bubble */}
            <div
              className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm break-words leading-relaxed ${
                m.isOwn
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-700 text-gray-100 rounded-bl-sm'
              }`}
            >
              {m.message}
            </div>

            {/* Timestamp */}
            <span className="text-xs text-gray-500 mt-0.5 px-1">
              {m.isOwn ? `You · ${formatTime(m.timestamp)}` : formatTime(m.timestamp)}
            </span>
          </div>
        ))}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 p-3 border-t border-gray-700">
        <form onSubmit={handleSend}>
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isConnected
                  ? 'Type a message… (Enter to send)'
                  : 'Reconnecting to room…'
              }
              disabled={!isConnected}
              rows={2}
              className="w-full px-3 py-2.5 pr-10 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm
                         focus:outline-none focus:border-blue-500 transition resize-none
                         disabled:opacity-50 disabled:cursor-not-allowed placeholder-gray-500"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="absolute right-2.5 bottom-2.5 text-blue-400 hover:text-blue-300
                         disabled:text-gray-600 transition"
              title="Send message"
            >
              <Send size={16} />
            </button>
          </div>

          {/* Character count warning */}
          {isNearLimit && (
            <p
              className={`text-xs mt-1 text-right ${
                charCount >= MAX_MESSAGE_LENGTH ? 'text-red-400' : 'text-yellow-400'
              }`}
            >
              {charCount}/{MAX_MESSAGE_LENGTH}
            </p>
          )}

          {/* Hint text */}
          <p className="text-xs text-gray-600 mt-1">
            Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
