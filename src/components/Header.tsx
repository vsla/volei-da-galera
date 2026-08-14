import { Menu, Settings } from "lucide-react";

export function Header({
  dateLabel,
  isOrganizer = false,
  onOpenEdit,
  onOpenHistory,
}: {
  dateLabel: string;
  isOrganizer?: boolean;
  onOpenEdit?: () => void;
  /** Histórico — aberto pra todo mundo, não só pro organizador. */
  onOpenHistory?: () => void;
}) {
  return (
    <header className="bg-bg/95 border-border sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
      <span className="text-xl leading-none">🏐</span>
      <h1 className="font-display text-ink text-xl font-extrabold tracking-wide uppercase">
        Prainha ZN
      </h1>
      <span className="font-display text-muted ml-auto text-base tracking-wide uppercase">
        {dateLabel}
      </span>
      {onOpenHistory && (
        <button
          type="button"
          onClick={onOpenHistory}
          aria-label="Histórico de partidas"
          className="text-muted hover:text-accent flex size-12 items-center justify-center"
        >
          <Menu className="size-5" />
        </button>
      )}
      {isOrganizer && (
        <button
          type="button"
          onClick={onOpenEdit}
          aria-label="Menu do organizador"
          /* 48px de alvo — mão com areia, no escuro */
          className="text-muted hover:text-accent -mr-2 flex size-12 items-center justify-center"
        >
          <Settings className="size-5" />
        </button>
      )}
    </header>
  );
}
