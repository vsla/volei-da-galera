import { Flame } from "lucide-react";
import { courtNames, type SessionPlayer, type Team } from "@/lib/types";

function TeamSide({
  team,
  players,
  streak,
  meId,
  labels,
  onPlayerTap,
}: {
  team: Team;
  players: SessionPlayer[];
  streak?: number;
  meId?: string | null;
  labels: Map<string, string>;
  onPlayerTap?: (player: SessionPlayer, team: Team) => void;
}) {
  const color = team === "A" ? "bg-team-a" : "bg-team-b";
  const text = team === "A" ? "text-team-a" : "text-team-b";

  return (
    <div className="relative py-4 pr-4 pl-5">
      {/* faixa lateral da cor do time */}
      <span className={`absolute top-4 bottom-4 left-0 w-1 rounded-full ${color}`} />

      <div className="flex items-center gap-2">
        <h3 className={`font-display text-lg font-extrabold tracking-widest uppercase ${text}`}>
          Time {team}
        </h3>
        {typeof streak === "number" && streak > 0 && (
          <span className="text-accent ml-auto flex items-center gap-1">
            <Flame className="size-4" />
            <span className="font-display tnum text-sm font-bold tracking-widest uppercase">
              {streak} {streak === 1 ? "vitória" : "vitórias"}
            </span>
          </span>
        )}
      </div>

      <ul className="mt-2.5 grid grid-cols-3 gap-x-2 gap-y-1.5">
        {players.map((p) => {
          const isMe = p.id === meId;
          const label = (
            <>
              {labels.get(p.id) ?? p.name}
              {isMe && <span className="ml-1">◄</span>}
            </>
          );
          const cls = `font-display truncate text-base font-semibold tracking-wide uppercase ${
            isMe ? "text-accent" : "text-ink"
          }`;

          return (
            <li key={p.id}>
              {onPlayerTap ? (
                <button
                  type="button"
                  onClick={() => onPlayerTap(p, team)}
                  className={`${cls} decoration-border w-full min-h-[36px] text-left underline decoration-dotted underline-offset-4`}
                >
                  {label}
                </button>
              ) : (
                <span className={`${cls} block`}>{label}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CourtCard({
  teamA,
  teamB,
  championTeam,
  streak,
  meId,
  canFinish = false,
  onWin,
  onPlayerTap,
}: {
  teamA: SessionPlayer[];
  teamB: SessionPlayer[];
  /** Organizador toca num jogador pra trocar, mover ou marcar que foi embora. */
  onPlayerTap?: (player: SessionPlayer, team: Team) => void;
  /** qual time está defendendo a quadra (null = rodada nova) */
  championTeam?: Team | null;
  streak?: number;
  meId?: string | null;
  /** só o organizador finaliza a partida */
  canFinish?: boolean;
  onWin?: (team: Team) => void;
}) {
  // desambigua "João" de "João Victor" dentro da quadra
  const labels = courtNames([...teamA, ...teamB]);

  return (
    <section className="bg-surface border-border mx-4 mt-4 overflow-hidden rounded-[16px] border">
      <TeamSide
        team="A"
        players={teamA}
        streak={championTeam === "A" ? streak : undefined}
        meId={meId}
        labels={labels}
        onPlayerTap={onPlayerTap}
      />

      <div className="border-border flex items-center gap-3 border-y px-5 py-1.5">
        <span className="bg-border h-px flex-1" />
        <span className="font-display text-muted text-sm font-bold tracking-[0.3em] uppercase">
          vs
        </span>
        <span className="bg-border h-px flex-1" />
      </div>

      <TeamSide
        team="B"
        players={teamB}
        streak={championTeam === "B" ? streak : undefined}
        meId={meId}
        labels={labels}
        onPlayerTap={onPlayerTap}
      />

      {canFinish && (
        <div className="border-border grid grid-cols-2 gap-2 border-t p-3">
          <button
            type="button"
            onClick={() => onWin?.("A")}
            className="font-display border-team-a text-team-a active:bg-team-a active:text-bg h-12 rounded-[12px] border text-base font-bold tracking-widest uppercase"
          >
            A ganhou
          </button>
          <button
            type="button"
            onClick={() => onWin?.("B")}
            className="font-display border-team-b text-team-b active:bg-team-b active:text-bg h-12 rounded-[12px] border text-base font-bold tracking-widest uppercase"
          >
            B ganhou
          </button>
        </div>
      )}
    </section>
  );
}

/** Quadra sem partida — nunca deixar buraco na tela. */
export function EmptyCourt({ missing }: { missing: number }) {
  return (
    <section className="bg-surface border-border mx-4 mt-4 rounded-[16px] border border-dashed px-5 py-10 text-center">
      <p className="font-display text-muted text-xl font-bold tracking-widest uppercase">
        {missing > 0 ? `faltam ${missing} pra começar` : "quadra livre"}
      </p>
    </section>
  );
}
