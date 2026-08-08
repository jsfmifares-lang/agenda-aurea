import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CalendarCheck, Clock, MessageCircle } from "lucide-react";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agenda Aurea — Agendamento para cabeleireiro" },
      {
        name: "description",
        content:
          "Agende seu horário no salão em segundos: escolha o dia, a hora e receba a confirmação pelo WhatsApp.",
      },
      { property: "og:title", content: "Agenda Aurea — Agendamento para cabeleireiro" },
      {
        property: "og:description",
        content:
          "Agende seu horário no salão em segundos: escolha o dia, a hora e receba a confirmação pelo WhatsApp.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { user, isBarber, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: isBarber ? "/painel" : "/agendar", replace: true });
    }
  }, [loading, user, isBarber, navigate]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-between px-6 pb-10 pt-16">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-primary">Salão &amp; Barbearia</p>
        <h1 className="mt-4 text-5xl leading-tight font-semibold">
          <span className="text-gradient-gold">Agenda Aurea</span>
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Escolha o dia e a hora disponíveis do seu cabeleireiro e receba a confirmação
          direto no WhatsApp.
        </p>

        <ul className="mt-10 space-y-4">
          {[
            { icon: CalendarCheck, text: "Agenda sempre atualizada, sem horário duplicado" },
            { icon: Clock, text: "Intervalos definidos pelo profissional (20, 30, 45 min…)" },
            { icon: MessageCircle, text: "Confirmação enviada pelo WhatsApp" },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 surface-card rounded-2xl p-4">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="text-sm text-secondary-foreground">{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-12 grid gap-3">
        <Link
          to="/auth"
          search={{ modo: "cadastro" }}
          className="inline-flex h-14 items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-gold transition-opacity hover:opacity-90"
        >
          Criar conta
        </Link>
        <Link
          to="/auth"
          search={{ modo: "login" }}
          className="inline-flex h-13 items-center justify-center rounded-2xl border border-border bg-card text-base font-medium text-foreground"
        >
          Já tenho conta — Entrar
        </Link>
      </div>
    </div>
  );
}
