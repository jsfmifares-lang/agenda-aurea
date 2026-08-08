import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    modo: search['modo'] === "cadastro" ? ("cadastro" as const) : ("login" as const),
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Agenda Aurea" },
      { name: "description", content: "Acesse sua conta para agendar horários no salão." },
      { property: "og:title", content: "Entrar — Agenda Aurea" },
      {
        property: "og:description",
        content: "Acesse sua conta para agendar horários no salão.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { modo } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">(
    modo === "cadastro" ? "signup" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const inputClass =
    "h-12 w-full rounded-xl border border-input bg-card px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, phone },
          },
        });
        if (error) throw error;
        toast.success("Conta criada! Bem-vindo(a).");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/agendar", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-6 pb-12 pt-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Voltar
      </Link>

      <h1 className="mt-8 text-3xl font-semibold text-gradient-gold">
        {mode === "login" ? "Bem-vindo de volta" : "Criar conta"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "login"
          ? "Entre para escolher seu horário."
          : "O primeiro cadastro do app se torna o cabeleireiro."}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        {mode === "signup" ? (
          <>
            <input
              className={inputClass}
              placeholder="Seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <input
              className={inputClass}
              placeholder="WhatsApp (DDD + número)"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </>
        ) : null}
        <input
          className={inputClass}
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={inputClass}
          type="password"
          placeholder="Senha"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-gold disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === "login" ? "Entrar" : "Cadastrar"}
        </button>
      </form>

      <button
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="mt-8 w-full text-center text-sm text-muted-foreground"
      >
        {mode === "login" ? (
          <>
            Não tem conta? <span className="text-primary">Cadastre-se</span>
          </>
        ) : (
          <>
            Já tem conta? <span className="text-primary">Entrar</span>
          </>
        )}
      </button>
    </div>
  );
}
