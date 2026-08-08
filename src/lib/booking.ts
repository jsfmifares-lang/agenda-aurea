export const WEEKDAYS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

export type AvailabilityRow = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  active: boolean;
};

/** "09:00:00" -> 540 */
export function toMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

export function toTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Local YYYY-MM-DD (não usa toISOString para evitar deslocamento de fuso). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDateLong(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

export function buildSlots(
  rules: AvailabilityRow[],
  weekday: number,
  slotMinutes: number,
): string[] {
  const slots: string[] = [];
  for (const rule of rules) {
    if (!rule.active || rule.weekday !== weekday) continue;
    const start = toMinutes(rule.start_time);
    const end = toMinutes(rule.end_time);
    for (let t = start; t + slotMinutes <= end; t += slotMinutes) {
      const label = toTimeLabel(t);
      if (!slots.includes(label)) slots.push(label);
    }
  }
  return slots.sort();
}

export function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Monta o link do WhatsApp com a confirmação do agendamento. */
export function whatsappLink(phone: string, message: string): string {
  const digits = onlyDigits(phone);
  const withCountry = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function confirmationMessage(params: {
  salonName: string;
  clientName: string;
  dateKey: string;
  time: string;
  serviceName?: string;
}): string {
  const service = params.serviceName ? ` (${params.serviceName})` : "";
  return `Olá! Sou ${params.clientName}. Confirmo meu horário no ${params.salonName} para ${formatDateLong(params.dateKey)} às ${params.time}${service}. Obrigado!`;
}

export function nextDays(count: number): string[] {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return toDateKey(d);
  });
}
