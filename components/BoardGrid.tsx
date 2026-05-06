"use client";

import { motion } from "framer-motion";

type CellState = "unknown" | "hit" | "miss" | "sunk";

export function BoardGrid({
  cells,
  onShoot,
}: {
  cells: CellState[][];
  onShoot: (x: number, y: number) => void;
}) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {cells.map((row, x) =>
        row.map((cell, y) => (
          <motion.button
            key={`${x}-${y}`}
            whileTap={{ scale: 0.9 }}
            onClick={() => onShoot(x, y)}
            className={`h-7 w-7 rounded-md border text-xs md:h-9 md:w-9 ${
              cell === "unknown"
                ? "border-slate-500 bg-slate-800/50"
                : cell === "miss"
                ? "border-cyan-400 bg-cyan-800/40"
                : cell === "hit"
                ? "border-rose-400 bg-rose-600/60 animate-pulse"
                : "border-amber-300 bg-amber-500/80"
            }`}
          >
            {cell === "hit" ? "X" : cell === "miss" ? "o" : cell === "sunk" ? "S" : ""}
          </motion.button>
        ))
      )}
    </div>
  );
}
