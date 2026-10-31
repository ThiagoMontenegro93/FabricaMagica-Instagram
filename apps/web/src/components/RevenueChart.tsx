"use client";

import { useState } from "react";
import { formatBRL } from "@fabrica/shared";

const MONTH = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const MONTH_LONG = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const label = (ym: string, long = false) => (long ? MONTH_LONG : MONTH).format(new Date(`${ym}-15T12:00:00Z`)).replace(".", "");

/**
 * Faturamento dos últimos 6 meses: uma série, uma cor (ouro), sem legenda.
 * Barras finas com topo arredondado, rótulo só no mês atual, tooltip ao passar o mouse
 * e tabela escondida para leitor de tela.
 */
export function RevenueChart({ series }: { series: { month: string; total: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...series.map((s) => s.total), 1);
  const H = 160;
  const last = series.length - 1;

  return (
    <figure className="space-y-2">
      <figcaption className="text-xs text-neutral-500">Últimos 6 meses</figcaption>
      <div className="relative" onMouseLeave={() => setHover(null)}>
        <div className="flex items-end gap-2 sm:gap-4" style={{ height: H }} aria-hidden>
          {series.map((s, i) => {
            const h = s.total === 0 ? 2 : Math.max(6, Math.round((s.total / max) * (H - 24)));
            const current = i === last;
            return (
              <div
                key={s.month}
                className="relative flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
              >
                {current && s.total > 0 && hover === null && (
                  <span className="absolute text-[11px] tabular-nums text-neutral-300" style={{ bottom: h + 6 }}>
                    {formatBRL(s.total)}
                  </span>
                )}
                <div
                  className={`w-full max-w-10 rounded-t-[4px] transition-[opacity,background-color] duration-150 ${
                    current ? "bg-gold" : "bg-gold/45"
                  } ${hover !== null && hover !== i ? "opacity-40" : "opacity-100"}`}
                  style={{ height: h }}
                />
              </div>
            );
          })}
        </div>
        <div className="h-px bg-white/10" />
        <div className="mt-2 flex gap-2 sm:gap-4" aria-hidden>
          {series.map((s, i) => (
            <span key={s.month} className={`flex-1 text-center text-[11px] capitalize ${i === last ? "text-neutral-300" : "text-neutral-500"}`}>
              {label(s.month)}
            </span>
          ))}
        </div>
        {hover !== null && series[hover] && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-night/95 px-3 py-2 text-xs shadow-xl"
            style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}
          >
            <p className="capitalize text-neutral-400">{label(series[hover].month, true)}</p>
            <p className="tabular-nums text-white">{formatBRL(series[hover].total)}</p>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Faturamento por mês</caption>
        <tbody>
          {series.map((s) => (
            <tr key={s.month}>
              <th scope="row">{label(s.month, true)}</th>
              <td>{formatBRL(s.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
