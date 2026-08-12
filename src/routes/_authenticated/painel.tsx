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
  const [defaultTemplate, setDefaultTemplate] = useState("08:00-12:00|14:00-22:00");

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
    const period2Start =
      (patch.period2_start !== undefined
        ? patch.period2_start
        : existing?.period2_start ?? null) || null;
    const period2End =
      (patch.period2_end !== undefined ? patch.period2_end : existing?.period2_end ?? null) ||
      null;
    if (toMinutes(end) <= toMinutes(start)) {
      toast.error("1º período inválido: o fim deve ser após o início.");
      return;
    }
    if (period2Start && period2End && toMinutes(period2End) <= toMinutes(period2Start)) {
      toast.error("2º período inválido: o fim deve ser após o início.");
      return;
    }
    if (
      period2Start &&
      period2End &&
      toMinutes(period2Start) < toMinutes(end)
    ) {
      toast.error("2º período deve começar após o fim do 1º período.");
      return;
    }
    const payload = {
      weekday,
      start_time: start,
      end_time: end,
      period2_start: period2Start,
      period2_end: period2End,
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

  const applyDefaultTemplate = async () => {
    const [period1, period2] = defaultTemplate.split("|");
    const [p1Start, p1End] = (period1 ?? "08:00-12:00").split("-");
    const [p2Start, p2End] = period2 ? period2.split("-") : [null, null];
    for (const [, weekday] of WEEKDAYS.entries()) {
      await upsertDay(weekday, {
        start_time: p1Start ?? "08:00",
        end_time: p1End ?? "12:00",
        period2_start: p2Start ?? null,
        period2_end: p2End ?? null,
      });
    }
    toast.success("Horários padrão aplicados a todos os dias.");
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
          <span className="text-xs text-muted-foreground">Horários padrão</span>
          <select
            className={`${inputClass} min-w-0 flex-1`}
            value={defaultTemplate}
            onChange={(e) => setDefaultTemplate(e.target.value)}
          >
            <option value="08:00-12:00|14:00-22:00">08:00–12:00 + 14:00–22:00</option>
            <option value="09:00-12:00|14:00-18:00">09:00–12:00 + 14:00–18:00</option>
            <option value="08:00-12:00|13:00-18:00">08:00–12:00 + 13:00–18:00</option>
            <option value="10:00-12:00|16:00-20:00">10:00–12:00 + 16:00–20:00</option>
            <option value="08:00-18:00">Dia inteiro (08:00–18:00)</option>
          </select>
          <button
            onClick={applyDefaultTemplate}
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
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => upsertDay(weekday, { active: e.target.checked })}
                      className="size-4 accent-[oklch(0.78_0.13_82)]"
                    />
                    <span className="min-w-16 text-sm">{label}</span>
                  </div>
                  <div className="flex flex-1 items-center justify-end gap-1">
                    <input
                      type="time"
                      disabled={!active}
                      value={normalizeTime(row?.start_time ?? "09:00")}
                      onChange={(e) => upsertDay(weekday, { start_time: e.target.value })}
                      className={`${inputClass} w-20 sm:w-27 disabled:opacity-40`}
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="time"
                      disabled={!active}
                      value={normalizeTime(row?.end_time ?? "18:00")}
                      onChange={(e) => upsertDay(weekday, { end_time: e.target.value })}
                      className={`${inputClass} w-20 sm:w-27 disabled:opacity-40`}
                    />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!row?.period2_start && !!row?.period2_end}
                      disabled={!active}
                      onChange={(e) => {
                        if (e.target.checked) {
                          upsertDay(weekday, {
                            period2_start: row?.period2_start || "14:00",
                            period2_end: row?.period2_end || "18:00",
                          });
                        } else {
                          upsertDay(weekday, { period2_start: null, period2_end: null });
                        }
                      }}
                      className="size-4 accent-[oklch(0.78_0.13_82)] disabled:opacity-40"
                    />
                    <span className="whitespace-nowrap text-xs text-muted-foreground">2º período</span>
                  </div>
                  <div className="flex flex-1 items-center justify-end gap-1">
                    <input
                      type="time"
                      disabled={!active || (!row?.period2_start && !row?.period2_end)}
                      value={normalizeTime(row?.period2_start ?? "")}
                      onChange={(e) =>
                        upsertDay(weekday, { period2_start: e.target.value || null })
                      }
                      className={`${inputClass} w-20 py-1.5 text-xs disabled:opacity-40 sm:w-27`}
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="time"
                      disabled={!active || (!row?.period2_start && !row?.period2_end)}
                      value={normalizeTime(row?.period2_end ?? "")}
                      onChange={(e) =>
                        upsertDay(weekday, { period2_end: e.target.value || null })
                      }
                      className={`${inputClass} w-20 py-1.5 text-xs disabled:opacity-40 sm:w-27`}
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
