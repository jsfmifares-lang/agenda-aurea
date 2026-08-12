import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

if (
  typeof window !== "undefined" &&
  window.location.hash.includes("access_token")
) {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

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
  const [mode, setMode] = useState<AuthMode>(
    modo === "cadastro" ? "signup" : modo === "recuperar" ? "reset" : "login",
  );
  const [email, setEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes("access_token")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { error } = await supabase.auth.getUser();
      if (error) {
        console.warn("[auth] Sessão quebrada encontrada, limpando:", error);
        await supabase.auth.signOut().catch(() => {});
      }
    })();
  }, []);

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
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName, phone },
          },
        });
        if (error) throw error;
        if (signUpData.user) {
          await supabase.from("profiles").upsert({
            id: signUpData.user.id,
            email: email,
            full_name: fullName,
            phone,
          });
        }
        if (!signUpData.session) {
          toast.success("Conta criada! Confirme seu e-mail para entrar.");
          setMode("login");
          return;
        }
        toast.success("Conta criada! Bem-vindo(a).");
        navigate({ to: "/agendar", replace: true });
        return;
      }

      if (mode === "login") {
        if (!loginName.trim()) {
          throw new Error("Digite seu nome.");
        }
        const { data: results, error: rpcError } = await supabase.rpc("lookup_email_by_name", {
          search_name: loginName.trim(),
        });
        if (rpcError) throw rpcError;
        if (!results || results.length === 0) {
          throw new Error("Nenhum usuário encontrado com esse nome.");
        }
        if (results.length > 1) {
          throw new Error("Mais de um usuário com esse nome. Use o e-mail para entrar.");
        }
        const userEmail = results[0]?.email;
        if (!userEmail) {
          throw new Error("E-mail não encontrado para esse usuário.");
        }
        const { error } = await supabase.auth.signInWithPassword({ email: userEmail, password });
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
          mode === "login" ? (
            <input
              className={inputClass}
              placeholder="Seu nome"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
              required
            />
          ) : (
            <input
              className={inputClass}
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )
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
