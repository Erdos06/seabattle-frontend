"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { Moon, Sun, Crown, Trophy } from "lucide-react";
import { useTheme } from "next-themes";
import { BoardGrid } from "@/components/BoardGrid";
import { API_BASE, WS_BASE, detectCity, getAiReview, getLeaderboard } from "@/lib/api";

type CellState = "unknown" | "hit" | "miss" | "sunk";
const makeGrid = (): CellState[][] => Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "unknown"));

export default function Home() {
  const [nickname, setNickname] = useState("Admiral");
  const [city, setCity] = useState("Unknown");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [grid, setGrid] = useState(makeGrid());
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [review, setReview] = useState("");
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

  function connectSocket(code: string) {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_BASE),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/game/${code}`, (message) => {
          const payload = JSON.parse(message.body);
          if (payload.type === "SHOT_RESULT") {
            setLog((prev) => [...prev, JSON.stringify(payload.payload)]);
          }
        });
      },
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

  function shoot(x: number, y: number) {
    if (!stomp || !inviteCode) return;
    playSound("shot");
    stomp.publish({
      destination: "/app/game.shoot",
      body: JSON.stringify({ inviteCode, nickname, x, y }),
    });
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[x][y] = "miss";
      return next;
    });
  }

  async function createGame() {
    const res = await fetch(`${API_BASE}/games/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
    const data = await res.json();
    const code = data.inviteCode;
    setInviteCode(code);
    connectSocket(code);
  }

  async function joinGame() {
    if (!joinCode) return;
    await fetch(`${API_BASE}/games/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCode, nickname }),
    });
    setInviteCode(joinCode);
    connectSocket(joinCode);
  }

  async function analyzeMatch() {
    setReview(await getAiReview(log.join("\n")));
  }

  async function submitWin() {
    await fetch(`${API_BASE}/stats/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, city, won: true, shotsFired: 25, hits: 12 }),
    });
    setLeaderboard(await getLeaderboard(city));
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 p-4 md:p-8">
      <section className="glass flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src={avatarUrl} alt="avatar" width={52} height={52} className="rounded-xl border border-slate-700" />
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
          <BoardGrid cells={grid} onShoot={shoot} />
          <div className="flex gap-2">
            <button onClick={analyzeMatch} className="rounded-lg border px-3 py-2">AI Strategic Review</button>
            <button onClick={submitWin} className="rounded-lg bg-emerald-600 px-3 py-2 text-white">Mock Win + Leaderboard</button>
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
