import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type AuthMode = "login" | "signup" | "reset";

const inputClass =
  "h-12 w-full rounded-xl border border-input bg-card px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary";

function PasswordInput({
  placeholder,
  value,
  onChange,
  required,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className={`${inputClass} pr-12`}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        minLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    modo:
      search['modo'] === "cadastro"
        ? ("cadastro" as const)
        : search['modo'] === "recuperar"
          ? ("recuperar" as const)
          : ("login" as const),
    err: typeof search['err'] === "string" ? search['err'] : undefined,
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
  const { modo, err } = Route.useSearch();
  const [mode, setMode] = useState<AuthMode>(
    modo === "cadastro" ? "signup" : modo === "recuperar" ? "reset" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [oauthError, setOAuthError] = useState<string | null>(err ?? null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) return;
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error || !data.session?.user) {
          throw error ?? new Error("Sessão inválida retornada pelo Google.");
        }
        const { data: roles, error: rolesErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id);
        if (rolesErr) throw rolesErr;
        const isBarber = (roles ?? []).some((r) => r.role === "barber");
        if (active) {
          toast.success(isBarber ? "Bem-vindo(a), barbeiro(a)!" : "Bem-vindo(a)!");
          navigate({ to: isBarber ? "/painel" : "/agendar", replace: true });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : JSON.stringify(e);
        console.error("[auth] Falha ao processar retorno do Google:", e);
        if (active) setOAuthError(msg);
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (mode !== "reset") return;
    let active = true;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && session?.user) setIsRecovery(true);
      if (event === "SIGNED_OUT") setIsRecovery(false);
    });
    supabase.auth.getSession().then(({ data: sd }) => {
      if (active && sd.session?.user) setIsRecovery(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (password.length < 6) {
          throw new Error("A senha precisa ter pelo menos 6 caracteres.");
        }
        if (password !== confirmPassword) {
          throw new Error("As senhas não conferem.");
        }
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
        navigate({ to: "/agendar", replace: true });
        return;
      }

      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/agendar", replace: true });
        return;
      }

      if (isRecovery) {
        if (password.length < 6) {
          throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
        }
        if (password !== confirmPassword) {
          throw new Error("As senhas não conferem.");
        }
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Senha atualizada! Faça login com a nova senha.");
        navigate({ to: "/auth", search: { modo: "login" }, replace: true });
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?modo=recuperar`,
      });
      if (error) throw error;
      toast.success("Enviamos um link de recuperação para o seu e-mail.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível continuar.");
    } finally {
      setBusy(false);
    }
  };

  const buttonLabel = mode === "login" ? "Entrar" : mode === "signup" ? "Cadastrar" : isRecovery ? "Salvar nova senha" : "Enviar link de recuperação";

  const google = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth?modo=${mode === "signup" ? "cadastro" : "login"}`,
      },
    });
    if (error) {
      setBusy(false);
      toast.error("Não foi possível entrar com o Google.");
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-6 pb-12 pt-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Voltar
      </Link>

      <h1 className="mt-8 text-3xl font-semibold text-gradient-gold">
        {mode === "login" ? "Bem-vindo de volta" : mode === "signup" ? "Criar conta" : isRecovery ? "Definir nova senha" : "Recuperar senha"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "login"
          ? "Entre para escolher seu horário."
          : mode === "signup"
            ? "O primeiro cadastro do app se torna o cabeleireiro."
            : isRecovery
              ? "Escolha uma nova senha para a sua conta."
              : "Enviaremos um link no seu e-mail para criar uma nova senha."}
      </p>

      {oauthError ? (
        <div className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" /> Erro ao entrar com o Google
          </div>
          <p className="mt-1 text-sm text-foreground">{oauthError}</p>
        </div>
      ) : null}

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

        {!(mode === "reset" && isRecovery) ? (
          <input
            className={inputClass}
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        ) : null}

        {mode !== "reset" || isRecovery ? (
          <PasswordInput
            placeholder={mode === "reset" ? "Nova senha" : "Senha"}
            value={password}
            onChange={setPassword}
            required
          />
        ) : null}

        {mode === "reset" && isRecovery ? (
          <PasswordInput
            placeholder="Confirmar nova senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
          />
        ) : null}

        {mode === "signup" ? (
          <PasswordInput
            placeholder="Confirmar senha"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
          />
        ) : null}

        {mode === "login" ? (
          <button
            type="button"
            onClick={() => setMode("reset")}
            className="block w-full text-right text-sm text-muted-foreground hover:text-primary"
          >
            Esqueci minha senha
          </button>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-semibold text-primary-foreground shadow-gold disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {buttonLabel}
        </button>
      </form>

      {mode !== "reset" ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={google}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm font-medium text-foreground disabled:opacity-60"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
              />
            </svg>
            Continuar com Google
          </button>
        </>
      ) : null}

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
            Já lembrei minha senha. <span className="text-primary">Entrar</span>
          </>
        )}
      </button>
    </div>
  );
}
