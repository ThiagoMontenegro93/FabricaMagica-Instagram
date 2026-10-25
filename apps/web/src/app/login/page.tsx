"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const { user } = await api<{ user: { role: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      // Só aceita redirecionamento interno (evita open redirect).
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
      const home = user.role === "SUPER_ADMIN" || user.role === "ATENDENTE" ? "/admin/configuracoes" : "/cadastro";
      router.push(safeNext ?? home);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card mx-auto max-w-md space-y-4">
      <h1 className="font-serif text-3xl text-white">Entrar</h1>
      {error && <p className="alert-error" role="alert">{error}</p>}
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="field" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input className="field" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn-gold w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</button>
      <p className="text-center text-sm text-neutral-400">
        Ainda não tem conta? <Link href="/cadastro" className="text-gold hover:underline">Cadastre-se</Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
