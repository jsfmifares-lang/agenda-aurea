import { useState } from "react";

function toMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

function toLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildTimes(open: string, close: string, intervalMinutes: number): string[] {
  const start = toMinutes(open);
  const end = toMinutes(close);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  if (intervalMinutes <= 0) return [];
  const times: number[] = [];
  for (let t = start; t <= end && times.length < 300; t += intervalMinutes) {
    times.push(t);
  }
  const last = times[times.length - 1];
  if (last !== undefined && last !== end) times.push(end);
  return times.map(toLabel);
}

export type TimeslotsProps = {
  value?: string | null;
  onChange?: (time: string) => void;
  defaultOpen?: string;
  defaultClose?: string;
  defaultInterval?: number;
  defaultSelected?: string;
};

const fieldClass =
  "h-10 rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary";
const slotClass =
  "h-11 rounded-xl border border-transparent bg-sky-100 text-sm font-medium text-sky-700 transition-colors hover:bg-sky-200";
const slotSelectedClass = "bg-sky-600 text-white hover:bg-sky-600";

export function Timeslots({
  value,
  onChange,
  defaultOpen = "09:00",
  defaultClose = "16:00",
  defaultInterval = 45,
  defaultSelected = "14:15",
}: TimeslotsProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [close, setClose] = useState(defaultClose);
  const [interval, setInterval] = useState(defaultInterval);
  const [internalSelected, setInternalSelected] = useState<string | null>(defaultSelected);

  const selected = value !== undefined ? value : internalSelected;
  const slots = buildTimes(open, close, interval);

  const select = (time: string) => {
    setInternalSelected(time);
    onChange?.(time);
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <h2 className="text-xl font-semibold text-gradient-gold">Timeslots Example</h2>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Open at
          <input
            type="time"
            className={fieldClass}
            value={open}
            onChange={(e) => setOpen(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Closes at
          <input
            type="time"
            className={fieldClass}
            value={close}
            onChange={(e) => setClose(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Interval (minutes)
          <input
            type="number"
            min={5}
            step={5}
            className={fieldClass}
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {slots.map((time) => {
          const isSelected = selected === time;
          return (
            <button
              key={time}
              type="button"
              onClick={() => select(time)}
              className={`${slotClass} ${isSelected ? slotSelectedClass : ""}`}
            >
              {time}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Horário selecionado: <span className="font-semibold text-foreground">{selected ?? "—"}</span>
      </p>
    </div>
  );
}