import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      console.error("[auth] getUser falhou:", error);
      throw redirect({
        to: "/auth",
        search: {
          modo: "login",
          err: error ? error.message : "Nenhuma sessão ativa",
        },
      });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
