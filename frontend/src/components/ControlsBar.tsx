/**
 * ControlsBar: Play / pause / seek controls for the watch party.
 *
 * HOST and MODERATOR can control playback.
 * PARTICIPANT can only view the current state (controls are disabled).
 *
 * Receives a `send` function and `getPlayerTime` from Room.tsx.
 * Does NOT create its own WebSocket.
 *
 * When the host plays or pauses, the current player time is included
 * in the payload so the backend can keep currentTime in sync.
 */

import { useCallback } from 'react';
import { Play, Pause, Volume2, Maximize, VolumeX, SkipForward, SkipBack } from 'lucide-react';
import type { Role, ClientEvent } from '@/lib/types';

interface ControlsBarProps {
  role: Role;
  playState: 'playing' | 'paused';
  currentTime: number;
  duration: number;
  videoId: string | null;
  roomId: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  send: (event: ClientEvent) => void;
  /** Returns the actual player current time for accurate time sync */
  getPlayerTime?: () => number | undefined;
}

export function ControlsBar({
  role,
  playState,
  currentTime,
  duration,
  videoId,
  isMuted,
  onToggleMute,
  onToggleFullscreen,
  send,
  getPlayerTime,
}: ControlsBarProps) {
  const canControl = role === 'HOST' || role === 'MODERATOR';

  const handlePlayPause = useCallback(() => {
    if (!canControl) return;
    // Include the actual player time for authoritative time sync on backend
    const time = getPlayerTime?.() ?? currentTime;
    send({
      event: playState === 'playing' ? 'pause' : 'play',
      payload: { time },
    });
  }, [send, canControl, playState, currentTime, getPlayerTime]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!canControl) return;
      const time = Number(e.target.value);
      send({ event: 'seek', payload: { time } });
    },
    [send, canControl]
  );

  const handleSkip = useCallback(
    (seconds: number) => {
      if (!canControl) return;
      const time = Math.max(0, (getPlayerTime?.() ?? currentTime) + seconds);
      send({ event: 'seek', payload: { time } });
    },
    [send, canControl, currentTime, getPlayerTime]
  );

  return (
    <div className="bg-gray-900 border-t border-gray-700 p-4 flex flex-col gap-3 flex-shrink-0">
      {/* Row 1: Play/Pause + Skip + Volume + Fullscreen */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {/* Skip back 10s */}
          <button
            onClick={() => handleSkip(-10)}
            disabled={!canControl || !videoId}
            className="w-8 h-8 rounded-lg bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Skip back 10s"
          >
            <SkipBack size={16} />
          </button>

          {/* Play / Pause */}
          <button
            onClick={handlePlayPause}
            disabled={!canControl || !videoId}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-sm font-medium transition ${
              !canControl || !videoId
                ? 'opacity-40 cursor-not-allowed bg-gray-700'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
            title={!canControl ? 'Only Host/Moderator can control playback' : ''}
          >
            {playState === 'playing' ? <Pause size={18} /> : <Play size={18} />}
            <span>{playState === 'playing' ? 'Pause' : 'Play'}</span>
          </button>

          {/* Skip forward 10s */}
          <button
            onClick={() => handleSkip(10)}
            disabled={!canControl || !videoId}
            className="w-8 h-8 rounded-lg bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Skip forward 10s"
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* Volume + Fullscreen */}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMute}
            className="w-8 h-8 rounded-lg bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            onClick={onToggleFullscreen}
            className="w-8 h-8 rounded-lg bg-gray-700 text-white flex items-center justify-center hover:bg-gray-600 transition"
            title="Toggle fullscreen"
          >
            <Maximize size={16} />
          </button>
        </div>
      </div>

      {/* Row 2: Seek scrubber */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 w-10 text-right tabular-nums">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={duration > 0 ? duration : 100}
          value={currentTime}
          onChange={handleSeek}
          disabled={!canControl || !videoId}
          className={`flex-1 h-1.5 rounded-lg appearance-none cursor-pointer accent-blue-500 bg-gray-700 ${
            !canControl ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        />
        <span className="text-xs text-gray-400 w-10 tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      {/* Participant viewer notice */}
      {!canControl && videoId && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2">
          <span className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-400 font-medium">
            VIEWER
          </span>
          <span>Playback is controlled by the host.</span>
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
