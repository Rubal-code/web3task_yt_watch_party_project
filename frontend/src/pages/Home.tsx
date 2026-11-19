/**
 * Home page: Create a new room or join an existing one by code or link.
 * Stores hostToken and username in sessionStorage and localStorage.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Copy, Link, User } from 'lucide-react';
import { createRoom, getRoomByCode } from '@/lib/api';
import { toast } from '@/lib/toast';

export default function Home() {
  const navigate = useNavigate();
  const [username, setUsername] = useState(
    sessionStorage.getItem('wp_username') ||
    localStorage.getItem('wp_username') ||
    ''
  );
  const [joinInput, setJoinInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser) {
      toast.error('Please enter a username');
      return;
    }
    sessionStorage.setItem('wp_username', cleanUser);
    localStorage.setItem('wp_username', cleanUser);

    setCreating(true);
    try {
      const res = await createRoom({ host_user_id: cleanUser });
      // Store host token for this tab so host capabilities activate
      sessionStorage.setItem('wp_hostToken', res.hostToken || res.roomId);
      navigate(`/room/${res.roomId}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser) {
      toast.error('Please enter a username');
      return;
    }
    sessionStorage.setItem('wp_username', cleanUser);
    localStorage.setItem('wp_username', cleanUser);

    const raw = joinInput.trim();
    if (!raw) {
      toast.error('Please enter a room code or link');
      return;
    }

    const roomIdMatch = raw.match(/\/room\/([a-fA-F0-9-]+)/);
    if (roomIdMatch) {
      sessionStorage.setItem('wp_hostToken', '');
      navigate(`/room/${roomIdMatch[1]}`);
      return;
    }

    setJoining(true);
    try {
      const room = await getRoomByCode(raw);
      sessionStorage.setItem('wp_hostToken', '');
      navigate(`/room/${room.roomId}`);
    } catch (err: any) {
      toast.error(err.message || 'Room not found');
    } finally {
      setJoining(false);
    }
  };

  const copyLink = () => {
    const code = joinInput.trim();
    if (!code) return;
    const link = `${window.location.origin}/room/${code}`;
    navigator.clipboard.writeText(link);
    toast.success('Room link copied');
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-4xl font-bold text-white mb-2">YouTube Watch Party</div>
          <p className="text-gray-400 text-sm">Watch videos together in real-time sync</p>
        </div>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">
            Your username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Alice"
            className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-600 text-white focus:outline-none focus:border-blue-500 transition"
          />
          <p className="text-xs text-gray-500">
            Choose your name before creating or joining a party.
          </p>
        </div>

        <form onSubmit={handleCreateRoom} className="space-y-3">
          <button
            type="submit"
            disabled={creating || !username.trim()}
            className={`w-full px-5 py-3 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 ${
              creating || !username.trim() ? 'bg-gray-700' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            <Play size={20} /> {creating ? 'Creating room...' : 'Create Room'}
          </button>
          <p className="text-xs text-gray-500 text-center">
            You will be the HOST with full playback & video controls.
          </p>
        </form>

        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Link size={18} /> Join Room
          </h3>
          <form onSubmit={handleJoinRoom} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Room code or /room/... link"
                className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-600 text-white focus:outline-none focus:border-blue-500 transition"
              />
              <button
                type="button"
                onClick={copyLink}
                disabled={!joinInput.trim()}
                className="absolute right-2 top-2 text-gray-400 hover:text-white disabled:opacity-50 transition"
                title="Copy link"
              >
                <Copy size={18} />
              </button>
            </div>
            <button
              type="submit"
              disabled={joining || !joinInput.trim() || !username.trim()}
              className={`w-full px-5 py-3 rounded-lg text-white font-semibold transition disabled:opacity-50 ${
                joining || !joinInput.trim() || !username.trim() ? 'bg-gray-700' : 'bg-green-600 hover:bg-green-500'
              }`}
            >
              {joining ? 'Joining...' : 'Join Room'}
            </button>
          </form>
        </div>

        <p className="text-xs text-gray-500 text-center">
          Make sure the backend is running on port 8000.
        </p>
      </div>
    </div>
  );
}
