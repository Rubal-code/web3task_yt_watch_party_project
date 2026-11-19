/**
 * VideoPlayer: YouTube IFrame Player with full synchronization support.
 *
 * Loads the YouTube IFrame API once (singleton promise) then creates
 * one player per mounted instance. Synchronizes play/pause/seek when
 * props change WITHOUT creating events that re-trigger WebSocket sends
 * (participants are receivers only, not senders of playback events).
 *
 * Key design decisions:
 * - playerReady ref prevents applying commands before the player is ready
 * - isSeekingRef prevents seek feedback loops
 * - API is loaded once and shared across remounts via module-level promise
 * - Player is recreated when videoId changes (safest approach for YT IFrame API)
 * - Player is properly destroyed on unmount
 */

import { useEffect, useRef, useState } from 'react';


interface VideoPlayerProps {
  videoId: string | null;
  playState: 'playing' | 'paused';
  currentTime: number;
  onReady: (player: YT.Player) => void;
  onStateChange: (event: YT.OnStateChangeEvent) => void;
  onPlaybackRateChange: (event: YT.OnPlaybackRateChangeEvent) => void;
  onError: (event: YT.OnErrorEvent) => void;
}

// Module-level singleton so we never load the YouTube script twice
let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previousCallback = (window as any).onYouTubeIframeAPIReady;

      (window as any).onYouTubeIframeAPIReady = () => {
        previousCallback?.();
        resolve();
      };

      // Avoid injecting the script more than once
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );

      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = () => {
          youtubeApiPromise = null;
          reject(new Error('Failed to load YouTube IFrame API'));
        };
        document.head.appendChild(script);
      }
    });
  }

  return youtubeApiPromise;
}

export function VideoPlayer({
  videoId,
  playState,
  currentTime,
  onReady,
  onStateChange,
  onPlaybackRateChange,
  onError,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const playerReadyRef = useRef(false);  // Set to true when YT player fires onReady
  const isSeekingRef = useRef(false);    // Prevents seek feedback loops

  // Keep callbacks stable so effects don't re-run on every render
  const callbacksRef = useRef({ onReady, onStateChange, onPlaybackRateChange, onError });
  callbacksRef.current = { onReady, onStateChange, onPlaybackRateChange, onError };

  const [isApiReady, setIsApiReady] = useState(false);

  // ----------------------------------------------------------------
  // Load YouTube IFrame API (once per page)
  // ----------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    loadYouTubeAPI()
      .then(() => {
        if (!cancelled) setIsApiReady(true);
      })
      .catch((err) => {
        console.error('YouTube API loading failed:', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ----------------------------------------------------------------
  // Create / destroy player when API ready and videoId changes
  // ----------------------------------------------------------------
  useEffect(() => {
    if (!isApiReady || !containerRef.current || !videoId) return;

    console.log('[VideoPlayer] Initializing player for video:', videoId);
    playerReadyRef.current = false;

    // Create a fresh div inside the container for the YT player to replace.
    // This avoids the YT SDK complaining that the element is already a player.
    const mountPoint = document.createElement('div');
    containerRef.current.appendChild(mountPoint);

    const player = new window.YT.Player(mountPoint, {
      height: '100%',
      width: '100%',
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
        fs: 1,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          console.log('[VideoPlayer] Player ready');
          playerReadyRef.current = true;
          playerRef.current = event.target;
          callbacksRef.current.onReady(event.target);
        },
        onStateChange: (event) => {
          callbacksRef.current.onStateChange(event);
        },
        onPlaybackRateChange: (event) => {
          callbacksRef.current.onPlaybackRateChange(event);
        },
        onError: (event) => {
          console.error('[VideoPlayer] Error code:', event.data);
          callbacksRef.current.onError(event);
        },
      },
    });

    playerRef.current = player;

    return () => {
      console.log('[VideoPlayer] Destroying player');
      playerReadyRef.current = false;
      playerRef.current = null;

      try {
        player.destroy();
      } catch (err) {
        console.warn('[VideoPlayer] Cleanup error (safe to ignore):', err);
      }

      // The YT SDK replaces mountPoint with an iframe; remove whatever is left
      if (containerRef.current && mountPoint.parentNode === containerRef.current) {
        containerRef.current.removeChild(mountPoint);
      }
    };
  }, [isApiReady, videoId]);

  // ----------------------------------------------------------------
  // Synchronize play / pause
  // ----------------------------------------------------------------
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReadyRef.current || !videoId) return;

    try {
      const state = player.getPlayerState();

      if (playState === 'playing') {
        if (
          state !== YT.PlayerState.PLAYING &&
          state !== YT.PlayerState.BUFFERING
        ) {
          player.playVideo();
        }
      } else if (playState === 'paused') {
        if (
          state === YT.PlayerState.PLAYING ||
          state === YT.PlayerState.BUFFERING
        ) {
          player.pauseVideo();
        }
      }
    } catch (err) {
      console.warn('[VideoPlayer] Play/pause sync error:', err);
    }
  }, [playState, videoId, isApiReady]);

  // ----------------------------------------------------------------
  // Synchronize seek position
  // ----------------------------------------------------------------
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !playerReadyRef.current || !videoId || isSeekingRef.current) return;

    try {
      const state = player.getPlayerState();

      // Don't seek when video hasn't started or just ended
      if (
        state === YT.PlayerState.UNSTARTED ||
        state === YT.PlayerState.ENDED ||
        state === YT.PlayerState.CUED
      ) {
        return;
      }

      const playerTime = player.getCurrentTime();
      const diff = Math.abs(playerTime - currentTime);

      // Only seek if drift is significant (> 1.5s) to avoid jitter
      if (diff > 1.5) {
        isSeekingRef.current = true;
        player.seekTo(currentTime, true);

        window.setTimeout(() => {
          isSeekingRef.current = false;
        }, 500);
      }
    } catch (err) {
      console.warn('[VideoPlayer] Seek sync error:', err);
    }
  }, [currentTime, videoId, isApiReady]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-black rounded-xl overflow-hidden relative"
    >
      {!videoId && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 select-none">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-gray-500">▶</span>
          </div>
          <p className="text-sm font-medium text-gray-500">No video loaded</p>
          <p className="text-xs text-gray-600 mt-1">
            Waiting for the host to select a video
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * useVideoPlayerActions: Exposes imperative player controls.
 *
 * Room.tsx keeps a ref to the player via setPlayerRef (called in onReady).
 * The send hook uses getPlayerTime() to include accurate time in play/pause events.
 */
export function useVideoPlayerActions() {
  const playerRef = useRef<YT.Player | null>(null);

  return {
    setPlayerRef: (ref: YT.Player | null) => {
      playerRef.current = ref;
    },
    play: () => {
      try {
        playerRef.current?.playVideo();
      } catch {}
    },
    pause: () => {
      try {
        playerRef.current?.pauseVideo();
      } catch {}
    },
    seekTo: (seconds: number) => {
      try {
        playerRef.current?.seekTo(seconds, true);
      } catch {}
    },
    loadVideoById: (videoId: string) => {
      try {
        playerRef.current?.loadVideoById(videoId);
      } catch {}
    },
    getCurrentTime: (): number | undefined => {
      try {
        return playerRef.current?.getCurrentTime();
      } catch {
        return undefined;
      }
    },
    getPlayerState: (): number | undefined => {
      try {
        return playerRef.current?.getPlayerState();
      } catch {
        return undefined;
      }
    },
  };
}
