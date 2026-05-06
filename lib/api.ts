export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080/api";
export const WS_BASE = process.env.NEXT_PUBLIC_WS_BASE ?? "http://localhost:8080/ws";

export async function detectCity(): Promise<string> {
    try {
        const res = await fetch(`${API_BASE}/location`, { cache: "no-store" });
        const data = await res.json();
        return data.city || "Almaty";
    } catch (error) {
        console.error("Error detecting city:", error);
        return "Almaty";
    }
}

export async function getLeaderboard(city: string) {
  const res = await fetch(`${API_BASE}/leaderboard/${encodeURIComponent(city)}`, { cache: "no-store" });
  return res.json();
}

export async function getAiReview(log: string): Promise<string> {
  const res = await fetch(`${API_BASE}/coach/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ log }),
  });
  const data = await res.json();
  return data.review ?? "No review returned.";
}
