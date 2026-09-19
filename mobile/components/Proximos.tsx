import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { LiveState } from "../lib/db";
import { generateNextMatch, orderQueue, type Explanation } from "../lib/match-generator";
import { courtNames, type Team } from "../lib/types";
import { c, radius, sp, type } from "../lib/theme";
import { Avatar, Pill, Row, Section } from "./ui";
import { Sheet } from "./Sheet";

/**
 * OS PRÓXIMOS A ENTRAR, E POR QUÊ.
 *
 * Duas coisas que a web tem e faltavam aqui, e as duas existem pelo
 * mesmo motivo: evitar discussão na areia.
 *
 * 1. OS PRÓXIMOS — playtest 01: "tem que mostrar os próximos antes de
 *    acabar, pra dar mais agilidade". Mostrar exatamente `teamSize`
 *    nomes é correto sempre, porque a rotação garante que giram
 *    `teamSize` por partida (§8) — ganhando o campeão ou batendo o
 *    teto, entram `teamSize` de fora. QUEM exatamente ainda pode mudar
 *    no desempate enquanto a partida corre, e por isso o rótulo muda de
 *    "prováveis" pra "entram".
 *
 * 2. O PORQUÊ — quem jogou menos entra primeiro, e a tela mostra o
 *    PRIMEIRO QUE NÃO ENTROU com o número de jogos dele. É o que
 *    responde "por que ele e não eu?" antes de virar bate-boca.
 *
 * Nada aqui grava: é a mesma função pura que o banco vai rodar, com o
 * mesmo seed (`sessionId|round+1|`). A prévia é o sorteio de verdade.
 */
export function Proximos({ state, meId }: { state: LiveState; meId: string | null }) {
  const [porque, setPorque] = useState(false);

  const { fila, previa, explicacao } = useMemo(() => {
    const emQuadra = new Set(
      [
        ...(state.activeMatch?.teamA ?? []),
        ...(state.activeMatch?.teamB ?? []),
      ].map((p) => p.id),
    );
    const seed = `${state.sessionId}|${state.round + 1}|`;
    const confirmados = state.players.filter((p) => p.checkedInAt && !p.excluded);

    const campeao = state.championIds.length
      ? {
          playerIds: state.championIds,
          streak: state.championStreak,
          team: state.championTeam ?? ("A" as Team),
        }
      : null;

    const r = generateNextMatch({
      players: state.players,
      teamSize: state.teamSize,
      champion: campeao,
      maxStreak: state.maxStreak,
      history: state.history,
      seed,
    });

    return {
      fila: orderQueue(
        confirmados.filter((p) => !emQuadra.has(p.id)),
        seed,
      ),
      previa: r.ok ? [...r.teamA, ...r.teamB].filter((p) => !emQuadra.has(p.id)) : [],
      explicacao: r.ok ? r.explanation : null,
    };
  }, [state]);

  const entram = (previa.length ? previa : fila).slice(0, state.teamSize);
  if (entram.length === 0) return null;

  // Com partida rolando, quem entra ainda pode mudar no desempate.
  const certo = state.activeMatch === null;
  const nomes = courtNames(state.players);

  return (
    <>
      <Section
        right={
          <Pressable onPress={() => setPorque(true)} hitSlop={10}>
            <Pill tone="dim">POR QUÊ?</Pill>
          </Pressable>
        }
      >
        {certo ? "Entram agora" : "Prováveis próximos"}
      </Section>

      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: c.accent,
          padding: sp(3),
          gap: sp(2),
        }}
      >
        <Row gap={2} style={{ flexWrap: "wrap" }}>
          {entram.map((p) => (
            <View
              key={p.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: sp(1.5),
                backgroundColor: p.id === meId ? c.accentDim : c.surface2,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: p.id === meId ? c.accent : c.border,
                paddingVertical: sp(1),
                paddingHorizontal: sp(2),
              }}
            >
              <Avatar name={p.name} size={22} />
              <Text style={[type.tiny, { color: c.text }]}>
                {nomes.get(p.id) ?? p.name}
              </Text>
            </View>
          ))}
        </Row>
        <Text style={[type.tiny, { color: c.faint }]}>
          {certo
            ? "Quem jogou menos entra primeiro."
            : "Pode mudar no desempate até a partida acabar."}
        </Text>
      </View>

      <PorQue
        visible={porque}
        explicacao={explicacao}
        teamSize={state.teamSize}
        onClose={() => setPorque(false)}
      />
    </>
  );
}

/**
 * A GAVETA QUE FAZ A GALERA CONFIAR NO SORTEIO.
 *
 * O número que mais importa aqui é o do PRIMEIRO QUE FICOU DE FORA: sem
 * ele, "por que ele e não eu" não tem resposta, e a fila vira suspeita.
 */
function PorQue({
  visible,
  explicacao,
  teamSize,
  onClose,
}: {
  visible: boolean;
  explicacao: Explanation | null;
  teamSize: number;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      title={`Por que esses ${teamSize}`}
      subtitle="Quem jogou menos entra primeiro."
      onClose={onClose}
    >
      {!explicacao ? (
        <Text style={[type.body, { color: c.dim }]}>
          Ainda não dá pra montar a próxima partida.
        </Text>
      ) : (
        <>
          <View style={{ gap: sp(1.5) }}>
            {explicacao.picked.map((p) => (
              <Row key={p.player.id} gap={3}>
                <Avatar name={p.player.name} size={28} />
                <Text style={[type.label, { color: c.text, flex: 1 }]} numberOfLines={1}>
                  {p.player.name}
                </Text>
                {p.byTiebreak ? <Pill tone="dim">sorteio</Pill> : null}
                <Text style={[type.tiny, { color: c.faint }]}>{p.games}j</Text>
              </Row>
            ))}
          </View>

          {explicacao.firstOut ? (
            <View
              style={{
                marginTop: sp(4),
                padding: sp(3),
                borderRadius: radius.md,
                backgroundColor: c.surface2,
                borderWidth: 1,
                borderColor: c.border,
              }}
            >
              <Text style={[type.section, { color: c.dim, marginBottom: sp(2) }]}>
                O PRIMEIRO DE FORA
              </Text>
              <Row gap={3}>
                <Avatar name={explicacao.firstOut.player.name} size={28} />
                <Text style={[type.label, { color: c.text, flex: 1 }]} numberOfLines={1}>
                  {explicacao.firstOut.player.name}
                </Text>
                <Text style={[type.tiny, { color: c.faint }]}>
                  {explicacao.firstOut.games}j
                </Text>
              </Row>
              <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
                {explicacao.tiebreakUsed
                  ? "O corte caiu no meio de um empate em jogos — o desempate é sorteado, e muda a cada rodada."
                  : "Entra na próxima."}
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: sp(4), gap: sp(1) }}>
            <Linha
              label="Jogos entre quem entrou"
              valor={`${explicacao.minGames} a ${explicacao.maxGames}`}
            />
            <Linha
              label="Diferença de nota entre os times"
              valor={explicacao.ratingDiff.toFixed(1)}
            />
            <Linha
              label="Duplas que se repetem"
              valor={`${explicacao.repeatedTeammatePairs}`}
            />
          </View>
          <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
            A nota equilibra os times depois que a fila já decidiu quem entra —
            nunca antes. Ela não tira ninguém da vez.
          </Text>
        </>
      )}
    </Sheet>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Text style={[type.tiny, { color: c.dim }]}>{label}</Text>
      <Text style={[type.tiny, { color: c.text }]}>{valor}</Text>
    </Row>
  );
}

/** Quem fica e quem volta pra fila — o "entre uma partida e outra". */
export function DepoisDaPartida({ state }: { state: LiveState }) {
  if (!state.lastMatch || state.activeMatch) return null;

  const segurando = state.championIds.length;
  return (
    <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
      {segurando > 0
        ? `${segurando} seguram a quadra${
            state.championStreak >= state.maxStreak
              ? " — mas bateram o teto, então o time vai ser desfeito"
              : "."
          }`
        : "Time desfeito — todo mundo volta pra fila."}
    </Text>
  );
}
