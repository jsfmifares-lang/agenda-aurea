import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: Callback,
});

function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const finish = async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));

      const urlError =
        hash.get("error_description") || hash.get("error") || hash.get("error_code");
      if (urlError) {
        setError("Erro retornado pelo Google/Supabase: " + urlError);
        return;
      }

      let session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        const accessToken = hash.get("access_token");
        const refreshToken = hash.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data, error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setErr) {
            setError(
              "Falha ao validar o token: " + (setErr.message || JSON.stringify(setErr)),
            );
            return;
          }
          session = data.session;
        }
      }

      if (!session?.user) {
        setError(
          "Nenhuma sessão encontrada. Tokens na URL: " +
            Array.from(new Set(hash.keys())).join(", "),
        );
        return;
      }

      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      if (rolesErr) {
        setError("Falha ao buscar perfil: " + (rolesErr.message || JSON.stringify(rolesErr)));
        return;
      }

      const isBarber = (roles ?? []).some((r) => r.role === "barber");
      toast.success(isBarber ? "Bem-vindo(a), barbeiro(a)!" : "Bem-vindo(a)!");
      navigate({ to: isBarber ? "/painel" : "/agendar", replace: true });
    };

    void finish();
    return () => {
      active = false;
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6">
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-5" />
            Erro ao entrar com o Google
          </div>
          <p className="mt-2 text-sm text-foreground">{error}</p>
          <button
            onClick={() => navigate({ to: "/auth", search: { modo: "login" }, replace: true })}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Voltar para o login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}
