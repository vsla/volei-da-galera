export function LiveStrip({
  checkedIn,
  round,
  stale = false,
}: {
  checkedIn: number;
  round: number | null;
  /** true = a rede caiu e estamos mostrando estado velho */
  stale?: boolean;
}) {
  return (
    <div className="border-border flex items-center gap-4 border-b px-4 py-2.5">
      <span className="flex items-center gap-2">
        <span
          className={`size-2 rounded-full ${stale ? "bg-muted" : "bg-live live-dot"}`}
        />
        <span className="font-display text-muted text-sm font-semibold tracking-widest uppercase">
          {stale ? "sem conexão" : "ao vivo"}
        </span>
      </span>

      <span className="ml-auto flex items-baseline gap-1.5">
        <span className="font-display tnum text-ink text-2xl font-extrabold">
          {checkedIn}
        </span>
        <span className="font-display text-muted text-sm tracking-widest uppercase">
          na praia
        </span>
      </span>

      {round !== null && (
        <span className="font-display text-muted border-border tnum border-l pl-4 text-sm tracking-widest uppercase">
          {round}ª rodada
        </span>
      )}
    </div>
  );
}
