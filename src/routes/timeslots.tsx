import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Timeslots } from "@/components/Timeslots";

export const Route = createFileRoute("/timeslots")({
  head: () => ({
    meta: [
      { title: "Timeslots Example — Agenda Aurea" },
      { name: "description", content: "Exemplo do componente de seleção de horários." },
    ],
  }),
  component: TimeslotsPage,
});

function TimeslotsPage() {
  return (
    <div className="mx-auto min-h-screen w-full max-w-lg px-6 pb-12 pt-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <div className="mt-6">
        <Timeslots
          onChange={(time) => {
            console.log("[timeslots] selecionado:", time);
          }}
        />
      </div>
    </div>
  );
}