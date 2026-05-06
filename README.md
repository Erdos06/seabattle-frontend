# Sea Battle Pro Platform

Sea Battle Pro is a premium-style Battleship web platform with real-time multiplayer, AI-powered post-match coaching, and hyper-local competition.

## Startup Potential

- **Sticky core loop**: short competitive sessions with immediate rematch behavior.
- **Viral acquisition**: invite-link multiplayer drives organic friend referrals.
- **Retention moat**: city leaderboard and AI coaching create daily replay motivation.
- **Monetization path**: cosmetic skins + Pro upsell can evolve into subscriptions, seasons, and private leagues.

## Architecture

```
/backend   -> Spring Boot 3, Java 17, WebSocket STOMP, JPA, PostgreSQL
/frontend  -> Next.js App Router, Tailwind, Framer Motion, Lucide
```

## Great-Level Features Implemented

- Strict game engine validation:
  - 10x10 board
  - no overlaps
  - no out-of-bounds placement
  - single-shot-per-cell
  - turn-based shot flow
  - win detection when all ships are sunk
- Real-time multiplayer with STOMP on `/ws` and invite-code rooms (`/topic/game/{inviteCode}`).
- AI coach integrated with Gemini API (free-tier compatible model default: `gemini-1.5-flash`).
- Hyper-local leaderboard:
  - city detection via `http://ip-api.com/json/`
  - stores wins/losses/accuracy in PostgreSQL
  - top 10 players by city endpoint
- Premium-style UI:
  - dark/light mode
  - interactive 10x10 animated grid
  - DiceBear bot avatar by nickname
  - premium skins gallery + mock “Upgrade to Pro” CTA

## Backend Setup

1. Create PostgreSQL DB:
   - database: `seabattle`
   - username: `postgres`
   - password: `postgres` (or update config)
2. Set env var:
   - `APP_GEMINI_API_KEY=your_key`
3. Run:

```bash
cd backend
mvn spring-boot:run
```

Backend runs on `http://localhost:8080`.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:3000`.

### Optional env vars

- `NEXT_PUBLIC_API_BASE` (default `http://localhost:8080/api`)
- `NEXT_PUBLIC_WS_BASE` (default `http://localhost:8080/ws`)

## AI Coach Prompt Template

Implemented prompt:

`Analyze this battleship game log: [LOG]. Give 3 tactical tips in a professional admiral tone.`

## Key Endpoints

- `GET /api/location` -> detected city
- `GET /api/leaderboard/{city}` -> top 10 city players
- `POST /api/stats/result` -> upsert player result
- `POST /api/coach/review` -> Gemini strategic review
- `POST /api/bot/shot` -> probability-map bot move

WebSocket:

- `/ws` endpoint
- app destinations:
  - `/app/game.create`
  - `/app/game.join`
  - `/app/game.place`
  - `/app/game.shoot`
