import { Menu, Settings } from "lucide-react";

export function Header({
  dateLabel,
  meName,
  isOrganizer = false,
  onOpenEdit,
  onOpenHistory,
  onSwitchMe,
}: {
  dateLabel: string;
  /**
   * Quem o app acha que você é.
   *
   * Isso ficava só num link miúdo no rodapé, e alguém votou a noite
   * inteira como outra pessoa sem perceber — a tela de votação esconde
   * você mesmo, então o sintoma foi "fulano sumiu da lista". Identidade
   * é um toque no nome, sem senha; o mínimo é ela estar sempre à vista.
   */
  meName?: string | null;
  isOrganizer?: boolean;
  onOpenEdit?: () => void;
  /** Histórico — aberto pra todo mundo, não só pro organizador. */
  onOpenHistory?: () => void;
  /** Trocar de pessoa — o antigo "não é você?". */
  onSwitchMe?: () => void;
}) {
  return (
    <header className="bg-bg/95 border-border sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
      <span className="text-xl leading-none">🏐</span>

      {meName ? (
        /* seu nome ocupa o lugar de honra: é o que precisa ser conferido */
        <button
          type="button"
          onClick={onSwitchMe}
          className="min-w-0 text-left"
        >
          <span className="font-display text-accent block truncate text-lg leading-tight font-extrabold tracking-wide uppercase">
            {meName}
          </span>
          <span className="text-muted block text-xs leading-tight">
            não é você? toque aqui
          </span>
        </button>
      ) : (
        <h1 className="font-display text-ink text-xl font-extrabold tracking-wide uppercase">
          Prainha ZN
        </h1>
      )}

      <span className="font-display text-muted ml-auto shrink-0 text-sm tracking-wide uppercase">
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
