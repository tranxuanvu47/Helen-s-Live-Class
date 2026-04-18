# StreamChat – Angular 17 + Stream Chat & Video

Full-stack real-time chat and video meeting app.

| Layer | Tech |
|---|---|
| Frontend | Angular 17 · Standalone Components · RxJS · SCSS |
| Chat SDK | stream-chat-angular v5 · stream-chat |
| Video SDK | @stream-io/video-client |
| Backend | Node.js · Express · TypeScript · stream-chat (server) |

---

## Project Structure

```
stream-chat/
├── backend/
│   ├── src/
│   │   ├── index.ts                  # Express entry point
│   │   ├── config.ts                 # Env config
│   │   ├── middleware/
│   │   │   └── error.middleware.ts
│   │   └── routes/
│   │       ├── auth.route.ts         # POST /api/auth/token, /guest
│   │       ├── channel.route.ts      # POST /api/channels
│   │       └── meeting.route.ts      # POST /api/meetings, GET /api/meetings/:id
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── app.component.ts
    │   │   ├── app.config.ts         # ApplicationConfig (providers)
    │   │   ├── app.routes.ts         # Route definitions
    │   │   ├── core/
    │   │   │   ├── models/           # auth / channel / meeting interfaces
    │   │   │   ├── services/
    │   │   │   │   ├── auth.service.ts
    │   │   │   │   ├── stream-chat.service.ts
    │   │   │   │   └── stream-video.service.ts
    │   │   │   ├── guards/auth.guard.ts
    │   │   │   └── interceptors/auth.interceptor.ts
    │   │   ├── features/
    │   │   │   ├── auth/login/       # Login page
    │   │   │   ├── chat/
    │   │   │   │   ├── chat-layout/           # Main chat page (sidebar + messages)
    │   │   │   │   └── create-channel-modal/  # New channel dialog
    │   │   │   └── meeting/
    │   │   │       └── meeting-room/  # Video call page
    │   │   └── shared/components/
    │   │       ├── header/            # Top navigation bar
    │   │       └── video-tile/        # Single participant video tile
    │   ├── environments/
    │   ├── styles.scss               # Global SCSS + CSS variables
    │   └── index.html
    ├── angular.json
    ├── package.json
    ├── proxy.conf.json               # Dev proxy → localhost:3000
    └── tsconfig.json
```

---

## Prerequisites

- **Node.js** >= 18 LTS
- **npm** >= 9
- A **Stream** account → [getstream.io](https://getstream.io)
  - Create an app (choose "Chat + Messaging" + "Video & Audio")
  - Copy your **API Key** and **API Secret**

---

## 1 — Get Stream credentials

1. Go to [dashboard.getstream.io](https://dashboard.getstream.io) → **App Settings**
2. Note your **API Key** (public) and **API Secret** (keep private)

---

## 2 — Configure environment files

### Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
PORT=3000
FRONTEND_URL=http://localhost:4200
STREAM_API_KEY=your_stream_api_key
STREAM_API_SECRET=your_stream_api_secret
```

### Frontend

Edit `frontend/src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  apiUrl: '/api',
  streamApiKey: 'your_stream_api_key',   // ← same public key
};
```

---

## 3 — Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

---

## 4 — Run in development

Open **two terminals**:

```bash
# Terminal 1 – Backend
cd backend
npm run dev
# → http://localhost:3000

# Terminal 2 – Frontend
cd frontend
npm start
# → http://localhost:4200  (proxies /api → :3000)
```

---

## 5 — Using the app

### Login
- Open `http://localhost:4200`
- Enter a **User ID** (alphanumeric, no spaces, e.g. `alice`), a **Display Name**, and optionally an avatar URL
- Click **Sign In**  *(first login creates the user in Stream)*
- Or click **Continue as Guest** for a one-click throwaway account

### Chat
- The left sidebar lists all channels you're a member of
- Click **New Channel** in the header to create a channel (optionally invite members by user ID)
- Select a channel → type and send messages in real time

### Meeting
- Click **Start Meeting** in the header → the backend generates a call ID and redirects you to `/meeting/<callId>`
- The meeting URL can be **shared directly** with others; they paste it in the browser, log in (or guest) and join
- Controls: **Mute/Unmute mic**, **Start/Stop camera**, **Leave**

---

## 6 — Build for production

```bash
# Backend
cd backend
npm run build
npm start          # serves dist/index.js

# Frontend
cd frontend
ng build           # outputs dist/frontend/
# serve with nginx / any static host
```

---

## 7 — API Reference

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/auth/token` | `{ userId, userName, userImage? }` | Get Stream user token |
| POST | `/api/auth/guest` | – | Create anonymous guest + token |
| POST | `/api/channels` | `{ name, createdById, members?, description? }` | Create messaging channel |
| POST | `/api/meetings` | `{ createdById, callId?, title? }` | Reserve a call ID |
| GET | `/api/meetings/:callId` | – | Get meeting info |
| GET | `/health` | – | Health check |

---

## 8 — Running tests

```bash
# Backend – TypeScript compilation check
cd backend
npm run build

# Frontend – unit tests (Karma/Jasmine)
cd frontend
ng test

# Frontend – E2E (add Cypress/Playwright when needed)
```

---

## 9 — Key architecture decisions

| Decision | Why |
|---|---|
| Standalone components only | Angular 17 best practice, no `NgModule` overhead |
| `signal()` for local UI state | Avoids unnecessary `ChangeDetectorRef` calls |
| `AuthGuard` as functional guard | Simpler, no class ceremony |
| HTTP Proxy in dev | Avoids CORS config; single origin in production |
| Same JWT for Chat + Video | Stream uses unified tokens; one `/auth/token` call covers both SDKs |
| Client-side call creation | `call.join({ create: true })` idempotently creates-or-joins; no extra backend roundtrip |

---

## 10 — Troubleshooting

| Issue | Fix |
|---|---|
| `STREAM_API_KEY not set` | Check `backend/.env` file |
| `401 Unauthorized` from Stream | Token expired (24 h). Log out and log back in |
| Camera/mic prompt not showing | Browser blocks media on non-HTTPS. Use localhost or add HTTPS |
| Channel list empty after login | Check that `streamApiKey` in `environment.ts` matches backend |
| Video not rendering | Some browsers block autoplay. Click anywhere on the page first |
