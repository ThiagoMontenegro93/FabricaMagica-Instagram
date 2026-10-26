"use client";

import { useEffect, useState } from "react";
import { OFFER_MODES, OFFER_MODE_LABELS, RETENTION_OPTIONS, type OfferMode } from "@fabrica/shared";
import { centsToReais, reaisToCents } from "@/lib/money";
import { api, ApiError } from "@/lib/api";

interface Settings {
  hostSensitiveDocs: boolean;
  retentionDays: number;
  requireProof: boolean;
  requireSelfie: boolean;
  blockWithoutDocs: boolean;
  weekendMultiplier: number;
  deliveryFeeBase: number;
  defaultOfferMode: OfferMode;
  allowPickup: boolean;
  allowDelivery: boolean;
}

interface Log {
  id: string;
  action: string;
  actorId: string;
  targetId: string;
  createdAt: string;
}

/** RF12 — Configurações > Privacidade e Documentos. */
export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ user: { role: string } }>("/api/auth/me").then(({ user }) => {
      setRole(user.role);
      if (user.role === "SUPER_ADMIN") api<{ items: Log[] }>("/api/admin/audit-logs?take=20").then((r) => setLogs(r.items));
    });
    api<{ settings: Settings }>("/api/tenant/settings").then((r) => setSettings(r.settings));
  }, []);

  if (!settings) return <p className="text-neutral-400">Carregando...</p>;
  const canEdit = role === "SUPER_ADMIN";

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api<{ settings: Settings }>("/api/tenant/settings", { method: "PATCH", body: JSON.stringify(settings) });
      setSettings(r.settings);
      setMsg({ ok: true, text: "Configurações salvas." });
      api<{ items: Log[] }>("/api/admin/audit-logs?take=20").then((x) => setLogs(x.items));
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  const toggle = (k: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]) => setSettings((s) => (s ? { ...s, [k]: !s[k] } : s));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="font-serif text-4xl text-white">Configurações da loja</h1>
      {!canEdit && <p className="alert-error">Somente o dono pode alterar estas configurações.</p>}
      {msg && <p className={msg.ok ? "rounded-lg border border-neon-green/40 bg-green-950/30 px-4 py-3 text-sm text-neon-green" : "alert-error"}>{msg.text}</p>}

      <section className="card space-y-5">
        <h2 className="font-serif text-2xl text-white">Privacidade e documentos</h2>
        <Switch
          label="Hospedar documentos sensíveis na plataforma"
          checked={settings.hostSensitiveDocs}
          onChange={() => toggle("hostSensitiveDocs")}
          disabled={!canEdit}
        />
        {settings.hostSensitiveDocs ? (
          <div className="space-y-4 rounded-xl border border-gold/30 p-4">
            <p className="text-sm text-neutral-300">Documentos criptografados AES-256, URL assinada de 15 min, acesso auditado.</p>
            <div>
              <label className="label" htmlFor="ret">Retenção</label>
              <select
                id="ret"
                className="field"
                value={settings.retentionDays}
                disabled={!canEdit}
                onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}
              >
                {RETENTION_OPTIONS.map((d) => <option key={d} value={d}>{d} dias</option>)}
              </select>
            </div>
            <Switch label="Exigir comprovante de residência" checked={settings.requireProof} onChange={() => toggle("requireProof")} disabled={!canEdit} />
            <Switch label="Exigir selfie com documento" checked={settings.requireSelfie} onChange={() => toggle("requireSelfie")} disabled={!canEdit} />
            <Switch label="Bloquear reserva sem documentos" checked={settings.blockWithoutDocs} onChange={() => toggle("blockWithoutDocs")} disabled={!canEdit} />
          </div>
        ) : (
          <p className="rounded-xl border border-neon-purple/40 p-4 text-sm text-neutral-300">
            Modo econômico: sem armazenamento sensível, validação via WhatsApp. Menor responsabilidade LGPD.
          </p>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="font-serif text-2xl text-white">Aluguel, venda e entrega</h2>
        <p className="text-sm text-neutral-400">
          Padrão para todos os temas. Em cada tema você pode mudar isso em Temas → editar.
        </p>
        <div>
          <label className="label" htmlFor="offer">Como os temas aparecem no site</label>
          <select
            id="offer"
            className="field max-w-xs"
            value={settings.defaultOfferMode}
            disabled={!canEdit}
            onChange={(e) => setSettings({ ...settings, defaultOfferMode: e.target.value as OfferMode })}
          >
            {OFFER_MODES.map((m) => <option key={m} value={m}>{OFFER_MODE_LABELS[m]}</option>)}
          </select>
          <p className="mt-1 text-xs text-neutral-500">Para vender, o tema precisa ter preço de venda.</p>
        </div>
        <Switch
          label="Cliente pode retirar na loja (transporte por conta dele, sem frete)"
          checked={settings.allowPickup}
          onChange={() => toggle("allowPickup")}
          disabled={!canEdit}
        />
        <Switch
          label="A loja entrega e busca (cobra frete)"
          checked={settings.allowDelivery}
          onChange={() => toggle("allowDelivery")}
          disabled={!canEdit}
        />
        <label className="label" htmlFor="frete">Frete cobrado do contratante quando a loja entrega (R$)</label>
        <input
          id="frete"
          className="field max-w-[10rem]"
          inputMode="decimal"
          key={settings.deliveryFeeBase}
          defaultValue={centsToReais(settings.deliveryFeeBase)}
          disabled={!canEdit}
          onBlur={(e) => {
            const v = reaisToCents(e.target.value);
            if (Number.isFinite(v) && v >= 0) setSettings({ ...settings, deliveryFeeBase: v });
          }}
        />
      </section>

      <section className="card space-y-3">
        <h2 className="font-serif text-2xl text-white">Taxa de fim de semana</h2>
        <label className="label" htmlFor="wm">Multiplicador para sexta e sábado (1,3 = +30%)</label>
        <input
          id="wm"
          className="field max-w-[10rem]"
          type="number"
          step="0.05"
          min={1}
          max={3}
          value={settings.weekendMultiplier}
          disabled={!canEdit}
          onChange={(e) => setSettings({ ...settings, weekendMultiplier: Number(e.target.value) })}
        />
      </section>

      {canEdit && (
        <button className="btn-gold" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar configurações"}</button>
      )}

      {canEdit && (
        <section className="card">
          <h2 className="font-serif text-2xl text-white">Logs de acesso</h2>
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-neutral-400">
              <tr><th className="py-2">Quando</th><th>Ação</th><th>Quem</th><th>Alvo</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-white/5">
                  <td className="py-2">{new Date(l.createdAt).toLocaleString("pt-BR")}</td>
                  <td>{l.action}</td>
                  <td className="font-mono text-xs">{l.actorId.slice(-8)}</td>
                  <td className="font-mono text-xs">{l.targetId.slice(-8)}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={4} className="py-4 text-neutral-500">Nenhum registro ainda.</td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-neutral-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        className={`relative h-7 w-12 rounded-full transition ${checked ? "bg-gold" : "bg-neutral-700"} disabled:opacity-50`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-black transition ${checked ? "left-6" : "left-1"}`} />
      </button>
    </label>
  );
}
