/**
 * ParticipantList: Shows all participants with role badges.
 *
 * HOST can assign roles (MODERATOR/PARTICIPANT), remove participants,
 * and transfer the host role.
 *
 * Receives a `send` function from Room.tsx — does NOT create its own WebSocket.
 */

import { useState } from 'react';
import { ShieldCheck, UserMinus, Crown, Shuffle, MoreHorizontal, Circle } from 'lucide-react';
import type { Role, Participant, ClientEvent } from '@/lib/types';
import { toast } from '@/lib/toast';

const ROLE_COLORS: Record<Role, string> = {
  HOST: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  MODERATOR: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  PARTICIPANT: 'bg-gray-500/20 text-gray-400 border border-gray-600/30',
};

const ROLE_LABELS: Record<Role, string> = {
  HOST: 'Host',
  MODERATOR: 'Mod',
  PARTICIPANT: 'Viewer',
};

const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-purple-600',
  'bg-green-600',
  'bg-yellow-600',
  'bg-pink-600',
  'bg-indigo-600',
  'bg-red-600',
  'bg-orange-600',
];

function getAvatarColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface ParticipantListProps {
  role: Role;
  userId: string;
  participants: Participant[];
  roomId: string;
  send: (event: ClientEvent) => void;
}

export function ParticipantList({
  role,
  userId,
  participants,
  send,
}: ParticipantListProps) {
  const [assignMenu, setAssignMenu] = useState<string | null>(null);
  const isHost = role === 'HOST';

  const handleAssignRole = (targetUserId: string, newRole: 'MODERATOR' | 'PARTICIPANT') => {
    if (!isHost) return;
    send({ event: 'assign_role', payload: { userId: targetUserId, role: newRole } });
    setAssignMenu(null);
    toast.info(`Role updated`);
  };

  const handleRemoveParticipant = (targetUserId: string, targetUsername: string) => {
    if (!isHost) return;
    if (!window.confirm(`Remove ${targetUsername} from the room?`)) return;
    send({ event: 'remove_participant', payload: { userId: targetUserId } });
  };

  const handleTransferHost = (targetUserId: string, targetUsername: string) => {
    if (!isHost) return;
    if (
      !window.confirm(
        `Transfer host to ${targetUsername}? You will become a regular viewer.`
      )
    )
      return;
    send({ event: 'transfer_host', payload: { userId: targetUserId } });
  };

  // Sort: host first, then moderators, then participants
  const sorted = [...participants].sort((a, b) => {
    const order: Record<Role, number> = { HOST: 0, MODERATOR: 1, PARTICIPANT: 2 };
    return order[a.role] - order[b.role];
  });

  return (
    <div className="flex flex-col h-full bg-gray-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ShieldCheck size={15} className="text-gray-400" />
          <span>Participants</span>
          <span className="text-xs bg-gray-700 px-2 py-0.5 rounded text-gray-400">
            {participants.length}
          </span>
        </h2>
        {isHost && (
          <button
            className="w-7 h-7 rounded-lg bg-gray-800 text-gray-400 flex items-center justify-center hover:bg-gray-700 hover:text-white transition"
            title="Host controls panel"
          >
            <MoreHorizontal size={16} />
          </button>
        )}
      </div>

      {/* Participant list */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-1"
        onClick={() => setAssignMenu(null)}
      >
        {sorted.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs">
            No participants yet
          </div>
        )}

        {sorted.map((p) => (
          <div
            key={p.userId}
            className="flex items-center justify-between gap-2 px-2 py-2 rounded-xl
                       bg-gray-800/50 border border-transparent hover:border-gray-700 transition"
          >
            {/* Avatar + name */}
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${getAvatarColor(p.username)}`}
              >
                {p.username.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-white truncate font-medium">
                    {p.username}
                  </span>
                  {p.userId === userId && (
                    <span className="text-xs text-gray-500">(you)</span>
                  )}
                </div>
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded self-start mt-0.5 ${ROLE_COLORS[p.role]}`}
                >
                  {ROLE_LABELS[p.role]}
                </span>
              </div>
            </div>

            {/* Online dot */}
            <Circle size={8} className="text-green-400 fill-green-400 flex-shrink-0" />

            {/* Host actions */}
            {isHost && p.userId !== userId && (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Role assignment dropdown */}
                <div className="relative">
                  <button
                    onClick={() =>
                      setAssignMenu(p.userId === assignMenu ? null : p.userId)
                    }
                    className="w-7 h-7 rounded-lg bg-gray-700 text-gray-300 flex items-center justify-center hover:bg-gray-600 hover:text-white transition"
                    title="Assign role"
                  >
                    <Shuffle size={14} />
                  </button>

                  {assignMenu === p.userId && (
                    <div className="absolute right-0 top-9 w-36 bg-gray-800 border border-gray-700 rounded-xl py-1 shadow-2xl z-20">
                      <button
                        onClick={() => handleAssignRole(p.userId, 'MODERATOR')}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition"
                      >
                        Make Moderator
                      </button>
                      <button
                        onClick={() => handleAssignRole(p.userId, 'PARTICIPANT')}
                        className="w-full text-left px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition"
                      >
                        Make Viewer
                      </button>
                      <div className="border-t border-gray-700 my-1" />
                      <button
                        onClick={() => handleTransferHost(p.userId, p.username)}
                        className="w-full text-left px-3 py-2 text-xs text-blue-400 hover:bg-gray-700 transition flex items-center gap-1.5"
                      >
                        <Crown size={12} />
                        Transfer Host
                      </button>
                    </div>
                  )}
                </div>

                {/* Remove participant */}
                <button
                  onClick={() => handleRemoveParticipant(p.userId, p.username)}
                  className="w-7 h-7 rounded-lg bg-gray-700 text-red-400/70 flex items-center justify-center hover:bg-red-900/30 hover:text-red-400 transition"
                  title={`Remove ${p.username}`}
                >
                  <UserMinus size={14} />
                </button>
              </div>
            )}

            {/* Host crown icon */}
            {p.role === 'HOST' && (
              <Crown size={14} className="text-yellow-400 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
