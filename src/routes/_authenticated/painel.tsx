import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { AppShell } from "@/components/AppShell";
import {
  WEEKDAYS,
  formatDateLong,
  normalizeTime,
  toMinutes,
  type AvailabilityRow,
} from "@/lib/booking";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Painel do cabeleireiro — Agenda Aurea" },
      {
        name: "description",
        content: "Defina dias, horários, intervalo entre atendimentos e veja a agenda.",
      },
      { property: "og:title", content: "Painel do cabeleireiro — Agenda Aurea" },
      {
        property: "og:description",
        content: "Defina dias, horários, intervalo entre atendimentos e veja a agenda.",
      },
    ],
  }),
  component: Painel,
});

const inputClass =
  "h-11 rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary";

function Painel() {
  const { isBarber, loading } = useSession();
  const queryClient = useQueryClient();
  const [salonName, setSalonName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [blockDate, setBlockDate] = useState("");
  const [defaultLunch, setDefaultLunch] = useState("none");

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("salon_settings").select("*").maybeSingle()).data,
  });

  const availability = useQuery({
    queryKey: ["availability-all"],
    queryFn: async () =>
      ((await supabase.from("availability").select("*").order("weekday")).data ??
        []) as AvailabilityRow[],
  });

  const blocked = useQuery({
    queryKey: ["blocked"],
    queryFn: async () =>
      (await supabase.from("blocked_dates").select("*").order("date")).data ?? [],
  });

  const agenda = useQuery({
    queryKey: ["agenda"],
    queryFn: async () =>
      (
        await supabase
          .from("appointments")
          .select("*, services(name)")
          .neq("status", "cancelled")
          .gte("date", new Date().toISOString().slice(0, 10))
          .order("date")
          .order("start_time")
      ).data ?? [],
  });

  useEffect(() => {
    if (settings.data) {
      setSalonName(settings.data.salon_name);
      setWhatsapp(settings.data.whatsapp);
      setSlotMinutes(settings.data.slot_minutes);
    }
  }, [settings.data]);

  if (loading) {
    return (
      <AppShell title="Painel" isBarber>
        <Loader2 className="mx-auto mt-10 size-6 animate-spin text-primary" />
      </AppShell>
    );
  }

  if (!isBarber) {
    return (
      <AppShell title="Painel">
        <p className="surface-card rounded-2xl p-5 text-sm text-muted-foreground">
          Esta área é exclusiva do cabeleireiro.
        </p>
      </AppShell>
    );
  }

  const saveSettings = async () => {
    const { error } = await supabase
      .from("salon_settings")
      .update({ salon_name: salonName, whatsapp, slot_minutes: slotMinutes, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) {
      toast.error("Não foi possível salvar.");
      return;
    }
    toast.success("Configurações salvas.");
    await queryClient.invalidateQueries({ queryKey: ["settings"] });
    await queryClient.invalidateQueries({ queryKey: ["booking-base"] });
  };

  const upsertDay = async (weekday: number, patch: Partial<AvailabilityRow>) => {
    const existing = (availability.data ?? []).find((a) => a.weekday === weekday);
    const start = patch.start_time?.trim() ? patch.start_time : existing?.start_time ?? "09:00";
    const end = patch.end_time?.trim() ? patch.end_time : existing?.end_time ?? "18:00";
    const lunchStart =
      (patch.lunch_start !== undefined ? patch.lunch_start : existing?.lunch_start ?? null) ||
      null;
    const lunchEnd =
      (patch.lunch_end !== undefined ? patch.lunch_end : existing?.lunch_end ?? null) || null;
    if (toMinutes(end) <= toMinutes(start)) {
      toast.error("Horário inválido: o fim deve ser após o início.");
      return;
    }
    if (lunchStart && lunchEnd && toMinutes(lunchEnd) <= toMinutes(lunchStart)) {
      toast.error("Almoço inválido: o fim deve ser após o início.");
      return;
    }
    if (
      lunchStart &&
      lunchEnd &&
      (toMinutes(lunchStart) < toMinutes(start) || toMinutes(lunchEnd) > toMinutes(end))
    ) {
      toast.error("Almoço inválido: deve ficar dentro do horário de trabalho.");
      return;
    }
    const payload = {
      weekday,
      start_time: start,
      end_time: end,
      lunch_start: lunchStart,
      lunch_end: lunchEnd,
      active: patch.active ?? existing?.active ?? true,
    };
    const { error } = existing
      ? await supabase.from("availability").update(payload).eq("id", existing.id)
      : await supabase.from("availability").insert(payload);
    if (error) {
      toast.error(
        "Não foi possível salvar esse dia: " + (error.message ?? JSON.stringify(error)),
      );
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["availability-all"] });
    await queryClient.invalidateQueries({ queryKey: ["booking-base"] });
  };

  const applyDefaultLunch = async () => {
    let start: string | null = null;
    let end: string | null = null;
    if (defaultLunch !== "none") {
      const [s, e] = defaultLunch.split("-");
      start = s ?? null;
      end = e ?? null;
    }
    for (const [, weekday] of WEEKDAYS.entries()) {
      await upsertDay(weekday, { lunch_start: start, lunch_end: end });
    }
    toast.success("Almoço padrão aplicado a todos os dias.");
  };

  const addBlocked = async () => {
    if (!blockDate) return;
    const { error } = await supabase.from("blocked_dates").insert({ date: blockDate });
    if (error) {
      toast.error("Data já bloqueada.");
      return;
    }
    setBlockDate("");
    await queryClient.invalidateQueries({ queryKey: ["blocked"] });
    await queryClient.invalidateQueries({ queryKey: ["booking-base"] });
  };

  const removeBlocked = async (id: string) => {
    await supabase.from("blocked_dates").delete().eq("id", id);
    await queryClient.invalidateQueries({ queryKey: ["blocked"] });
    await queryClient.invalidateQueries({ queryKey: ["booking-base"] });
  };

  const cancelAppointment = async (id: string) => {
    await supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
    toast.success("Agendamento cancelado.");
    await queryClient.invalidateQueries({ queryKey: ["agenda"] });
    await queryClient.invalidateQueries({ queryKey: ["taken"] });
  };

  return (
    <AppShell title="Painel" subtitle="Configure sua agenda" isBarber>
      <section className="surface-card rounded-2xl p-5">
        <h2 className="text-lg font-semibold">Salão</h2>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Nome do salão
            <input
              className={inputClass}
              value={salonName}
              onChange={(e) => setSalonName(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            WhatsApp do salão (DDD + número)
            <input
              className={inputClass}
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Intervalo entre horários
            <select
              className={inputClass}
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(Number(e.target.value))}
            >
              {[15, 20, 30, 40, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m} em {m} minutos
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={saveSettings}
            className="h-11 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-gold"
          >
            Salvar
          </button>
        </div>
      </section>

      <section className="mt-5 surface-card rounded-2xl p-5">
        <h2 className="text-lg font-semibold">Dias e horários</h2>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
          <span className="text-xs text-muted-foreground">Almoço padrão</span>
          <select
            className={`${inputClass} min-w-36 flex-1`}
            value={defaultLunch}
            onChange={(e) => setDefaultLunch(e.target.value)}
          >
            <option value="none">Sem almoço</option>
            <option value="11:30-13:00">11:30 — 13:00</option>
            <option value="12:00-13:00">12:00 — 13:00</option>
            <option value="12:00-13:30">12:00 — 13:30</option>
            <option value="12:30-14:00">12:30 — 14:00</option>
          </select>
          <button
            onClick={applyDefaultLunch}
            className="h-11 rounded-xl border border-primary px-4 text-sm text-primary"
          >
            Aplicar a todos
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {WEEKDAYS.map((label, weekday) => {
            const row = (availability.data ?? []).find((a) => a.weekday === weekday);
            const active = row?.active ?? false;
            return (
              <div
                key={label}
                className="rounded-xl border border-border/70 p-3"
              >
                <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => upsertDay(weekday, { active: e.target.checked })}
                      className="size-4 accent-[oklch(0.78_0.13_82)]"
                    />
                    <span className="text-sm">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      disabled={!active}
                      value={normalizeTime(row?.start_time ?? "09:00")}
                      onChange={(e) => upsertDay(weekday, { start_time: e.target.value })}
                      className={`${inputClass} w-27 disabled:opacity-40`}
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="time"
                      disabled={!active}
                      value={normalizeTime(row?.end_time ?? "18:00")}
                      onChange={(e) => upsertDay(weekday, { end_time: e.target.value })}
                      className={`${inputClass} w-27 disabled:opacity-40`}
                    />
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-3 pl-7">
                  <span className="text-xs text-muted-foreground">Almoço</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      disabled={!active}
                      value={normalizeTime(row?.lunch_start ?? "")}
                      onChange={(e) => upsertDay(weekday, { lunch_start: e.target.value || null })}
                      className={`${inputClass} w-27 py-1.5 text-xs disabled:opacity-40`}
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="time"
                      disabled={!active}
                      value={normalizeTime(row?.lunch_end ?? "")}
                      onChange={(e) => upsertDay(weekday, { lunch_end: e.target.value || null })}
                      className={`${inputClass} w-27 py-1.5 text-xs disabled:opacity-40`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-5 surface-card rounded-2xl p-5">
        <h2 className="text-lg font-semibold">Folgas</h2>
        <div className="mt-3 flex gap-2">
          <input
            type="date"
            value={blockDate}
            onChange={(e) => setBlockDate(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <button
            onClick={addBlocked}
            className="h-11 rounded-xl border border-primary px-4 text-sm text-primary"
          >
            Bloquear
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {(blocked.data ?? []).map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-xl bg-secondary px-3 py-2 text-sm"
            >
              {formatDateLong(b.date)}
              <button onClick={() => removeBlocked(b.id)} aria-label="Remover">
                <Trash2 className="size-4 text-destructive" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5 surface-card rounded-2xl p-5">
        <h2 className="text-lg font-semibold">Próximos atendimentos</h2>
        {(agenda.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento futuro.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {agenda.data!.map((item) => (
              <li key={item.id} className="rounded-xl bg-secondary p-3">
                <p className="text-sm font-semibold">
                  {normalizeTime(item.start_time)} · {formatDateLong(item.date)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.client_name || "Cliente"} · {item.client_phone || "sem telefone"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.services?.name ?? "Atendimento"}
                </p>
                <button
                  onClick={() => cancelAppointment(item.id)}
                  className="mt-2 text-xs text-destructive"
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
