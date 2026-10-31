"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatBRL, formatDateBR } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import type { ReservationDTO } from "@/lib/reservation-types";
import { StatusBadge } from "@/components/StatusBadge";

export default function MinhasReservasPage() {
  const router = useRouter();
  const [items, setItems] = useState<ReservationDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: ReservationDTO[] }>("/api/reservations")
      .then((r) => setItems(r.items))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace("/login?next=/reservas");
        else setError("Não foi possível carregar suas reservas");
      });
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="fade-up flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-serif text-4xl text-white">Minhas reservas</h1>
        <Link href="/conta/documentos" className="text-sm text-neutral-400 transition-colors hover:text-gold">Meus documentos →</Link>
      </div>
      {error && <p className="alert-error">{error}</p>}
      {!items && !error && <p className="text-neutral-400">Carregando...</p>}
      {items?.length === 0 && (
        <div className="card text-center text-neutral-300">
          Você ainda não tem reservas. <Link href="/#temas" className="text-gold hover:underline">Escolher um tema</Link>
        </div>
      )}
      <ul className="space-y-3">
        {items?.map((r, i) => (
          <li key={r.id} className="fade-up" style={{ ["--i" as string]: i }}>
            <Link href={`/reservas/${r.code}`} className="card flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:border-gold/40">
              <div>
                <p className="font-mono text-xs text-neutral-500">{r.code}</p>
                <p className="font-serif text-xl text-white">
                  {[...r.themes.map((t) => t.theme.name), ...r.characters.map((c) => c.character.name)].join(", ")}
                </p>
                <p className="text-sm text-neutral-400">
                  {r.dealType === "VENDA" ? "Compra · entrega em " : "Festa em "}
                  {formatDateBR(r.eventDate)}
                </p>
              </div>
              <div className="text-right">
                <StatusBadge status={r.status} dealType={r.dealType} />
                <p className="mt-1 font-serif text-xl text-gold">{formatBRL(r.totalPrice)}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
