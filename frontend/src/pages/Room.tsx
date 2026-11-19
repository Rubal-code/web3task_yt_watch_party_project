/**
 * Room page: Main watch party view.
 *
 * This component is the single source of truth for:
 * - WebSocket connection (via useWatchSocket)
 * - Room state: role, participants, playback state, video ID
 * - Chat messages (received from server and sent via WebSocket)
 *
 * Architecture:
 * - ONE WebSocket connection per Room mount
 * - All child components receive a `send` prop instead of creating their own sockets
 * - Chat messages are managed here and passed down to ChatPanel
 * - Playback state is managed here and passed to VideoPlayer + ControlsBar
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Link, Copy, Wifi, WifiOff, Crown, Users, MessageSquare, Play, Video } from 'lucide-react';
import { useVideoPlayerActions, VideoPlayer } from '@/components/VideoPlayer';
import { ControlsBar } from '@/components/ControlsBar';
import { ParticipantList } from '@/components/ParticipantList';
import { ChangeVideoForm } from '@/components/ChangeVideoForm';
import { ChatPanel } from '@/components/ChatPanel';
import { useWatchSocket } from '@/hooks/useWatchSocket';
import type { Role, ServerEvent, Participant, ChatMessage } from '@/lib/types';
import { extractVideoId } from '@/lib/youtube';
import { toast } from '@/lib/toast';

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // User identity: check sessionStorage first (isolated per tab), then localStorage
  const [username, setUsername] = useState<string>(() => {
    return (
      sessionStorage.getItem('wp_username') ||
      localStorage.getItem('wp_username') ||
      ''
    );
  });

  const [nameModalOpen, setNameModalOpen] = useState<boolean>(() => {
    const existing =
      sessionStorage.getItem('wp_username') ||
      localStorage.getItem('wp_username');
    return !existing;
  });

  const [nameInput, setNameInput] = useState('');
  const [quickUrl, setQuickUrl] = useState('');

  const hostToken = sessionStorage.getItem('wp_hostToken') || undefined;

  // ----------------------------------------------------------------
  // Room state
  // ----------------------------------------------------------------
  const [role, setRole] = useState<Role>('PARTICIPANT');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [playState, setPlayState] = useState<'playing' | 'paused'>('paused');
  const [currentTime, setCurrentTime] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [isRemoved, setIsRemoved] = useState(false);
  const [changeVideoOpen, setChangeVideoOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'participants' | 'chat'>('chat');
  const [isMuted, setIsMuted] = useState(false);

  const playerActions = useVideoPlayerActions();

  // ----------------------------------------------------------------
  // Server event handler
  // ----------------------------------------------------------------
  const handleServerEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.event) {
        case 'user_joined': {
          setParticipants(event.payload.participants);
          // Update our own role if we joined or our role is listed
          const me = event.payload.participants.find((p) => p.userId === username);
          if (me) setRole(me.role);
          if (event.payload.userId !== username) {
            toast.info(`${event.payload.username} joined the party`);
          }
          break;
        }

        case 'user_left':
          setParticipants(event.payload.participants);
          toast.info(`${event.payload.username} left`);
          break;

        case 'sync_state':
          // Authoritative state from backend — apply unconditionally
          setPlayState(event.payload.playState);
          setCurrentTime(event.payload.currentTime);
          setVideoId(event.payload.videoId ?? null);
          break;

        case 'role_assigned': {
          setParticipants(event.payload.participants);
          const isMe = event.payload.userId === username;
          if (isMe) {
            setRole(event.payload.role);
            toast.info(`Your role is now ${event.payload.role}`);
          } else {
            const target = event.payload.participants.find(
              (p) => p.userId === event.payload.userId
            );
            toast.info(`${target?.username ?? 'Participant'}'s role changed to ${event.payload.role}`);
          }
          break;
        }

        case 'participant_removed':
          setParticipants(event.payload.participants);
          if (event.payload.userId === username) {
            setIsRemoved(true);
          } else {
            toast.info('A participant was removed from the room');
          }
          break;

        case 'chat_message': {
          const isOwn = event.payload.userId === username;
          setChatMessages((prev) => [
            ...prev,
            {
              messageId: event.payload.messageId,
              userId: event.payload.userId,
              username: event.payload.username,
              message: event.payload.message,
              timestamp: event.payload.timestamp,
              isOwn,
            },
          ]);
          // Auto-switch to chat tab when a message arrives from someone else
          if (!isOwn) {
            setSidebarTab('chat');
          }
          break;
        }

        case 'error':
          toast.error(event.payload.message || 'An error occurred');
          break;
      }
    },
    [username]
  );

  // ----------------------------------------------------------------
  // WebSocket connection (single connection for the entire room)
  // ----------------------------------------------------------------
  const { send, isConnected } = useWatchSocket({
    roomId: roomId!,
    username: username || 'Guest',
    hostToken,
    onEvent: handleServerEvent,
    onConnect: () => {
      console.log('[Room] WebSocket connected as:', username);
    },
    onDisconnect: () => {
      toast.warning('Disconnected from room. Reconnecting…');
    },
    enabled: Boolean(roomId && username),
  });

  // ----------------------------------------------------------------
  // Handle join name submission (for direct link visitors)
  // ----------------------------------------------------------------
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = nameInput.trim();
    if (!clean) {
      toast.error('Please enter your name');
      return;
    }
    sessionStorage.setItem('wp_username', clean);
    localStorage.setItem('wp_username', clean);
    setUsername(clean);
    setNameModalOpen(false);
  };

  // ----------------------------------------------------------------
  // Redirect if removed from room
  // ----------------------------------------------------------------
  useEffect(() => {
    if (isRemoved) {
      toast.error('You have been removed from this room.');
      navigate('/');
    }
  }, [isRemoved, navigate]);

  // ----------------------------------------------------------------
  // Chat send handler
  // ----------------------------------------------------------------
  const handleSendChat = useCallback(
    (message: string) => {
      send({ event: 'chat_message', payload: { message } });
    },
    [send]
  );

  // ----------------------------------------------------------------
  // Quick video load from inline input
  // ----------------------------------------------------------------
  const handleQuickVideoLoad = (e: React.FormEvent) => {
    e.preventDefault();
    const vid = extractVideoId(quickUrl.trim());
    if (!vid) {
      toast.error('Invalid YouTube URL or Video ID');
      return;
    }
    send({ event: 'change_video', payload: { videoId: vid } });
    setQuickUrl('');
    toast.success('Video loaded!');
  };

  // ----------------------------------------------------------------
  // Copy room link
  // ----------------------------------------------------------------
  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Room link copied! Share with friends to watch together.'))
      .catch(() => toast.error('Failed to copy link'));
  }, [roomId]);

  // ----------------------------------------------------------------
  // Removed screen
  // ----------------------------------------------------------------
  if (isRemoved) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Removed from Room</h1>
          <p className="text-gray-400 mb-6">You have been removed from this watch party.</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-medium transition"
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const canControl = role === 'HOST' || role === 'MODERATOR';
  const isHost = role === 'HOST';
  const unreadChat = sidebarTab !== 'chat' ? chatMessages.length : 0;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col h-screen overflow-hidden">
      {/* ============================================================
          Name Prompt Modal (For users joining via direct link)
      ============================================================ */}
      {nameModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <div className="w-12 h-12 bg-red-600/20 border border-red-500/30 rounded-xl flex items-center justify-center mx-auto text-red-500 mb-2">
                <Play size={24} fill="currentColor" />
              </div>
              <h2 className="text-lg font-bold text-white">Join Watch Party</h2>
              <p className="text-xs text-gray-400">
                Enter your display name to join this room
              </p>
            </div>
            <form onSubmit={handleNameSubmit} className="space-y-3">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your name (e.g. Bob)"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-blue-500 transition"
              />
              <button
                type="submit"
                disabled={!nameInput.trim()}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-sm transition"
              >
                Join Room
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          Header
      ============================================================ */}
      <header className="bg-gray-900 border-b border-gray-700 px-4 py-2.5 flex items-center justify-between flex-shrink-0 z-20">
        {/* Left: Brand + room info */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-base flex-shrink-0 shadow-md shadow-red-900/40">
            <Play size={16} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">YouTube Watch Party</h1>
            <p className="text-xs text-gray-500 leading-tight">
              Room <span className="text-gray-400 font-mono">{roomId?.slice(0, 8)}…</span>
            </p>
          </div>
        </div>

        {/* Right: Role badge + Add Video button + controls */}
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800/60 border border-gray-700/50">
            {isConnected ? (
              <Wifi size={13} className="text-green-400" />
            ) : (
              <WifiOff size={13} className="text-red-400" />
            )}
            <span
              className={`text-xs hidden sm:inline font-medium ${
                isConnected ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {isConnected ? 'Connected' : 'Reconnecting…'}
            </span>
          </div>

          {/* Role badge */}
          <div
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
              isHost
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : role === 'MODERATOR'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-gray-700/50 text-gray-400 border border-gray-600/30'
            }`}
          >
            {isHost && <Crown size={12} />}
            {role}
          </div>

          {/* Change Video / Add YouTube Video (Visible for Host/Mod) */}
          {canControl ? (
            <button
              onClick={() => setChangeVideoOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-red-900/30"
              title="Add or Change YouTube Video"
            >
              <Video size={14} />
              <span>{videoId ? 'Change Video' : '+ Add YouTube Video'}</span>
            </button>
          ) : (
            <span className="text-xs text-gray-500 bg-gray-800/80 px-2.5 py-1 rounded-lg border border-gray-700">
              👁 Viewer Mode
            </span>
          )}

          {/* Copy room invitation link */}
          <button
            onClick={handleCopyLink}
            className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium flex items-center gap-1.5 transition border border-gray-700"
            title="Copy invitation link"
          >
            <Copy size={13} />
            <span className="hidden sm:inline">Invite</span>
          </button>
        </div>
      </header>

      {/* ============================================================
          Main layout: Video + Sidebar
      ============================================================ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ---- Video column ---- */}
        <div className="flex-1 flex flex-col bg-black min-w-0 relative">
          {/* Player area */}
          <div className="flex-1 relative">
            <VideoPlayer
              videoId={videoId}
              playState={playState}
              currentTime={currentTime}
              onReady={(player) => {
                playerActions.setPlayerRef(player);
              }}
              onStateChange={() => {}}
              onPlaybackRateChange={() => {}}
              onError={(event) => {
                const codes: Record<number, string> = {
                  2: 'Invalid video ID',
                  5: 'HTML5 player error',
                  100: 'Video not found or removed',
                  101: 'Video not embeddable by owner',
                  150: 'Video not embeddable by owner',
                };
                const msg = codes[event.data] || `Player error (code ${event.data})`;
                toast.error(`YouTube: ${msg}`);
              }}
            />

            {/* Prominent Host Video Loader Overlay when NO video is loaded */}
            {!videoId && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-gray-900/90 via-black/95 to-black z-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center mb-4 text-red-500 shadow-xl shadow-red-900/30">
                  <Play size={32} fill="currentColor" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">
                  YouTube Watch Party
                </h2>
                <p className="text-xs text-gray-400 mb-6 max-w-sm">
                  {canControl
                    ? 'You are the host! Paste any YouTube video link below to start synchronized playback for everyone.'
                    : 'Waiting for the host to choose a video. Chat with everyone while you wait!'}
                </p>

                {canControl ? (
                  <form onSubmit={handleQuickVideoLoad} className="w-full max-w-md space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={quickUrl}
                        onChange={(e) => setQuickUrl(e.target.value)}
                        placeholder="Paste YouTube link (e.g. https://youtu.be/...)"
                        className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-red-500 transition placeholder-gray-500"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!quickUrl.trim()}
                        className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center gap-1.5 shadow-lg shadow-red-900/30"
                      >
                        <Play size={14} fill="currentColor" />
                        Play
                      </button>
                    </div>

                    {/* Quick demo links */}
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
                      <span className="text-gray-500">Quick samples:</span>
                      <button
                        type="button"
                        onClick={() => {
                          send({ event: 'change_video', payload: { videoId: 'jfKfPfyJRdk' } });
                          toast.success('Playing Lofi Beats');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition border border-gray-700"
                      >
                        Lofi Beats
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          send({ event: 'change_video', payload: { videoId: 'dQw4w9WgXcQ' } });
                          toast.success('Playing Rick Astley');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition border border-gray-700"
                      >
                        Never Gonna Give You Up
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-gray-800/80 border border-gray-700 rounded-xl px-4 py-3 max-w-xs text-xs text-gray-400">
                    Host controls video selection. You will automatically start watching when the host plays a video.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Now playing bar */}
          {videoId && (
            <div className="bg-gray-900/90 border-t border-gray-800 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400 font-medium">Now playing:</span>
                <a
                  href={`https://www.youtube.com/watch?v=${videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-400 hover:text-red-300 font-mono transition flex items-center gap-1"
                >
                  <span>YouTube ({videoId})</span>
                  <Link size={12} />
                </a>
              </div>
              <div className="flex items-center gap-2">
                {canControl && (
                  <button
                    onClick={() => setChangeVideoOpen(true)}
                    className="text-xs text-blue-400 hover:text-blue-300 underline font-medium"
                  >
                    Change Video
                  </button>
                )}
                <span className="text-xs text-gray-500">
                  {isHost ? '🎬 Host Mode' : '👁 Viewer Mode'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ---- Sidebar ---- */}
        <div className="w-72 xl:w-80 bg-gray-900 border-l border-gray-700 flex flex-col flex-shrink-0">
          {/* Tab headers */}
          <div className="flex border-b border-gray-700 flex-shrink-0">
            <button
              onClick={() => setSidebarTab('participants')}
              className={`flex-1 py-2.5 text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                sidebarTab === 'participants'
                  ? 'text-white border-b-2 border-blue-500 bg-gray-800/50'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
              }`}
            >
              <Users size={13} />
              People
              <span className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-300 ml-0.5">
                {participants.length}
              </span>
            </button>
            <button
              onClick={() => setSidebarTab('chat')}
              className={`flex-1 py-2.5 text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                sidebarTab === 'chat'
                  ? 'text-white border-b-2 border-blue-500 bg-gray-800/50'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
              }`}
            >
              <MessageSquare size={13} />
              Chat
              {unreadChat > 0 && (
                <span className="bg-blue-600 px-1.5 py-0.5 rounded text-white ml-0.5 animate-pulse">
                  {unreadChat}
                </span>
              )}
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden min-h-0">
            {sidebarTab === 'participants' ? (
              <ParticipantList
                role={role}
                userId={username}
                participants={participants}
                roomId={roomId!}
                send={send}
              />
            ) : (
              <ChatPanel
                messages={chatMessages}
                onSend={handleSendChat}
                username={username}
                isConnected={isConnected}
              />
            )}
          </div>

          {/* Playback ControlsBar always at the bottom */}
          <ControlsBar
            role={role}
            playState={playState}
            currentTime={currentTime}
            duration={0}
            videoId={videoId}
            roomId={roomId!}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted((m) => !m)}
            onToggleFullscreen={() => {
              const el = document.querySelector('.relative')!;
              if (document.fullscreenElement) {
                document.exitFullscreen();
              } else {
                el?.requestFullscreen?.();
              }
            }}
            send={send}
            getPlayerTime={playerActions.getCurrentTime}
          />
        </div>
      </div>

      {/* ============================================================
          Change Video Modal
      ============================================================ */}
      <ChangeVideoForm
        role={role}
        roomId={roomId!}
        currentVideoId={videoId}
        isOpen={changeVideoOpen}
        onClose={() => setChangeVideoOpen(false)}
        send={send}
      />
    </div>
  );
}
