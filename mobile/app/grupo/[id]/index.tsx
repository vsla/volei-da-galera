import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useGrupo } from "../../../lib/grupo-ctx";
import { bumpScore, finishMatch, generateMatch } from "../../../lib/db";
import { teamName } from "../../../lib/teams";
import { courtNames, type SessionPlayer, type Team } from "../../../lib/types";
import { Avatar, Btn, Card, Empty, H1, Loading, Muted, Pill, Row, Section } from "../../../components/ui";
import { PlayerSheet } from "../../../components/PlayerSheet";
import { OrganizerSheet } from "../../../components/OrganizerSheet";
import { Placar } from "../../../components/Placar";
import { DepoisDaPartida, Proximos } from "../../../components/Proximos";
import { c, radius, sp, type } from "../../../lib/theme";

export default function Pelada() {
  const { grupo, state, isAdmin, myPlayerId, loading, reload } = useGrupo();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Quem está com a gaveta aberta. Guardo o ID, e não o objeto, porque o
  // poll de 5s troca os objetos de `state.players` — guardar o objeto
  // deixaria a gaveta mostrando um placar velho enquanto está aberta.
  const [selId, setSelId] = useState<string | null>(null);
  const [organizando, setOrganizando] = useState(false);
  const [placarAberto, setPlacarAberto] = useState(false);

  if (loading && !state) return <Loading label="Carregando a pelada…" />;

  if (!state) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: sp(4) }}>
          <H1>{grupo?.name ?? "Grupo"}</H1>
          <Muted>Nenhuma pelada rolando.</Muted>
          <View style={{ height: sp(6) }} />
          <Empty
            title="Sem pelada hoje"
            hint={
              isAdmin
                ? "Vai na aba Lista pra abrir a pelada de hoje."
                : "Espera o admin abrir a pelada de hoje."
            }
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const labels = state.settings.teamLabels;
  const podeGerenciar = isAdmin || state.settings.whoCanManage === "everyone";
  const confirmados = state.players.filter((p) => p.checkedInAt && !p.excluded);
  const jogando = new Set(
    [...(state.activeMatch?.teamA ?? []), ...(state.activeMatch?.teamB ?? [])].map((p) => p.id),
  );
  const fila = confirmados
    .filter((p) => !jogando.has(p.id))
    .sort(
      (a, b) =>
        b.roundsWaiting - a.roundsWaiting ||
        a.gamesPlayed - b.gamesPlayed ||
        a.name.localeCompare(b.name, "pt-BR"),
    );

  async function gerar(forceReshuffle = false) {
    if (!state) return;
    setBusy("gerar");
    try {
      const r = await generateMatch(state, { forceReshuffle });
      if (!r.ok) {
        Alert.alert(
          "Não deu pra gerar",
          r.error ??
            `Faltam ${r.missing} ${r.missing === 1 ? "pessoa" : "pessoas"} — tem ${r.available} confirmadas.`,
        );
      }
      await reload();
    } catch (e) {
      Alert.alert("Erro", e instanceof Error ? e.message : "Falhou ao gerar.");
    } finally {
      setBusy(null);
    }
  }

  async function ponto(team: Team, delta: number) {
    if (!state?.activeMatch) return;
    await bumpScore(state.activeMatch.id, team, delta);
    await reload();
  }

  async function venceu(winner: Team) {
    if (!state?.activeMatch) return;
    const m = state.activeMatch;
    setBusy("finish");
    try {
      await finishMatch(state, winner, { a: m.scoreA, b: m.scoreB });
      await reload();
    } catch (e) {
      Alert.alert("Erro", e instanceof Error ? e.message : "Falhou ao encerrar.");
    } finally {
      setBusy(null);
    }
  }

  const m = state.activeMatch;
  const nomes = courtNames(state.players);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: sp(4), paddingBottom: sp(12) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.dim}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
      >
        <Row style={{ justifyContent: "space-between", marginBottom: sp(2) }}>
          <View style={{ flex: 1 }}>
            <Text style={[type.section, { color: c.dim }]}>
              {(grupo?.name ?? "").toUpperCase()}
            </Text>
            <H1>{m ? `Rodada ${m.round}` : "Quadra livre"}</H1>
          </View>
          <Row gap={2}>
            {podeGerenciar ? (
              <Pressable onPress={() => setOrganizando(true)}>
                <Pill tone="accent">ORGANIZAR</Pill>
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.replace("/")}>
              <Pill tone="dim">SAIR</Pill>
            </Pressable>
          </Row>
        </Row>
        <Muted>
          {confirmados.length} na quadra hoje · {state.teamSize}×{state.teamSize}
        </Muted>

        {m ? (
          <>
            <Section>Jogando agora</Section>
            <Lado
              team="A"
              label={teamName("A", labels)}
              color={c.teamA}
              players={m.teamA}
              nomes={nomes}
              score={m.scoreA}
              scoring={state.settings.scoring}
              canManage={podeGerenciar}
              onPonto={(d) => ponto("A", d)}
              onPlayer={setSelId}
            />
            <View style={{ height: sp(2) }} />
            <Lado
              team="B"
              label={teamName("B", labels)}
              color={c.teamB}
              players={m.teamB}
              nomes={nomes}
              score={m.scoreB}
              scoring={state.settings.scoring}
              canManage={podeGerenciar}
              onPonto={(d) => ponto("B", d)}
              onPlayer={setSelId}
            />

            {podeGerenciar && (
              <View style={{ gap: sp(2), marginTop: sp(5) }}>
                <Text style={[type.section, { color: c.dim }]}>QUEM VENCEU?</Text>
                <Row gap={2}>
                  <Btn
                    title={teamName("A", labels)}
                    loading={busy === "finish"}
                    style={{ flex: 1, backgroundColor: c.teamA }}
                    onPress={() => venceu("A")}
                  />
                  <Btn
                    title={teamName("B", labels)}
                    loading={busy === "finish"}
                    style={{ flex: 1, backgroundColor: c.teamB }}
                    onPress={() => venceu("B")}
                  />
                </Row>
                {state.settings.scoring ? (
                  <Btn
                    title="Abrir o placar (deitado)"
                    variant="subtle"
                    onPress={() => setPlacarAberto(true)}
                  />
                ) : null}
                <Btn
                  title="Sortear de novo"
                  variant="ghost"
                  small
                  loading={busy === "gerar"}
                  onPress={() => gerar(true)}
                />
              </View>
            )}
          </>
        ) : (
          <>
            {state.lastMatch ? (
              <>
                <Section>Última rodada</Section>
                <Card>
                  <Row style={{ justifyContent: "space-between" }}>
                    <Text style={[type.label, { color: c.text }]}>
                      Rodada {state.lastMatch.round}
                    </Text>
                    <Pill tone="ok">
                      {state.lastMatch.winner
                        ? `${teamName(state.lastMatch.winner, labels)} venceu`
                        : "sem vencedor"}
                    </Pill>
                  </Row>
                  {state.lastMatch.scoreA !== null && state.lastMatch.scoreB !== null ? (
                    <Text style={{ color: c.dim, marginTop: sp(2), fontSize: 20, fontWeight: "800" }}>
                      {state.lastMatch.scoreA} — {state.lastMatch.scoreB}
                    </Text>
                  ) : null}
                  {state.championStreak > 0 ? (
                    <Muted>Segurando a quadra há {state.championStreak}.</Muted>
                  ) : null}
                  <DepoisDaPartida state={state} />
                </Card>
              </>
            ) : null}

            {podeGerenciar ? (
              <Btn
                title="Gerar próximo jogo"
                style={{ marginTop: sp(5) }}
                loading={busy === "gerar"}
                onPress={() => gerar(false)}
              />
            ) : (
              <Card style={{ marginTop: sp(5) }}>
                <Muted>Esperando o admin gerar a próxima rodada.</Muted>
              </Card>
            )}
          </>
        )}

        <Proximos state={state} meId={myPlayerId} />

        <Section right={<Text style={[type.tiny, { color: c.faint }]}>{fila.length} esperando</Text>}>
          Fila
        </Section>
        {fila.length === 0 ? (
          <Muted>Todo mundo está em quadra.</Muted>
        ) : (
          <View style={{ gap: sp(1.5) }}>
            {fila.map((p, i) => (
              <Pressable
                key={p.id}
                onPress={() => setSelId(p.id)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: sp(3),
                  backgroundColor: c.surface,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: c.border,
                  padding: sp(2.5),
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={[type.tiny, { color: c.faint, width: 18 }]}>{i + 1}</Text>
                <Avatar name={p.name} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.label, { color: c.text }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </View>
                {p.roundsWaiting > 0 ? (
                  <Pill tone={p.roundsWaiting >= 3 ? "warn" : "dim"}>
                    {p.roundsWaiting} fora
                  </Pill>
                ) : null}
                <Text style={[type.tiny, { color: c.faint }]}>{p.gamesPlayed}j</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <PlayerSheet
        state={state}
        player={state.players.find((p) => p.id === selId) ?? null}
        canManage={podeGerenciar}
        onClose={() => setSelId(null)}
        onDone={reload}
      />
      <Placar
        state={state}
        visible={placarAberto}
        canManage={podeGerenciar}
        onClose={() => setPlacarAberto(false)}
        onDone={reload}
      />
      <OrganizerSheet
        state={state}
        visible={organizando}
        onClose={() => setOrganizando(false)}
        onDone={reload}
      />
    </SafeAreaView>
  );
}

function Lado({
  label,
  color,
  players,
  nomes,
  score,
  scoring,
  canManage,
  onPonto,
  onPlayer,
}: {
  team: Team;
  label: string;
  color: string;
  players: SessionPlayer[];
  nomes: Map<string, string>;
  score: number;
  scoring: boolean;
  canManage: boolean;
  onPonto: (delta: number) => void;
  onPlayer: (playerId: string) => void;
}) {
  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: c.border,
        borderLeftWidth: 4,
        borderLeftColor: color,
        padding: sp(3.5),
      }}
    >
      <Row style={{ justifyContent: "space-between", marginBottom: sp(3) }}>
        <Text style={{ color, fontSize: 14, fontWeight: "800", letterSpacing: 1 }}>{label}</Text>
        {scoring ? (
          <Row gap={3}>
            {canManage ? (
              <Pressable onPress={() => onPonto(-1)} hitSlop={12}>
                <Text style={{ color: c.faint, fontSize: 26, fontWeight: "700" }}>−</Text>
              </Pressable>
            ) : null}
            <Text style={{ color: c.text, fontSize: 30, fontWeight: "800", minWidth: 42, textAlign: "center" }}>
              {score}
            </Text>
            {canManage ? (
              <Pressable onPress={() => onPonto(1)} hitSlop={12}>
                <Text style={{ color, fontSize: 26, fontWeight: "700" }}>+</Text>
              </Pressable>
            ) : null}
          </Row>
        ) : null}
      </Row>

      <Row gap={2} style={{ flexWrap: "wrap" }}>
        {players.map((p) => (
          <Pressable
            key={p.id}
            onPress={() => onPlayer(p.id)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: sp(1.5),
              backgroundColor: c.surface2,
              borderRadius: radius.pill,
              paddingVertical: sp(1),
              paddingHorizontal: sp(2),
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Avatar name={p.name} size={24} />
            <Text style={[type.tiny, { color: c.text }]}>{nomes.get(p.id) ?? p.name}</Text>
          </Pressable>
        ))}
      </Row>
    </View>
  );
}
