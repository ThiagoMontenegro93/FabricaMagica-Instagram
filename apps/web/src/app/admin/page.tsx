"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatBRL, formatDateBR, whatsappLink } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { RevenueChart } from "@/components/RevenueChart";
import type { Dashboard, DashboardRow } from "@/server/services/dashboard.service";

const WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const SHORT_DAY = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
const HOUR = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default function AdminHome() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<Dashboard>("/api/admin/dashboard")
        .then((x) => alive && setD(x))
        .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Não foi possível carregar o painel"));
    load();
    // A agenda muda ao longo do dia (pagamentos chegam pelo webhook).
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (error) return <p className="alert-error">{error}</p>;
  if (!d) return <DashboardSkeleton />;

  const raw = WEEKDAY.format(new Date(`${d.today}T12:00:00Z`));
  const todayLabel = raw.charAt(0).toUpperCase() + raw.slice(1);
  const nothingToday = d.toLeave.length + d.toReturn.length + d.late.length === 0;

  return (
    <div className="space-y-10">
      <header className="fade-up flex flex-wrap items-end justify-between gap-4" style={{ "--i": 0 } as React.CSSProperties}>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">Hoje</p>
          <h1 className="font-serif text-4xl text-white sm:text-5xl">{todayLabel}</h1>
        </div>
        <Link href="/admin/reservas" className="btn-ghost px-5 py-2 text-sm">Todas as reservas</Link>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo">
        <Stat i={1} label="Saem hoje" value={d.toLeave.length} hint={d.toLeave.length ? "montar e entregar" : "nada para sair"} />
        <Stat i={2} label="Voltam hoje" value={d.toReturn.length} hint="conferir e dar baixa" />
        <Stat i={3} label="Atrasadas" value={d.late.length} hint={d.late.length ? "cobrar devolução" : "tudo em dia"} tone={d.late.length ? "alert" : undefined} />
        <Stat i={4} label="Aguardando pagamento" value={d.pending.count} hint={d.pending.count ? formatBRL(d.pending.total) : "nenhuma"} />
      </section>

      {d.finance && (
        <section className="fade-up grid gap-4 lg:grid-cols-[1fr_320px]" style={{ "--i": 5 } as React.CSSProperties} aria-label="Faturamento">
          <div className="card space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-neutral-500">Faturamento do mês</p>
                <p className="font-serif text-5xl text-gold tabular-nums">{formatBRL(d.finance.revenue)}</p>
              </div>
              <dl className="flex gap-6 text-sm">
                <div><dt className="text-neutral-500">Reservas pagas</dt><dd className="text-lg tabular-nums text-white">{d.finance.count}</dd></div>
                <div><dt className="text-neutral-500">Ticket médio</dt><dd className="text-lg tabular-nums text-white">{formatBRL(d.finance.averageTicket)}</dd></div>
                <div><dt className="text-neutral-500">Multas e avarias</dt><dd className="text-lg tabular-nums text-white">{formatBRL(d.finance.extras)}</dd></div>
              </dl>
            </div>
            <RevenueChart series={d.finance.series} />
          </div>
          <div className="space-y-4">
            <div className="card space-y-3">
              <p className="text-xs uppercase tracking-wider text-neutral-500">Temas mais pedidos no mês</p>
              {d.finance.topThemes.length === 0 ? (
                <p className="text-sm text-neutral-500">Ainda sem reservas pagas neste mês.</p>
              ) : (
                <ol className="space-y-2">
                  {d.finance.topThemes.map((t, i) => (
                    <li key={t.name} className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/40 font-serif text-sm text-gold">{i + 1}</span>
                      <span className="flex-1 truncate text-white">{t.name}</span>
                      <span className="text-sm tabular-nums text-neutral-400">{t.quantity}×</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className={`card space-y-3 ${d.finance.reviews.length ? "border-amber-500/40" : ""}`}>
              <p className="text-xs uppercase tracking-wider text-neutral-500">Pagamentos para conferir</p>
              {d.finance.reviews.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-neutral-400"><span aria-hidden className="text-neon-green">✓</span> Nada pendente nos últimos 30 dias.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {d.finance.reviews.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="text-amber-200"><span aria-hidden>⚠ </span>{r.reason}</span>
                      {r.code ? <Link className="font-mono text-gold hover:underline" href={`/admin/reservas/${r.reservationId}`}>{r.code}</Link> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-3" aria-label="Agenda de hoje">
        <Column i={6} title="Saem hoje" empty="Nenhuma saída hoje." rows={d.toLeave} kind="leave" />
        <Column i={7} title="Voltam hoje" empty="Nenhuma devolução hoje." rows={d.toReturn} kind="return" />
        <Column i={8} title="Atrasadas" empty="Nenhum atraso. Ótimo!" rows={d.late} kind="late" />
      </section>
      {nothingToday && <p className="-mt-4 text-center text-sm text-neutral-500">Dia tranquilo. Aproveite para cadastrar fotos novas nos temas.</p>}

      <section className="fade-up space-y-3" style={{ "--i": 9 } as React.CSSProperties} aria-label="Próximos 7 dias">
        <h2 className="font-serif text-2xl text-white">Próximos 7 dias</h2>
        {d.upcoming.length === 0 ? (
          <p className="card text-sm text-neutral-500">Nenhuma festa marcada para a semana.</p>
        ) : (
          <ul className="card divide-y divide-white/5 p-0">
            {d.upcoming.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/reservas/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-white/[0.03]">
                  <span className="w-28 shrink-0 text-sm capitalize text-neutral-400">{SHORT_DAY.format(new Date(`${r.eventDate}T12:00:00Z`))}</span>
                  <span className="min-w-0 flex-1 truncate text-white">{r.items.join(" + ")}</span>
                  <span className="text-sm text-neutral-400">{r.client.name}</span>
                  <StatusBadge status={r.status} dealType={r.dealType} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ i, label, value, hint, tone }: { i: number; label: string; value: number; hint: string; tone?: "alert" }) {
  return (
    <div
      className={`card fade-up space-y-1 ${tone === "alert" ? "border-red-500/40 bg-red-950/20" : ""}`}
      style={{ "--i": i } as React.CSSProperties}
    >
      <p className="text-xs uppercase tracking-wider text-neutral-500">{label}</p>
      <p className={`font-serif text-4xl tabular-nums ${tone === "alert" ? "text-red-300" : "text-white"}`}>{value}</p>
      <p className="truncate text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

function Column({ i, title, empty, rows, kind }: { i: number; title: string; empty: string; rows: DashboardRow[]; kind: "leave" | "return" | "late" }) {
  return (
    <div className="fade-up space-y-3" style={{ "--i": i } as React.CSSProperties}>
      <h2 className="flex items-center gap-2 font-serif text-2xl text-white">
        {title}
        {rows.length > 0 && <span className="chip">{rows.length}</span>}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-neutral-500">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className={`card space-y-2 p-4 ${kind === "late" ? "border-red-500/30" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/admin/reservas/${r.id}`} className="font-mono text-sm text-gold hover:underline">{r.code}</Link>
                <span className="text-xs text-neutral-500">
                  {kind === "leave" ? (r.deliveryType === "ENTREGA" ? "Loja entrega" : "Cliente retira") : `Devolução ${formatDateBR(r.returnDate)}`}
                </span>
              </div>
              <p className="text-white">{r.items.join(" + ")}</p>
              {kind === "leave" && r.characterTimes.length > 0 && (
                <p className="text-xs text-neon-pink">
                  {r.characterTimes.map((c) => `${c.name} às ${HOUR.format(new Date(c.startsAt))}`).join(" · ")}
                </p>
              )}
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-neutral-400">{r.client.name}</span>
                <a
                  className="shrink-0 text-neutral-300 underline-offset-4 hover:text-gold hover:underline"
                  href={whatsappLink(`Olá ${r.client.name.split(" ")[0]}! Aqui é da Fábrica Mágica, sobre a reserva ${r.code}.`, r.client.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
      <div className="h-12 w-72 animate-pulse rounded-lg bg-white/5" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((k) => <div key={k} className="h-28 animate-pulse rounded-2xl bg-white/5" />)}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}
