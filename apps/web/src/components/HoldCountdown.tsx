"use client";

import { useEffect, useState } from "react";

/** Contagem do tempo que o estoque fica guardado enquanto o cliente paga. */
export function HoldCountdown({ until, onExpire }: { until: string; onExpire?: () => void }) {
  const [left, setLeft] = useState(() => new Date(until).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const ms = new Date(until).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [until, onExpire]);
  if (left <= 0) return <span className="text-red-300">Prazo de pagamento encerrado</span>;
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className="tabular-nums">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
