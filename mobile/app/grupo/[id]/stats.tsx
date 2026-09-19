import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGrupo } from "../../../lib/grupo-ctx";
import {
  fetchDayMatches,
  fetchHeadToHead,
  fetchPlayerStats,
  type HeadToHead,
  type PlayedMatch,
  type PlayerStats,
} from "../../../lib/db";
import { teamName } from "../../../lib/teams";
import { c, radius, sp, type } from "../../../lib/theme";
import { Avatar, Card, Empty, H1, Loading, Muted, Pill, Row, Section } from "../../../components/ui";
import { Sheet, SheetRow } from "../../../components/Sheet";

/**
 * O QUE SE OLHA NO SÁBADO DE MANHÃ.
 *
 * Estatísticas e histórico moram juntos porque respondem à mesma
 * pergunta em duas escalas: "como foi ontem" e "como tem sido".
 *
 * Vitórias contam por PARTIDA, não por noite, e a nota é a mesma que o
 * gerador usa pra equilibrar os times (§3 do `reasonable.md`) — mostrar
 * uma coisa e nivelar por outra seria mentira útil pra ninguém.
 *
 * O confronto direto (`fetchHeadToHead`) é o detalhe que mais rende
 * conversa no grupo: "a gente nunca perde junto".
 */
export default function Stats() {
  const { grupo, state, loading, reload } = useGrupo();

  const [stats, setStats] = useState<PlayerStats[] | null>(null);
  const [partidas, setPartidas] = useState<PlayedMatch[]>([]);
  const [a, setA] = useState<PlayerStats | null>(null);
  const [duelo, setDuelo] = useState<HeadToHead | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async () => {
    if (!grupo) return;
    const s = await fetchPlayerStats(grupo.id);
    setStats(s);
    if (state?.sessionId) {
      setPartidas(await fetchDayMatches(state.sessionId, state.players));
    }
  }, [grupo?.id, state?.sessionId, state?.players]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (loading && !stats) return <Loading label="Somando as sextas…" />;

  const ordenadas = [...(stats ?? [])].sort(
    (x, y) => y.wins - x.wins || y.games - x.games || x.name.localeCompare(y.name, "pt-BR"),
  );

  async function abrirDuelo(b: PlayerStats) {
    if (!grupo || !a) return;
    setDuelo(await fetchHeadToHead(grupo.id, a.playerId, b.playerId));
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: sp(4), paddingBottom: sp(16) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.dim}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([reload(), carregar()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <H1>Números</H1>
        <Muted>Toque em dois nomes pra ver o confronto direto.</Muted>

        <Section>A tabela</Section>
        {ordenadas.length === 0 ? (
          <Empty title="Ainda não deu jogo" hint="As contas começam na primeira partida." />
        ) : (
          <View style={{ gap: sp(1.5) }}>
            {ordenadas.map((p, i) => (
              <Card
                key={p.playerId}
                style={{
                  paddingVertical: sp(2.5),
                  borderColor: a?.playerId === p.playerId ? c.accent : c.border,
                }}
                onPress={() => (a ? abrirDuelo(p) : setA(p))}
              >
                <Row gap={3}>
                  <Text style={[type.tiny, { color: c.faint, width: 18 }]}>{i + 1}</Text>
                  <Avatar name={p.name} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.label, { color: c.text }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={[type.tiny, { color: c.faint }]}>
                      {p.games} jogos · nota {p.rating.toFixed(1)}
                    </Text>
                  </View>
                  {p.highlights > 0 ? (
                    <Pill tone="accent">
                      {p.highlights}× destaque
                    </Pill>
                  ) : null}
                  <Text style={[type.label, { color: c.ok, minWidth: 30, textAlign: "right" }]}>
                    {p.wins}V
                  </Text>
                </Row>
              </Card>
            ))}
          </View>
        )}

        {partidas.length > 0 ? (
          <>
            <Section>As rodadas de hoje</Section>
            <View style={{ gap: sp(2) }}>
              {partidas.map((m) => (
                <Card key={m.id} style={{ paddingVertical: sp(3) }}>
                  <Row style={{ justifyContent: "space-between", marginBottom: sp(2) }}>
                    <Text style={[type.tiny, { color: c.faint }]}>Rodada {m.round}</Text>
                    {m.winner ? (
                      <Pill tone="ok">
                        {teamName(m.winner, state!.settings.teamLabels)} venceu
                      </Pill>
                    ) : (
                      <Pill tone="dim">sem vencedor</Pill>
                    )}
                  </Row>
                  <Lado nomes={m.teamA.map((p) => p.name)} cor={c.teamA} placar={m.scoreA} />
                  <View style={{ height: sp(1) }} />
                  <Lado nomes={m.teamB.map((p) => p.name)} cor={c.teamB} placar={m.scoreB} />
                </Card>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* ── o confronto direto ───────────────────────────── */}
      <Sheet
        visible={a !== null}
        title={duelo ? "Confronto direto" : `${a?.name ?? ""}`}
        subtitle={
          duelo
            ? undefined
            : "Agora toque em outro nome da tabela pra comparar os dois."
        }
        onClose={() => {
          setA(null);
          setDuelo(null);
        }}
      >
        {duelo ? (
          <>
            <Linha label="Jogaram juntos" valor={`${duelo.gamesTogether}`} />
            <Linha
              label="Venceram juntos"
              valor={`${duelo.winsTogether} de ${duelo.gamesTogether}`}
            />
            <Linha label="Jogaram contra" valor={`${duelo.gamesAgainst}`} />
            <Linha
              label="Nesses, quem levou"
              valor={
                duelo.winsA === duelo.winsB
                  ? `empate, ${duelo.winsA} a ${duelo.winsB}`
                  : `${duelo.winsA} a ${duelo.winsB}`
              }
            />
          </>
        ) : (
          <SheetRow
            title="escolher outro nome"
            hint="toque na tabela atrás desta gaveta"
            onPress={() => setA(null)}
          />
        )}
      </Sheet>
    </SafeAreaView>
  );
}

function Lado({
  nomes,
  cor,
  placar,
}: {
  nomes: string[];
  cor: string;
  placar: number | null;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: sp(2),
        borderLeftWidth: 3,
        borderLeftColor: cor,
        borderRadius: radius.sm,
        paddingLeft: sp(2.5),
      }}
    >
      <Text style={[type.body, { color: c.dim, flex: 1 }]} numberOfLines={1}>
        {nomes.join(", ")}
      </Text>
      {placar !== null ? (
        <Text style={[type.label, { color: c.text }]}>{placar}</Text>
      ) : null}
    </View>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <Row style={{ justifyContent: "space-between", paddingVertical: sp(1.5) }}>
      <Text style={[type.body, { color: c.dim }]}>{label}</Text>
      <Text style={[type.label, { color: c.text }]}>{valor}</Text>
    </Row>
  );
}
