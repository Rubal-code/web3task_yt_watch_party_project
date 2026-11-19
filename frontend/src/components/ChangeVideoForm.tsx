/**
 * ChangeVideoForm: Modal for host/moderator to change the YouTube video.
 *
 * Receives a `send` function from Room.tsx — does NOT create its own WebSocket.
 * Validates and extracts the YouTube video ID before sending change_video.
 *
 * Supported URL formats:
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *   - https://www.youtube.com/embed/VIDEO_ID
 *   - Raw 11-character video ID
 */

import { useState } from 'react';
import { Send, Search, X, Loader2 } from 'lucide-react';
import type { Role, ClientEvent } from '@/lib/types';
import { extractVideoId } from '@/lib/youtube';
import { toast } from '@/lib/toast';

interface ChangeVideoFormProps {
  role: Role;
  roomId: string;
  currentVideoId: string | null;
  isOpen: boolean;
  onClose: () => void;
  send: (event: ClientEvent) => void;
}

export function ChangeVideoForm({
  role,
  currentVideoId,
  isOpen,
  onClose,
  send,
}: ChangeVideoFormProps) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const canControl = role === 'HOST' || role === 'MODERATOR';

  const validateAndPreview = (value: string) => {
    setUrl(value);
    if (!value.trim()) {
      setValidationError(null);
      return;
    }
    const id = extractVideoId(value.trim());
    if (!id) {
      setValidationError('Not a valid YouTube URL or video ID');
    } else {
      setValidationError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canControl || loading) return;

    const videoId = extractVideoId(url.trim());
    if (!videoId) {
      setValidationError('Invalid YouTube URL or video ID');
      toast.error('Invalid YouTube URL or video ID');
      return;
    }

    if (videoId === currentVideoId) {
      toast.info('This video is already playing');
      handleClose();
      return;
    }

    setLoading(true);
    try {
      send({ event: 'change_video', payload: { videoId } });
      toast.success('Video changed');
      handleClose();
    } catch {
      toast.error('Failed to change video');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setValidationError(null);
    setLoading(false);
    onClose();
  };

  if (!isOpen) return null;

  const previewVideoId = url.trim() ? extractVideoId(url.trim()) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Change Video</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Paste a YouTube URL or video ID
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1.5">
              <Search size={14} />
              <span>YouTube URL or 11-character video ID</span>
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => validateAndPreview(e.target.value)}
              placeholder="https://youtu.be/dQw4w9WgXcQ"
              className={`w-full px-4 py-3 rounded-xl bg-gray-800 border text-white text-sm
                          focus:outline-none transition ${
                            validationError
                              ? 'border-red-500 focus:border-red-400'
                              : 'border-gray-600 focus:border-blue-500'
                          }`}
              autoFocus
              disabled={loading || !canControl}
            />
            {validationError && (
              <p className="text-xs text-red-400 mt-1">{validationError}</p>
            )}
          </div>

          {/* Thumbnail preview */}
          {previewVideoId && !validationError && (
            <div className="rounded-xl overflow-hidden bg-gray-800 border border-gray-700">
              <img
                src={`https://img.youtube.com/vi/${previewVideoId}/mqdefault.jpg`}
                alt="Video thumbnail"
                className="w-full h-32 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="px-3 py-2">
                <p className="text-xs text-gray-400">
                  Video ID: <span className="text-white font-mono">{previewVideoId}</span>
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-sm transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canControl || !url.trim() || !!validationError || loading}
              className="flex-1 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium
                         transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Changing…
                </>
              ) : (
                <>
                  <Send size={16} />
                  Change Video
                </>
              )}
            </button>
          </div>

          {!canControl && (
            <p className="text-xs text-gray-500 text-center">
              Only the Host or Moderator can change the video.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
