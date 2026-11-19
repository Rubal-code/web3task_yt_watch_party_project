# 🎬 YouTube Watch Party

A fully synchronized, real-time, host-controlled YouTube watch party web application built with **React**, **TypeScript**, **FastAPI**, **Python**, **WebSockets**, and **Tailwind CSS**.

Allows friends, communities, and teams to watch YouTube videos simultaneously in complete sync, controlled authoritatively by the host, while communicating through a shared real-time group chat.

---

## 🌟 Key Features

### 👑 Host-Controlled Video Management
- **Add & Change Video**: Host can paste any standard YouTube link or 11-character video ID anytime:
  - `https://www.youtube.com/watch?v=VIDEO_ID`
  - `https://youtu.be/VIDEO_ID`
  - `https://www.youtube.com/embed/VIDEO_ID`
  - Raw 11-character YouTube video ID
- **Interactive In-Player Setup Card**: When no video is queued, the host has an inline input directly in the player area with quick sample buttons (e.g., Lofi Beats, Rick Astley).
- **Video Validation & Thumbnail Preview**: Validates the URL before submission and displays a live thumbnail preview of the video.
- **Participant Restrictions**: Viewer mode disables change-video inputs and rejects unauthorized control attempts on the backend with `FORBIDDEN`.

### ⏱️ Real-Time Playback Synchronization
- **Authoritative Host Control**:
  - Host **Play** $\rightarrow$ starts video playback across all participant screens simultaneously.
  - Host **Pause** $\rightarrow$ pauses all connected players.
  - Host **Seek / Scrub** $\rightarrow$ jumps everyone to the target timestamp.
  - **Quick Seek buttons**: $\pm 10$ seconds jump controls.
- **Drift Compensation**: Uses a 1.5-second drift threshold to smooth out micro-latencies without causing video stutter or unnecessary seeks.
- **Instant Synchronization for New Joiners**: Participants joining mid-session immediately receive the authoritative playback state (`videoId`, `playState`, `currentTime`) and match the host automatically.
- **Loop Prevention**: Participants only react to incoming server `sync_state` events; local player state changes on viewers never emit outgoing play/pause events.

### 💬 Real-Time Group Chat
- **Per-Room Isolated Chat**: Each watch party room has its own independent chat channel.
- **Instant Delivery**: Messages are broadcast across the room via WebSockets and rendered in chronological order.
- **Modern Chat UI**:
  - Right-aligned blue bubbles for your own messages (`You · HH:MM`).
  - Left-aligned gray bubbles with usernames and timestamps for other participants.
  - Auto-scrolls to the latest message.
  - `Enter` to send, `Shift + Enter` for multi-line messages.
  - 500-character counter with warning alerts.
  - Real-time connection indicator (`Live` / `Offline`).
- **Security**: Sender identity is strictly derived from the authenticated WebSocket connection (never trusting arbitrary payload fields).

### 🛡️ Role-Based Access Control (RBAC)
- **Roles**:
  - **HOST**: Full playback controls, video switching, participant management (promote to moderator, transfer host, remove participants).
  - **MODERATOR**: Play, pause, seek, and change video.
  - **PARTICIPANT**: Watch videos in sync and participate in group chat.
- **Backend Enforcement**: All state-mutating events are guarded server-side by a permission matrix.

---

## 🏗️ Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────┐
│                  Frontend (Port 5173)                  │
│       React 18 + TypeScript + Vite + Tailwind CSS      │
│  - Single WebSocket Hub (useWatchSocket)               │
│  - YouTube IFrame API Singleton (VideoPlayer)          │
│  - Real-Time Chat & Tabbed Sidebar (ChatPanel)         │
└───────────────────────────▲────────────────────────────┘
                            │
               WebSocket    │    REST API (Rooms)
               JSON Events  │    HTTP POST / GET
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Backend (Port 8000)                   │
│             FastAPI + Uvicorn + WebSockets             │
│  - In-Memory Room & Participant State (asyncio.Lock)   │
│  - Authoritative Event Dispatcher (MessageHandler)     │
│  - Connection Manager (Broadcast & Cleanup)            │
│  - PostgreSQL / SQLite with SQLAlchemy & Alembic       │
└────────────────────────────────────────────────────────┘
```

---

## 📂 Project Structure

```
web3task project/
├── backend/
│   ├── alembic/                  # Database migrations
│   ├── app/
│   │   ├── routers/
│   │   │   └── rooms.py          # REST endpoints for room creation & lookup
│   │   ├── ws/
│   │   │   ├── connection_manager.py  # WebSocket connection registry & broadcast
│   │   │   ├── message_handler.py     # WebSocket event routing & permissions
│   │   │   ├── participant.py         # Participant model
│   │   │   ├── permissions.py         # Role matrix & permission validator
│   │   │   └── room.py                # In-memory synchronized room state
│   │   ├── config.py             # Pydantic environment settings
│   │   ├── database.py           # SQLAlchemy engine & session setup
│   │   ├── main.py               # FastAPI application & /ws/{room_id} endpoint
│   │   ├── models.py             # SQLAlchemy ORM models (Room metadata)
│   │   └── schemas.py            # Pydantic schemas (requests/responses)
│   ├── tests/
│   │   ├── conftest.py           # SQLite in-memory test fixtures
│   │   ├── test_rooms.py         # REST endpoint unit tests
│   │   └── test_ws_permissions.py# WebSocket permission & chat tests
│   └── requirements.txt          # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChangeVideoForm.tsx # Modal to input YouTube URLs with preview
│   │   │   ├── ChatPanel.tsx       # Real-time room chat component
│   │   │   ├── ControlsBar.tsx     # Host playback controls & seek scrubber
│   │   │   ├── ParticipantList.tsx # Roster with role management
│   │   │   └── VideoPlayer.tsx     # YouTube IFrame API synchronized player
│   │   ├── hooks/
│   │   │   └── useWatchSocket.ts   # WebSocket hook with exponential backoff
│   │   ├── lib/
│   │   │   ├── api.ts              # REST client for creating/joining rooms
│   │   │   ├── toast.ts            # Notification helpers
│   │   │   ├── types.ts            # Shared TypeScript contracts & events
│   │   │   └── youtube.ts          # Video ID extraction regex utilities
│   │   ├── pages/
│   │   │   ├── Home.tsx            # Room creation & code join landing page
│   │   │   └── Room.tsx            # Main synchronized watch party view
│   │   ├── App.tsx                 # Route declarations
│   │   └── main.tsx                # React root mount
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── README.md
```

---

## ⚡ Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Python**: v3.10, v3.11, 3.12, or 3.13
- **PostgreSQL** (optional; SQLite fallback supported)

---

### 1. Backend Setup

1. Open a terminal and navigate to the `backend` directory:
   ```powershell
   cd backend
   ```

2. (Optional) Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

3. Install required Python packages:
   ```powershell
   pip install -r requirements.txt
   ```

4. Configure environment variables in `backend/.env`:
   ```ini
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/web3task
   FRONTEND_ORIGIN=http://localhost:5173
   PORT=8000
   SECRET_KEY=change-me-in-production
   ```
   *(Note: Automated unit tests automatically use an isolated SQLite database without requiring PostgreSQL).*

5. Start the backend development server:
   ```powershell
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
   The backend API will run on **`http://localhost:8000`** with WebSocket endpoint at **`ws://localhost:8000/ws/{room_id}`**.

---

### 2. Frontend Setup

1. Open a second terminal and navigate to the `frontend` directory:
   ```powershell
   cd frontend
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Configure environment variables (optional, defaults provided):
   ```ini
   VITE_API_URL=http://localhost:8000
   VITE_WS_URL=ws://localhost:8000
   ```

4. Start the frontend Vite development server:
   ```powershell
   npm run dev
   ```
   Open **`http://localhost:5173`** in your browser.

---

## 📡 WebSocket Event Protocol

All WebSocket messages are transferred as JSON envelopes:
```json
{
  "event": "<event_name>",
  "payload": { ... }
}
```

### Client $\rightarrow$ Server Events

| Event | Payload | Permissions | Description |
|---|---|---|---|
| `join_room` | `{ roomId, username, hostToken? }` | Anyone | Connects participant to the room |
| `leave_room` | `{ userId }` | Anyone | Gracefully leaves room |
| `change_video` | `{ videoId }` | HOST, MODERATOR | Loads a new YouTube video for all clients |
| `play` | `{ time? }` | HOST, MODERATOR | Resumes playback at specified timestamp |
| `pause` | `{ time? }` | HOST, MODERATOR | Pauses playback at specified timestamp |
| `seek` | `{ time }` | HOST, MODERATOR | Seeks all clients to target time in seconds |
| `chat_message` | `{ message }` | Anyone | Broadcasts a chat message to the room |
| `assign_role` | `{ userId, role }` | HOST | Assigns `MODERATOR` or `PARTICIPANT` role |
| `transfer_host` | `{ userId }` | HOST | Transfers host privileges to another user |
| `remove_participant`| `{ userId }` | HOST | Kicks a participant from the room |

### Server $\rightarrow$ Client Events

| Event | Payload | Description |
|---|---|---|
| `user_joined` | `{ username, userId, role, participants }` | Broadcast when any user joins |
| `user_left` | `{ username, userId, participants }` | Broadcast when any user disconnects |
| `sync_state` | `{ videoId, playState, currentTime }` | Broadcast on play/pause/seek, and sent personally on join |
| `chat_message` | `{ messageId, userId, username, message, timestamp }` | Broadcast to all room members |
| `role_assigned` | `{ userId, username, role, participants }` | Broadcast when user role updates |
| `participant_removed` | `{ userId, participants }` | Broadcast when user is kicked |
| `error` | `{ code, message }` | Sent personally when an action fails/is rejected |

---

## 🧪 Testing

### Backend Automated Tests
The backend test suite covers REST endpoints, room creation, role assignment, playback permissions, chat limits, room isolation, and identity spoofing prevention.

Run tests using pytest:
```powershell
cd backend
python -m pytest tests/ -v
```
*Expected: 27 passed.*

### Frontend TypeScript & Build Verification
Verify type safety and production bundling:
```powershell
cd frontend
npx tsc --noEmit
npm run build
```
*Expected: 0 errors; Vite bundle generated successfully.*

---

## 👥 Manual Multi-User Testing Guide

1. **Host Setup (Browser Window 1)**:
   - Visit `http://localhost:5173`.
   - Enter username **Alice** and click **Create Room**.
   - Notice Alice has the **HOST** badge with a crown.
   - Paste a YouTube URL (or click the quick sample **Lofi Beats**) to start video playback.
   - Click the **Invite** button in the header to copy the room link.

2. **Participant Join (Browser Window 2 / Incognito)**:
   - Open the copied URL in a second browser window or incognito tab.
   - Enter username **Bob** when prompted.
   - Bob joins as **PARTICIPANT / Viewer**.
   - Bob's player automatically loads the identical YouTube video and syncs with Alice.

3. **Verify Playback Synchronization**:
   - In Alice's window, click **Pause** $\rightarrow$ Bob's player pauses immediately.
   - In Alice's window, click **Play** $\rightarrow$ Bob's player resumes.
   - In Alice's window, click **+10s** $\rightarrow$ Bob's player jumps forward 10 seconds.
   - In Bob's window, verify playback controls and video change inputs are disabled.

4. **Verify Real-Time Chat**:
   - In Bob's window, open the **Chat** tab and send `"Hey Alice!"`.
   - Bob sees his message in a blue right-aligned bubble.
   - Alice immediately receives Bob's message in a gray left-aligned bubble displaying `Bob` and timestamp.
   - Alice replies `"Welcome to the party!"` $\rightarrow$ both users see the synchronized conversation.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
