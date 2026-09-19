import { DEFAULT_TEAM_LABELS, type TeamLabels } from "./teams";

/**
 * CONFIGURAÇÃO DA PELADA.
 *
 * O playtest 01 terminou com "deixar mais configurável e fácil". Cada
 * grupo joga de um jeito: 6×6 ou 4×4, cai com 2 ou 3 vitórias, conta
 * ponto ou não, deixa o substituto herdar a vaga ou não.
 *
 * Mora em `jsonb` (migration 0012) por dois motivos:
 *
 *   1. regra nova não vira migration + deploy;
 *   2. a sessão pode sobrescrever a pelada — "hoje veio pouca gente,
 *      joga 4×4" não deveria mudar a regra de toda sexta.
 *
 * Tudo aqui tem padrão. Pelada nova funciona sem configurar nada, e é
 * assim que a maioria vai continuar.
 */
export type SubstitutionMode = "titular" | "tapa_buraco";

export type PeladaSettings = {
  /** Quantos por time. 6 = 6×6 na areia. */
  teamSize: number;
  /** Vitórias seguidas até o campeão ser desfeito. */
  maxStreak: number;
  /**
   * Teto de espera: depois de N rodadas fora, a pessoa entra na próxima
   * de qualquer jeito. `null` desliga.
   *
   * Playtest 01 §11: "acharam meio estranho alguns ficarem 3 rodadas
   * fora". É consequência honesta da fila, mas nada impede um teto —
   * ele fura o DESEMPATE, nunca a contagem de jogos.
   */
  waitCap: number | null;
  /** O que acontece com quem entra no meio da partida. */
  substitutionMode: SubstitutionMode;
  /** Nome dos times. A cor é do tema; o nome é de quem joga. */
  teamLabels: TeamLabels;
  /** Placar ponto a ponto disponível nesta pelada. */
  scoring: boolean;
  /** Quantos destaques cada um escolhe. */
  votesPerPlayer: number;
  /** Quem enxerga a nota. */
  showRating: "organizers" | "everyone" | "nobody";
  /** Quem pode gerar partida e registrar vencedor. */
  whoCanManage: "admins" | "everyone";
  /** Convidado sem cadastro pode entrar na lista. */
  allowGuests: boolean;
};

export const DEFAULT_SETTINGS: PeladaSettings = {
  teamSize: 6,
  maxStreak: 2,
  waitCap: null,
  substitutionMode: "titular",
  teamLabels: DEFAULT_TEAM_LABELS,
  scoring: true,
  votesPerPlayer: 3,
  showRating: "organizers",
  whoCanManage: "admins",
  allowGuests: true,
};

type Raw = Record<string, unknown> | null | undefined;

/**
 * Junta o que veio do banco com os padrões.
 *
 * Campo desconhecido é ignorado e campo faltando cai no padrão: um
 * `settings` escrito por uma versão mais nova (ou mais velha) do app
 * nunca derruba a tela — no máximo uma regra volta ao padrão.
 */
export function resolveSettings(pelada: Raw, session?: Raw): PeladaSettings {
  const merged = { ...DEFAULT_SETTINGS };
  for (const raw of [pelada, session]) {
    if (!raw) continue;
    const s = raw as Partial<PeladaSettings>;
    if (typeof s.teamSize === "number") merged.teamSize = clamp(s.teamSize, 2, 8);
    if (typeof s.maxStreak === "number") merged.maxStreak = clamp(s.maxStreak, 1, 10);
    if (s.waitCap === null || typeof s.waitCap === "number")
      merged.waitCap = s.waitCap === null ? null : clamp(s.waitCap, 1, 20);
    if (s.substitutionMode === "titular" || s.substitutionMode === "tapa_buraco")
      merged.substitutionMode = s.substitutionMode;
    if (s.teamLabels?.A && s.teamLabels?.B)
      merged.teamLabels = {
        A: String(s.teamLabels.A).slice(0, 12).toUpperCase(),
        B: String(s.teamLabels.B).slice(0, 12).toUpperCase(),
      };
    if (typeof s.scoring === "boolean") merged.scoring = s.scoring;
    if (typeof s.votesPerPlayer === "number")
      merged.votesPerPlayer = clamp(s.votesPerPlayer, 1, 10);
    if (
      s.showRating === "organizers" ||
      s.showRating === "everyone" ||
      s.showRating === "nobody"
    )
      merged.showRating = s.showRating;
    if (s.whoCanManage === "admins" || s.whoCanManage === "everyone")
      merged.whoCanManage = s.whoCanManage;
    if (typeof s.allowGuests === "boolean") merged.allowGuests = s.allowGuests;
  }
  return merged;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(v)));

// O slug ("Vôlei da Sexta" → "volei-da-sexta") e o código de entrada são
// gerados DENTRO do banco, na `create_pelada` (migration 0017). Tinham
// versão daqui também, e duas implementações da mesma regra é armadilha:
// a do cliente nem era usada na escrita — que é sempre a do banco.
