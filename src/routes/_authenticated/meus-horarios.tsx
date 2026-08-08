import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppShell } from "@/components/AppShell";
import { formatDateLong, normalizeTime } from "@/lib/booking";

export const Route = createFileRoute("/_authenticated/meus-horarios")({
  head: () => ({
    meta: [
      { title: "Meus horários — Agenda Aurea" },
      { name: "description", content: "Veja e cancele seus agendamentos no salão." },
      { property: "og:title", content: "Meus horários — Agenda Aurea" },
      { property: "og:description", content: "Veja e cancele seus agendamentos no salão." },
    ],
  }),
  component: MeusHorarios,
});

function MeusHorarios() {
  const { user, isBarber } = useSession();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["my-appointments", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("*, services(name)")
        .eq("client_id", user!.id)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });
      return data ?? [];
    },
  });

  const cancel = async (id: string) => {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("Não foi possível cancelar.");
      return;
    }
    toast.success("Agendamento cancelado.");
    await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    await queryClient.invalidateQueries({ queryKey: ["taken"] });
  };

  return (
    <AppShell title="Meus horários" subtitle="Seus agendamentos" isBarber={isBarber}>
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <p className="surface-card rounded-2xl p-5 text-sm text-muted-foreground">
          Você ainda não tem agendamentos.
        </p>
      ) : (
        <ul className="space-y-3">
          {data!.map((item) => (
            <li key={item.id} className="surface-card rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {normalizeTime(item.start_time)} · {formatDateLong(item.date)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.services?.name ?? "Atendimento"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    item.status === "cancelled"
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {item.status === "cancelled"
                    ? "Cancelado"
                    : item.status === "done"
                      ? "Concluído"
                      : "Confirmado"}
                </span>
              </div>
              {item.status === "confirmed" ? (
                <button
                  onClick={() => cancel(item.id)}
                  className="mt-3 text-sm text-destructive"
                >
                  Cancelar horário
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
