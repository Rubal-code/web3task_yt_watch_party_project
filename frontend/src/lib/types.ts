/**
 * Shared TypeScript types for the Watch Party frontend.
 * Mirrors the backend WebSocket event schema and role permissions.
 */

export type Role = 'HOST' | 'MODERATOR' | 'PARTICIPANT';

export interface Participant {
  userId: string;
  username: string;
  role: Role;
}

export interface PlayState {
  playState: 'playing' | 'paused';
  currentTime: number;
  videoId: string | null;
}

export interface RoomMeta {
  roomId: string;
  code: string;
  hostToken: string;
  host_user_id: string;
}

// ----------------------------------------------------------------
// Client-to-server event payloads
// ----------------------------------------------------------------

export interface JoinRoomPayload {
  roomId: string;
  username: string;
  hostToken?: string;
}

export interface LeaveRoomPayload {
  userId: string;
}

export interface PlayPausePayload {
  /** Current player time in seconds — used to sync currentTime on play/pause */
  time?: number;
}

export interface SeekPayload {
  time: number;
}

export interface ChangeVideoPayload {
  videoId: string;
}

export interface ChatMessagePayload {
  message: string;
  /** Optional client-generated ID for deduplication (not used by server for auth) */
  clientMsgId?: string;
}

export interface AssignRolePayload {
  userId: string;
  role: 'MODERATOR' | 'PARTICIPANT';
}

export interface RemoveParticipantPayload {
  userId: string;
}

export interface TransferHostPayload {
  userId: string;
}

export type ClientEvent =
  | { event: 'join_room'; payload: JoinRoomPayload }
  | { event: 'leave_room'; payload: LeaveRoomPayload }
  | { event: 'play'; payload: PlayPausePayload }
  | { event: 'pause'; payload: PlayPausePayload }
  | { event: 'seek'; payload: SeekPayload }
  | { event: 'change_video'; payload: ChangeVideoPayload }
  | { event: 'chat_message'; payload: ChatMessagePayload }
  | { event: 'assign_role'; payload: AssignRolePayload }
  | { event: 'remove_participant'; payload: RemoveParticipantPayload }
  | { event: 'transfer_host'; payload: TransferHostPayload };

// ----------------------------------------------------------------
// Server-to-client event types
// ----------------------------------------------------------------

export interface ServerEventJoin {
  event: 'user_joined';
  payload: {
    username: string;
    userId: string;
    role: Role;
    participants: Participant[];
  };
}

export interface ServerEventLeave {
  event: 'user_left';
  payload: {
    username: string;
    userId: string;
    participants: Participant[];
  };
}

export interface ServerEventSync {
  event: 'sync_state';
  payload: PlayState;
}

export interface ServerEventRoleAssigned {
  event: 'role_assigned';
  payload: {
    userId: string;
    username: string;
    role: Role;
    participants: Participant[];
  };
}

export interface ServerEventRemoved {
  event: 'participant_removed';
  payload: {
    userId: string;
    participants: Participant[];
  };
}

export interface ServerEventError {
  event: 'error';
  payload: {
    code: string;
    message: string;
  };
}

export interface ServerEventChat {
  event: 'chat_message';
  payload: {
    messageId: string;
    userId: string;
    username: string;
    message: string;
    timestamp: string;
  };
}

export type ServerEvent =
  | ServerEventJoin
  | ServerEventLeave
  | ServerEventSync
  | ServerEventRoleAssigned
  | ServerEventRemoved
  | ServerEventError
  | ServerEventChat;

export const CAN_PLAYBACK_CONTROL: Record<Role, boolean> = {
  HOST: true,
  MODERATOR: true,
  PARTICIPANT: false,
};

// ----------------------------------------------------------------
// Chat types (used by ChatPanel and Room)
// ----------------------------------------------------------------

export interface ChatMessage {
  messageId: string;
  userId: string;
  username: string;
  message: string;
  timestamp: string;
  /** True if this message was sent by the current user */
  isOwn: boolean;
}
