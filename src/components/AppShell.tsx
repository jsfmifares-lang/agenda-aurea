import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { CalendarPlus, CalendarDays, Scissors, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  title: string;
  subtitle?: string;
  isBarber?: boolean;
  children: ReactNode;
};

export function AppShell({ title, subtitle, isBarber, children }: Props) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/agendar", label: "Agendar", icon: CalendarPlus },
    { to: "/meus-horarios", label: "Meus horários", icon: CalendarDays },
    ...(isBarber ? [{ to: "/painel", label: "Painel", icon: Scissors }] : []),
  ];

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 px-5 pb-4 pt-6 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gradient-gold">{title}</h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
          <button
            onClick={signOut}
            aria-label="Sair"
            className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-5 pb-28 pt-5">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-lg border-t border-border bg-card/95 backdrop-blur">
        <ul className="flex">
          {items.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="size-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
