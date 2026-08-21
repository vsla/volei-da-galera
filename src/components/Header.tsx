import { Menu, Settings } from "lucide-react";

export function Header({
  dateLabel,
  peladaName,
  meName,
  isOrganizer = false,
  onOpenEdit,
  onOpenHistory,
  onSwitchMe,
  onSwitchPelada,
}: {
  dateLabel: string;
  /** Em qual pelada você está — com várias, isso deixa de ser óbvio. */
  peladaName?: string;
  /** Sair pra lista de peladas. */
  onSwitchPelada?: () => void;
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
      {/* a bola volta pra lista de peladas — o "logo" é a saída */}
      <button
        type="button"
        onClick={onSwitchPelada}
        aria-label="Trocar de pelada"
        className="-ml-1 flex size-10 shrink-0 items-center justify-center text-xl leading-none"
      >
        🏐
      </button>

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

      <span className="ml-auto flex max-w-[40%] shrink-0 flex-col items-end">
        {peladaName && (
          <span className="font-display text-muted/70 max-w-full truncate text-xs tracking-wide uppercase">
            {peladaName}
          </span>
        )}
        <span className="font-display text-muted text-sm tracking-wide uppercase">
          {dateLabel}
        </span>
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
