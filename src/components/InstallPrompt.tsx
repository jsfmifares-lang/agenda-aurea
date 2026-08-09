import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const iOS =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(navigator as unknown as { standalone?: boolean }).standalone;
    setIsIos(iOS);

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (dismissed || (!deferred && !isIos)) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl surface-card p-4 shadow-xl">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Instale o Agenda Aurea</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isIos
              ? 'No iPhone/iPad: toque no ícone de Compartilhar (quadrado com seta) e escolha "Adicionar à Tela de Início".'
              : "Adicione o app à tela inicial do celular e abra com um toque, como um aplicativo de verdade."}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={install}
              disabled={!deferred}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-gold disabled:opacity-60"
            >
              <Download className="size-4" />
              {deferred ? "Instalar" : "Entendi"}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Fechar"
          className="text-muted-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
