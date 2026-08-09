import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: Callback,
});

function Callback() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const finish = async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const error = hash.get("error_description") || hash.get("error");
      if (error) {
        toast.error("Não foi possível entrar com o Google: " + error);
        navigate({ to: "/auth", search: { modo: "login" }, replace: true });
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
            toast.error("Não foi possível entrar com o Google.");
            navigate({ to: "/auth", search: { modo: "login" }, replace: true });
            return;
          }
          session = data.session;
        }
      }

      if (!session?.user) {
        toast.error("Não foi possível entrar com o Google.");
        navigate({ to: "/auth", search: { modo: "login" }, replace: true });
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      const isBarber = (roles ?? []).some((r) => r.role === "barber");
      navigate({ to: isBarber ? "/painel" : "/agendar", replace: true });
    };

    void finish();
    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}
