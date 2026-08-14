import { Settings } from "lucide-react";

export function Header({
  dateLabel,
  isOrganizer = false,
  onOpenEdit,
}: {
  dateLabel: string;
  isOrganizer?: boolean;
  onOpenEdit?: () => void;
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
      {isOrganizer && (
        <button
          type="button"
          onClick={onOpenEdit}
          aria-label="Modo edição"
          /* 48px de alvo — mão com areia, no escuro */
          className="text-muted hover:text-accent -mr-2 flex size-12 items-center justify-center"
        >
          <Settings className="size-5" />
        </button>
      )}
    </header>
  );
}
