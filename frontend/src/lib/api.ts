/**
 * REST API client for the Watch Party backend.
 * Uses VITE_API_URL from environment variables.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface CreateRoomRequest {
  host_user_id: string;
}

export interface CreateRoomResponse {
  roomId: string;
  code: string;
  hostToken: string;
  host_user_id: string;
  created_at: string;
}

export interface RoomResponse {
  roomId: string;
  code: string;
  hostToken: string;
  host_user_id: string;
  created_at: string;
}

/**
 * Creates a new watch party room.
 */
export async function createRoom(
  request: CreateRoomRequest
): Promise<CreateRoomResponse> {
  const res = await fetch(`${API_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to create room');
  }

  return res.json();
}

/**
 * Fetches room metadata by join code.
 */
export async function getRoomByCode(code: string): Promise<RoomResponse> {
  const res = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(code)}`);

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Room not found');
    }
    const text = await res.text();
    throw new Error(text || 'Failed to fetch room');
  }

  return res.json();
}

/**
 * Health check.
 */
export async function healthCheck(): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/health`);
  if (!res.ok) throw new Error('Backend unhealthy');
  return res.json();
}