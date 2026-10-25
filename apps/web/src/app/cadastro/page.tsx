"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClientSchema, MIN_AGE_MESSAGE, calculateAge, isValidCPF, onlyDigits } from "@fabrica/shared";
import { api, ApiError } from "@/lib/api";
import { WhatsAppCard } from "@/components/WhatsAppCard";

type DocsMode = { mode: "WHATSAPP" } | { mode: "UPLOAD"; requireProof: boolean; requireSelfie: boolean };
type Verification = DocsMode & { link?: string; message?: string };

const STEPS = ["Conta", "Dados pessoais", "Endereço", "Termos"] as const;

const emptyAddress = { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "" };

export default function CadastroPage() {
  const [step, setStep] = useState(0);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [docs, setDocs] = useState<DocsMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<Verification | null>(null);

  const [account, setAccount] = useState({ email: "", password: "" });
  const [person, setPerson] = useState({ name: "", cpf: "", rg: "", birthDate: "", email: "", whatsapp: "", phone2: "" });
  const [address, setAddress] = useState(emptyAddress);
  const [partyDifferent, setPartyDifferent] = useState(false);
  const [partyAddress, setPartyAddress] = useState(emptyAddress);
  const [terms, setTerms] = useState({ lgpdConsent: false, contractAccepted: false });

  useEffect(() => {
    api<{ user: { email: string; client: unknown } }>("/api/auth/me")
      .then(({ user }) => {
        setLoggedIn(true);
        setPerson((p) => ({ ...p, email: p.email || user.email }));
        setStep(1);
      })
      .catch(() => setLoggedIn(false));
    api<{ documents: DocsMode }>("/api/tenant/public-settings").then((s) => setDocs(s.documents)).catch(() => setDocs({ mode: "WHATSAPP" }));
  }, []);

  // RN01: idade calculada ao vivo.
  const age = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(person.birthDate)) return null;
    return calculateAge(new Date(`${person.birthDate}T00:00:00Z`));
  }, [person.birthDate]);
  const underage = age !== null && age < 18;
  const cpfInvalid = onlyDigits(person.cpf).length === 11 && !isValidCPF(person.cpf);

  async function lookupCep(cep: string, set: typeof setAddress) {
    const digits = onlyDigits(cep);
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
      if (!res.ok) return;
      const d = (await res.json()) as { street?: string; neighborhood?: string; city?: string; state?: string };
      set((a) => ({ ...a, rua: d.street || a.rua, bairro: d.neighborhood || a.bairro, cidade: d.city || a.cidade, estado: d.state || a.estado }));
    } catch {
      // BrasilAPI fora do ar: o cliente preenche à mão.
    }
  }

  async function createAccount() {
    await api("/api/auth/register", { method: "POST", body: JSON.stringify(account) });
    setLoggedIn(true);
    setPerson((p) => ({ ...p, email: p.email || account.email }));
  }

  async function submit() {
    const payload = {
      ...person,
      phone2: person.phone2 || undefined,
      address: { ...address, complemento: address.complemento || undefined },
      partyAddressDifferent: partyDifferent,
      partyAddress: partyDifferent ? { ...partyAddress, complemento: partyAddress.complemento || undefined } : undefined,
      ...terms,
    };
    const check = ClientSchema.safeParse(payload);
    if (!check.success) throw new ApiError(400, check.error.issues[0]?.message ?? "Revise os dados");
    const res = await api<{ documentVerification: Verification }>("/api/clients", { method: "POST", body: JSON.stringify(payload) });
    setDone(res.documentVerification);
  }

  async function next() {
    setError(null);
    setLoading(true);
    try {
      if (step === 0 && !loggedIn) await createAccount();
      if (step === 1) {
        if (underage) throw new ApiError(400, MIN_AGE_MESSAGE);
        if (!isValidCPF(person.cpf)) throw new ApiError(400, "CPF inválido");
      }
      if (step === 3) await submit();
      else setStep((s) => s + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo deu errado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <h1 className="font-serif text-4xl text-white">Cadastro concluído 🎃</h1>
        {done.mode === "WHATSAPP" ? (
          <WhatsAppCard link={done.link} message={done.message} />
        ) : (
          <div className="card text-sm text-neutral-300">
            O envio dos documentos (RG/CNH e comprovante) fica disponível na sua área do cliente. Arquivos criptografados AES-256,
            acesso por link temporário de 15 minutos e auditado.
          </div>
        )}
        <Link href="/" className="btn-ghost">Voltar ao início</Link>
      </div>
    );
  }

  const set = <T extends Record<string, string>>(fn: React.Dispatch<React.SetStateAction<T>>, key: keyof T) =>
    (e: React.ChangeEvent<HTMLInputElement>) => fn((v) => ({ ...v, [key]: e.target.value }));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-4xl text-white">Cadastro de locação</h1>
      <ol className="mt-6 flex gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex-1 rounded-full border px-3 py-1 text-center ${i === step ? "border-gold text-gold" : i < step ? "border-neon-green/50 text-neon-green" : "border-white/10 text-neutral-500"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="card mt-6 space-y-4">
        {error && <p className="alert-error" role="alert">{error}</p>}

        {step === 0 && (
          loggedIn === null ? <p className="text-neutral-400">Carregando...</p> : (
            <>
              <p className="text-sm text-neutral-400">Crie seu acesso para acompanhar reservas e contratos. Já tem conta? <Link href="/login?next=/cadastro" className="text-gold">Entrar</Link></p>
              <Field label="E-mail" type="email" value={account.email} onChange={set(setAccount, "email")} autoComplete="email" />
              <Field label="Senha (mín. 8, com letra e número)" type="password" value={account.password} onChange={set(setAccount, "password")} autoComplete="new-password" />
            </>
          )
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Nome completo" value={person.name} onChange={set(setPerson, "name")} autoComplete="name" /></div>
            <div>
              <Field label="CPF" value={person.cpf} onChange={set(setPerson, "cpf")} inputMode="numeric" placeholder="000.000.000-00" />
              {cpfInvalid && <p className="mt-1 text-xs text-red-300">CPF inválido</p>}
            </div>
            <Field label="RG" value={person.rg} onChange={set(setPerson, "rg")} />
            <div>
              <Field label="Data de nascimento" type="date" value={person.birthDate} onChange={set(setPerson, "birthDate")} />
              {age !== null && (
                <p className={`mt-1 text-xs ${underage ? "text-red-300" : "text-neon-green"}`}>
                  {underage ? MIN_AGE_MESSAGE : `${age} anos`}
                </p>
              )}
            </div>
            <Field label="E-mail" type="email" value={person.email} onChange={set(setPerson, "email")} />
            <Field label="WhatsApp" value={person.whatsapp} onChange={set(setPerson, "whatsapp")} inputMode="tel" placeholder="(21) 90000-0000" />
            <Field label="Telefone secundário (opcional)" value={person.phone2} onChange={set(setPerson, "phone2")} inputMode="tel" />
          </div>
        )}

        {step === 2 && (
          <>
            <AddressFields value={address} onChange={setAddress} onCep={(c) => lookupCep(c, setAddress)} />
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input type="checkbox" checked={partyDifferent} onChange={(e) => setPartyDifferent(e.target.checked)} className="accent-[#D4AF37]" />
              O endereço da festa é diferente
            </label>
            {partyDifferent && (
              <div className="rounded-xl border border-gold/30 p-4">
                <p className="mb-3 font-serif text-lg text-gold">Endereço da festa</p>
                <AddressFields value={partyAddress} onChange={setPartyAddress} onCep={(c) => lookupCep(c, setPartyAddress)} />
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            {docs?.mode === "WHATSAPP" ? (
              <WhatsAppCard />
            ) : (
              <div className="rounded-xl border-2 border-dashed border-gold/50 p-4 text-sm text-neutral-300">
                <p className="font-semibold text-gold">Documentos protegidos · AES-256</p>
                <p className="mt-1">Depois do cadastro você envia RG/CNH (frente e verso){docs?.mode === "UPLOAD" && docs.requireProof ? ", comprovante de residência" : ""}{docs?.mode === "UPLOAD" && docs.requireSelfie ? " e selfie com documento" : ""}. JPG ou PDF até 5 MB.</p>
              </div>
            )}
            <label className="flex items-start gap-2 text-sm text-neutral-300">
              <input type="checkbox" className="mt-1 accent-[#D4AF37]" checked={terms.lgpdConsent} onChange={(e) => setTerms((t) => ({ ...t, lgpdConsent: e.target.checked }))} />
              Li e aceito a Política de Privacidade (LGPD). Meus dados são usados só para a locação e posso pedir exclusão a qualquer momento.
            </label>
            <label className="flex items-start gap-2 text-sm text-neutral-300">
              <input type="checkbox" className="mt-1 accent-[#D4AF37]" checked={terms.contractAccepted} onChange={(e) => setTerms((t) => ({ ...t, contractAccepted: e.target.checked }))} />
              Li e aceito o Contrato de Locação, incluindo multa por atraso, avaria ou extravio dos itens.
            </label>
          </>
        )}

        <div className="flex justify-between pt-2">
          <button type="button" className="btn-ghost" onClick={() => setStep((s) => Math.max(loggedIn ? 1 : 0, s - 1))} disabled={step === 0 || (loggedIn === true && step === 1)}>
            Voltar
          </button>
          <button type="button" className="btn-gold" onClick={next} disabled={loading || (step === 1 && underage) || (step === 3 && !(terms.lgpdConsent && terms.contractAccepted))}>
            {loading ? "Aguarde..." : step === 3 ? "Concluir cadastro" : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input className="field" id={id} {...props} />
    </div>
  );
}

function AddressFields({
  value,
  onChange,
  onCep,
}: {
  value: typeof emptyAddress;
  onChange: React.Dispatch<React.SetStateAction<typeof emptyAddress>>;
  onCep: (cep: string) => void;
}) {
  const upd = (k: keyof typeof emptyAddress) => (e: React.ChangeEvent<HTMLInputElement>) => onChange((a) => ({ ...a, [k]: e.target.value }));
  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <div className="sm:col-span-2"><Field label="CEP" value={value.cep} onChange={upd("cep")} onBlur={(e) => onCep(e.target.value)} inputMode="numeric" placeholder="00000-000" /></div>
      <div className="sm:col-span-4"><Field label="Rua" value={value.rua} onChange={upd("rua")} /></div>
      <div className="sm:col-span-2"><Field label="Número" value={value.numero} onChange={upd("numero")} /></div>
      <div className="sm:col-span-4"><Field label="Complemento" value={value.complemento} onChange={upd("complemento")} /></div>
      <div className="sm:col-span-3"><Field label="Bairro" value={value.bairro} onChange={upd("bairro")} /></div>
      <div className="sm:col-span-2"><Field label="Cidade" value={value.cidade} onChange={upd("cidade")} /></div>
      <div className="sm:col-span-1"><Field label="UF" value={value.estado} onChange={upd("estado")} maxLength={2} /></div>
    </div>
  );
}
