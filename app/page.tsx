"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { Moon, Sun, Crown, Trophy } from "lucide-react";
import { useTheme } from "next-themes";
import { BoardGrid } from "@/components/BoardGrid";
import { API_BASE, WS_BASE, detectCity, getAiReview, getLeaderboard } from "@/lib/api";

type CellState = "unknown" | "ship" | "hit" | "miss" | "sunk";
const makeGrid = (): CellState[][] => Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "unknown"));
type ShipType = "CARRIER" | "BATTLESHIP" | "CRUISER" | "SUBMARINE" | "DESTROYER";
type Placement = { type: ShipType; x: number; y: number; horizontal: boolean };
type SessionView = {
  inviteCode: string;
  host: string;
  guest: string | null;
  turn: string;
  started: boolean;
  hostPlaced: boolean;
  guestPlaced: boolean;
};

const SHIPS: { type: ShipType; length: number }[] = [
  { type: "CARRIER", length: 5 },
  { type: "BATTLESHIP", length: 4 },
  { type: "CRUISER", length: 3 },
  { type: "SUBMARINE", length: 3 },
  { type: "DESTROYER", length: 2 },
];

function randomPlacements(): Placement[] {
  const placements: Placement[] = [];
  const taken = new Set<string>();
  for (const ship of SHIPS) {
    let placed = false;
    while (!placed) {
      const horizontal = Math.random() > 0.5;
      const x = Math.floor(Math.random() * 10);
      const y = Math.floor(Math.random() * 10);
      const coords: string[] = [];
      let valid = true;
      for (let i = 0; i < ship.length; i++) {
        const cx = horizontal ? x : x + i;
        const cy = horizontal ? y + i : y;
        if (cx < 0 || cy < 0 || cx >= 10 || cy >= 10 || taken.has(`${cx}:${cy}`)) {
          valid = false;
          break;
        }
        coords.push(`${cx}:${cy}`);
      }
      if (!valid) continue;
      coords.forEach((c) => taken.add(c));
      placements.push({ type: ship.type, x, y, horizontal });
      placed = true;
    }
  }
  return placements;
}

export default function Home() {
  const [nickname, setNickname] = useState("Admiral");
  const [city, setCity] = useState("Unknown");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [ownGrid, setOwnGrid] = useState(makeGrid());
  const [enemyGrid, setEnemyGrid] = useState(makeGrid());
  const [draftPlacements, setDraftPlacements] = useState<Placement[]>([]);
  const [selectedShip, setSelectedShip] = useState<ShipType>("CARRIER");
  const [horizontal, setHorizontal] = useState(true);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [review, setReview] = useState("");
  const [session, setSession] = useState<SessionView | null>(null);
  const [status, setStatus] = useState("Create or join a game");
  const [gameResult, setGameResult] = useState<"won" | "lost" | null>(null);
  const [myPlaced, setMyPlaced] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const { theme, setTheme } = useTheme();
  const [stomp, setStomp] = useState<Client | null>(null);

  const avatarUrl = useMemo(
    () => `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nickname)}`,
    [nickname]
  );

  useEffect(() => {
    detectCity().then(setCity).catch(() => setCity("Unknown"));
  }, []);

  useEffect(() => {
    if (!city) return;
    getLeaderboard(city).then(setLeaderboard).catch(() => setLeaderboard([]));
  }, [city]);

  function paintShipsOnGrid(ships: Placement[]) {
    const next = makeGrid();
    for (const s of ships) {
      const len = SHIPS.find((ship) => ship.type === s.type)?.length ?? 0;
      for (let i = 0; i < len; i++) {
        const x = s.horizontal ? s.x : s.x + i;
        const y = s.horizontal ? s.y + i : s.y;
        next[x][y] = "ship";
      }
    }
    setOwnGrid(next);
  }

  function connectSocket(code: string) {
    if (stomp?.active) stomp.deactivate();
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_BASE),
      reconnectDelay: 5000,
      onConnect: () => {
        setIsConnected(true);
        setStatus("Connected. Waiting for events...");
        client.subscribe(`/topic/game/${code}`, (message) => {
          const payload = JSON.parse(message.body);
          if (payload.type === "ERROR") {
            setStatus(`Error: ${String(payload.payload)}`);
            return;
          }
          if (payload.type === "PLAYER_JOINED" || payload.type === "SHIPS_PLACED" || payload.type === "GAME_CREATED") {
            setSession(payload.payload as SessionView);
            return;
          }
          if (payload.type === "SHOT_RESULT") {
            const shot = payload.payload as {
              shooter: string;
              x: number;
              y: number;
              hit: boolean;
              sunk: boolean;
              win: boolean;
              nextTurn: string;
              message: string;
            };
            setSession((prev) => (prev ? { ...prev, turn: shot.nextTurn } : prev));
            setLog((prev) => [...prev, JSON.stringify(shot)]);

            if (shot.shooter === nickname) {
              setEnemyGrid((prev) => {
                const next = prev.map((r) => [...r]);
                next[shot.x][shot.y] = shot.sunk ? "sunk" : shot.hit ? "hit" : "miss";
                return next;
              });
            } else {
              setOwnGrid((prev) => {
                const next = prev.map((r) => [...r]);
                next[shot.x][shot.y] = shot.hit ? "hit" : "miss";
                return next;
              });
            }

            if (shot.hit) playSound("explode");
            setStatus(`${shot.shooter} fired at (${shot.x}, ${shot.y}): ${shot.message}`);
            if (shot.win) {
              const won = shot.shooter === nickname;
              setGameResult(won ? "won" : "lost");
              setStatus(won ? "Game finished. You won!" : "Game finished. You lost.");
              void submitResult(won);
            }
          }
        });
      },
      onWebSocketClose: () => setIsConnected(false),
    });
    client.activate();
    setStomp(client);
  }

  function playSound(name: "shot" | "explode") {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = name === "shot" ? "square" : "sawtooth";
    osc.frequency.value = name === "shot" ? 220 : 120;
    gain.gain.value = 0.05;
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  function shipLength(type: ShipType): number {
    return SHIPS.find((s) => s.type === type)?.length ?? 0;
  }

  function canPlaceShip(type: ShipType, x: number, y: number, isHorizontal: boolean): boolean {
    const len = shipLength(type);
    for (let i = 0; i < len; i++) {
      const cx = isHorizontal ? x : x + i;
      const cy = isHorizontal ? y + i : y;
      if (cx < 0 || cy < 0 || cx >= 10 || cy >= 10) return false;
      if (ownGrid[cx][cy] !== "unknown") return false;
    }
    return true;
  }

  function placeSelectedShipAt(x: number, y: number) {
    if (myPlaced || session?.started) return;
    if (draftPlacements.some((p) => p.type === selectedShip)) {
      setStatus(`${selectedShip} already placed. Pick another ship.`);
      return;
    }
    if (!canPlaceShip(selectedShip, x, y, horizontal)) {
      setStatus("Invalid position for selected ship.");
      return;
    }

    const len = shipLength(selectedShip);
    const nextGrid = ownGrid.map((r) => [...r]);
    for (let i = 0; i < len; i++) {
      const cx = horizontal ? x : x + i;
      const cy = horizontal ? y + i : y;
      nextGrid[cx][cy] = "ship";
    }
    setOwnGrid(nextGrid);

    const nextPlacements = [...draftPlacements, { type: selectedShip, x, y, horizontal }];
    setDraftPlacements(nextPlacements);
    const nextShip = SHIPS.map((s) => s.type).find((t) => !nextPlacements.some((p) => p.type === t));
    if (nextShip) setSelectedShip(nextShip);
    setStatus(`${selectedShip} placed. ${nextPlacements.length}/5 ready.`);
  }

  function shoot(x: number, y: number) {
    if (!stomp || !inviteCode || !session?.started || session.turn !== nickname || gameResult !== null) return;
    playSound("shot");
    stomp.publish({
      destination: "/app/game.shoot",
      body: JSON.stringify({ inviteCode, nickname, x, y }),
    });
  }

  async function createGame() {
    if (!nickname.trim()) {
      setStatus("Enter a nickname first.");
      return;
    }
    const res = await fetch(`${API_BASE}/games/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to create game" }));
      setStatus(`Create failed: ${err.error ?? "Unknown error"}`);
      return;
    }
    const data = await res.json();
    const code = data.inviteCode as string;
    setInviteCode(code);
    setMyPlaced(false);
    setSession(data as SessionView);
    setDraftPlacements([]);
    setOwnGrid(makeGrid());
    setEnemyGrid(makeGrid());
    setGameResult(null);
    setStatus(`Invite created: ${code}`);
    connectSocket(code);
  }

  async function joinGame() {
    if (!joinCode) return;
    if (!nickname.trim()) {
      setStatus("Enter a nickname first.");
      return;
    }
    const res = await fetch(`${API_BASE}/games/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCode, nickname }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to join game" }));
      setStatus(`Join failed: ${err.error ?? "Unknown error"}`);
      return;
    }
    const data = await res.json();
    setSession(data as SessionView);
    setInviteCode(joinCode);
    setMyPlaced(false);
    setDraftPlacements([]);
    setOwnGrid(makeGrid());
    setEnemyGrid(makeGrid());
    setGameResult(null);
    setStatus(`Joined room ${joinCode}`);
    connectSocket(joinCode);
  }

  function autoPlaceShips() {
    if (!stomp || !inviteCode || !isConnected) {
      setStatus("Socket not connected yet. Wait and try again.");
      return;
    }
    const ships = randomPlacements();
    paintShipsOnGrid(ships);
    setDraftPlacements(ships);
    stomp.publish({
      destination: "/app/game.place",
      body: JSON.stringify({ inviteCode, nickname, ships }),
    });
    setMyPlaced(true);
    setStatus("Auto-placed and submitted. Waiting for opponent...");
  }

  function submitManualPlacement() {
    if (!stomp || !inviteCode || !isConnected) {
      setStatus("Socket not connected yet. Wait and try again.");
      return;
    }
    if (draftPlacements.length !== SHIPS.length) {
      setStatus("Place all 5 ships first.");
      return;
    }
    stomp.publish({
      destination: "/app/game.place",
      body: JSON.stringify({ inviteCode, nickname, ships: draftPlacements }),
    });
    setMyPlaced(true);
    setStatus("Manual placement submitted. Waiting for opponent...");
  }

  function resetPlacement() {
    if (myPlaced) return;
    setDraftPlacements([]);
    setOwnGrid(makeGrid());
    setSelectedShip("CARRIER");
    setStatus("Placement reset.");
  }

  async function analyzeMatch() {
    setReview(await getAiReview(log.join("\n")));
  }

  async function submitResult(won: boolean) {
    await fetch(`${API_BASE}/stats/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname,
        city,
        won,
        shotsFired: enemyGrid.flat().filter((c) => c === "hit" || c === "miss" || c === "sunk").length,
        hits: enemyGrid.flat().filter((c) => c === "hit" || c === "sunk").length,
      }),
    });
    setLeaderboard(await getLeaderboard(city));
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 p-4 md:p-8">
      <section className="glass flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={avatarUrl} alt="avatar" width={52} height={52} className="rounded-xl border border-slate-700" />
          <div>
            <h1 className="text-2xl font-bold">Sea Battle Pro</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">City: {city}</p>
          </div>
        </div>
        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-xl border p-2">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="glass md:col-span-2 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} className="rounded-lg border bg-transparent px-3 py-2" />
            <button onClick={createGame} className="rounded-lg bg-accent px-3 py-2 font-semibold text-white">Create Invite</button>
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Invite code" className="rounded-lg border bg-transparent px-3 py-2" />
            <button onClick={joinGame} className="rounded-lg border px-3 py-2">Join</button>
            <span className="text-sm text-slate-500">Invite: {inviteCode || "-"}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={autoPlaceShips}
              disabled={myPlaced || Boolean(session?.started) || !inviteCode || !isConnected}
              className="rounded-lg border px-3 py-2 disabled:opacity-50"
            >
              Auto-place Ships
            </button>
            <select
              value={selectedShip}
              onChange={(e) => setSelectedShip(e.target.value as ShipType)}
              disabled={myPlaced || Boolean(session?.started)}
              className="rounded-lg border bg-transparent px-3 py-2 disabled:opacity-50"
            >
              {SHIPS.map((s) => (
                <option key={s.type} value={s.type}>{s.type}</option>
              ))}
            </select>
            <button onClick={() => setHorizontal((v) => !v)} disabled={myPlaced || Boolean(session?.started)} className="rounded-lg border px-3 py-2 disabled:opacity-50">
              Direction: {horizontal ? "Horizontal" : "Vertical"}
            </button>
            <button onClick={submitManualPlacement} disabled={myPlaced || draftPlacements.length !== SHIPS.length} className="rounded-lg border px-3 py-2 disabled:opacity-50">
              Submit Manual ({draftPlacements.length}/5)
            </button>
            <button onClick={resetPlacement} disabled={myPlaced || Boolean(session?.started)} className="rounded-lg border px-3 py-2 disabled:opacity-50">
              Reset Placement
            </button>
          </div>

          <p className="text-sm text-slate-500">{status}</p>
          {session && (
            <p className="text-sm">
              Turn: <span className="font-semibold">{session.turn}</span> | Started: {session.started ? "Yes" : "No"} | You placed: {myPlaced ? "Yes" : "No"}
            </p>
          )}
          {gameResult === "won" && (
            <div className="rounded-xl border border-emerald-400/50 bg-emerald-500/15 p-3 text-center font-semibold text-emerald-300">
              You won!
            </div>
          )}
          {gameResult === "lost" && (
            <div className="rounded-xl border border-rose-400/50 bg-rose-500/15 p-3 text-center font-semibold text-rose-300">
              You lost.
            </div>
          )}

          <div className="grid gap-4 grid-cols-1">
            <div>
              <p className="mb-2 text-sm font-semibold">My board</p>
              <BoardGrid cells={ownGrid} onShoot={placeSelectedShipAt} disabled={myPlaced || Boolean(session?.started)} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Opponents board</p>
              <BoardGrid cells={enemyGrid} onShoot={shoot} disabled={!session?.started || session.turn !== nickname || gameResult !== null} />
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={analyzeMatch} className="rounded-lg border px-3 py-2">AI Strategic Review</button>
            <button onClick={() => submitResult(true)} className="rounded-lg bg-emerald-600 px-3 py-2 text-white">Sync Leaderboard</button>
          </div>
          {review && <p className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-sm">{review}</p>}
        </div>

        <div className="space-y-6">
          <div className="glass">
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><Trophy size={16} /> Top 10 in {city}</h2>
            <ul className="space-y-2 text-sm">
              {leaderboard.map((p, i) => (
                <li key={p.id ?? i} className="flex justify-between rounded-lg border border-slate-700/40 p-2">
                  <span>{i + 1}. {p.nickname}</span>
                  <span>{p.wins}W / {p.losses}L ({Math.round(p.accuracy)}%)</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass">
            <h2 className="mb-2 flex items-center gap-2 font-semibold"><Crown size={16} /> Premium Skins</h2>
            <div className="grid grid-cols-3 gap-2">
              {["Obsidian", "Neon Fleet", "Gold Admiral"].map((skin) => (
                <div key={skin} className="rounded-lg border border-slate-700/40 p-2 text-center text-xs">{skin}</div>
              ))}
            </div>
            <button className="mt-3 w-full rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-3 py-2 font-semibold text-white">
              Upgrade to Pro
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
