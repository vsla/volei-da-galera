"use client";

/**
 * A única ação da tela. Muda conforme o estado do usuário —
 * fica no terço inferior, no alcance do polegar.
 */
export type BottomState =
  | { kind: "check-in"; onAction: () => void }
  | { kind: "in-queue"; position: number }
  | { kind: "playing" }
  | { kind: "generate"; onAction: () => void; disabled?: boolean }
  | { kind: "vote"; onAction: () => void }
  | { kind: "open-session"; onAction: () => void };

export function BottomBar({ state }: { state: BottomState }) {
  const base =
    "flex h-14 w-full items-center justify-center rounded-[12px] font-display text-lg font-extrabold uppercase tracking-widest";

  let content: React.ReactNode;

  switch (state.kind) {
    case "check-in":
      content = (
        <button
          type="button"
          onClick={state.onAction}
          className={`${base} bg-accent text-accent-ink active:opacity-80`}
        >
          ✅ Eu cheguei
        </button>
      );
      break;

    case "in-queue":
      content = (
        <div className={`${base} bg-surface text-muted border-border border`}>
          <span className="tnum">
            Você é o {state.position}º na fila
          </span>
        </div>
      );
      break;

    case "playing":
      content = (
        <div
          className={`${base} bg-accent/15 text-accent ring-accent/40 live-dot ring-1`}
        >
          🏐 Você está jogando
        </div>
      );
      break;

    case "generate":
      content = (
        <button
          type="button"
          onClick={state.onAction}
          disabled={state.disabled}
          className={`${base} bg-accent text-accent-ink active:opacity-80 disabled:bg-surface disabled:text-muted`}
        >
          🎲 Gerar próxima
        </button>
      );
      break;

    case "vote":
      content = (
        <button
          type="button"
          onClick={state.onAction}
          className={`${base} bg-accent text-accent-ink active:opacity-80`}
        >
          ⭐ Votar nos destaques
        </button>
      );
      break;

    case "open-session":
      content = (
        <button
          type="button"
          onClick={state.onAction}
          className={`${base} bg-accent text-accent-ink active:opacity-80`}
        >
          Abrir sessão
        </button>
      );
      break;
  }

  return (
    <div className="bg-bg/95 border-border sticky bottom-0 mt-auto border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      {content}
    </div>
  );
}
