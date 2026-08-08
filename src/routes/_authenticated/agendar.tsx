import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppShell } from "@/components/AppShell";
import {
  buildSlots,
  confirmationMessage,
  formatDateLong,
  nextDays,
  normalizeTime,
  whatsappLink,
  type AvailabilityRow,
} from "@/lib/booking";

export const Route = createFileRoute("/_authenticated/agendar")({
  head: () => ({
    meta: [
      { title: "Agendar horário — Agenda Aurea" },
      {
        name: "description",
        content: "Escolha o dia e a hora disponíveis e confirme pelo WhatsApp.",
      },
      { property: "og:title", content: "Agendar horário — Agenda Aurea" },
      {
        property: "og:description",
        content: "Escolha o dia e a hora disponíveis e confirme pelo WhatsApp.",
      },
    ],
  }),
  component: AgendarPage,
});

function AgendarPage() {
  const { user, isBarber, profile } = useSession();
  const queryClient = useQueryClient();
  const days = useMemo(() => nextDays(21), []);
  const [selectedDate, setSelectedDate] = useState(days[0] as string);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const base = useQuery({
    queryKey: ["booking-base"],
    queryFn: async () => {
      const [settings, availability, services, blocked] = await Promise.all([
        supabase.from("salon_settings").select("*").maybeSingle(),
        supabase.from("availability").select("*").eq("active", true),
        supabase.from("services").select("*").eq("active", true).order("name"),
        supabase.from("blocked_dates").select("date"),
      ]);
      return {
        settings: settings.data,
        availability: (availability.data ?? []) as AvailabilityRow[],
        services: services.data ?? [],
        blocked: (blocked.data ?? []).map((b) => b.date),
      };
    },
  });

  const taken = useQuery({
    queryKey: ["taken", selectedDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("start_time, status")
        .eq("date", selectedDate)
        .neq("status", "cancelled");
      return (data ?? []).map((a) => normalizeTime(a.start_time));
    },
  });

  const slotMinutes = base.data?.settings?.slot_minutes ?? 30;
  const isBlocked = base.data?.blocked.includes(selectedDate) ?? false;
  const weekday = new Date(`${selectedDate}T12:00:00`).getDay();
  const slots = base.data ? buildSlots(base.data.availability, weekday, slotMinutes) : [];
  const nowKey = new Date();
  const isToday = selectedDate === nextDays(1)[0];

  const book = async (time: string) => {
    if (!user) return;
    setSaving(time);
    try {
      const service = base.data?.services.find((s) => s.id === serviceId);
      const { error } = await supabase.from("appointments").insert({
        client_id: user.id,
        service_id: serviceId,
        date: selectedDate,
        start_time: time,
        duration_minutes: service?.duration_minutes ?? slotMinutes,
        client_name: profile?.full_name ?? user.email ?? "Cliente",
        client_phone: profile?.phone ?? "",
      });
      if (error) {
        toast.error(
          error.code === "23505"
            ? "Esse horário acabou de ser reservado. Escolha outro."
            : "Não foi possível agendar.",
        );
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["taken", selectedDate] });
      await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });

      const message = confirmationMessage({
        salonName: base.data?.settings?.salon_name ?? "Salão",
        clientName: profile?.full_name ?? "Cliente",
        dateKey: selectedDate,
        time,
        ...(service ? { serviceName: service.name } : {}),
      });
      const phone = base.data?.settings?.whatsapp ?? "";
      if (phone) {
        window.open(whatsappLink(phone, message), "_blank", "noopener");
        toast.success("Horário reservado! Confirme no WhatsApp.");
      } else {
        toast.success("Horário reservado!");
      }
    } finally {
      setSaving(null);
    }
  };

  return (
    <AppShell
      title="Agendar"
      subtitle={base.data?.settings?.salon_name ?? "Escolha o dia e a hora"}
      isBarber={isBarber}
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <div className="flex gap-2 pb-2">
          {days.map((day) => {
            const d = new Date(`${day}T12:00:00`);
            const active = day === selectedDate;
            return (
              <button
                key={day}
                onClick={() => setSelectedDate(day)}
                className={`flex min-w-16 flex-col items-center rounded-2xl border px-3 py-3 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-gold"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                <span className="text-[11px] uppercase">
                  {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                </span>
                <span className="text-lg font-semibold">{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {(base.data?.services.length ?? 0) > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-muted-foreground">Serviço (opcional)</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {base.data?.services.map((service) => {
              const active = service.id === serviceId;
              return (
                <button
                  key={service.id}
                  onClick={() => setServiceId(active ? null : service.id)}
                  className={`rounded-full border px-4 py-2 text-sm ${
                    active
                      ? "border-primary text-primary"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {service.name} · R$ {Number(service.price).toFixed(2)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-7">
        <h2 className="text-sm font-medium text-muted-foreground">
          Horários — {formatDateLong(selectedDate)}
        </h2>

        {base.isLoading || taken.isLoading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : isBlocked ? (
          <p className="mt-6 surface-card rounded-2xl p-5 text-sm text-muted-foreground">
            O salão está fechado nesta data.
          </p>
        ) : slots.length === 0 ? (
          <p className="mt-6 surface-card rounded-2xl p-5 text-sm text-muted-foreground">
            Nenhum horário definido para este dia.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {slots.map((slot) => {
              const busy = (taken.data ?? []).includes(slot);
              const past =
                isToday &&
                Number(slot.slice(0, 2)) * 60 + Number(slot.slice(3, 5)) <=
                  nowKey.getHours() * 60 + nowKey.getMinutes();
              const disabled = busy || past || saving !== null;
              return (
                <button
                  key={slot}
                  disabled={disabled}
                  onClick={() => book(slot)}
                  className={`h-12 rounded-xl border text-sm font-medium transition-colors ${
                    disabled
                      ? "border-border bg-muted text-muted-foreground line-through opacity-60"
                      : "border-primary/40 bg-card text-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {saving === slot ? (
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  ) : (
                    slot
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" />
        Ao escolher um horário, abrimos o WhatsApp com a confirmação pronta para enviar ao
        salão.
      </p>
    </AppShell>
  );
}
