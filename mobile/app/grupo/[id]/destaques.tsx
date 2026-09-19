import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGrupo } from "../../../lib/grupo-ctx";
import {
  castVotes,
  closeVoting,
  fetchHighlightDays,
  fetchHighlights,
  fetchVoters,
  myVotes,
  openVoting,
  VOTES_PER_PLAYER,
  type HighlightDay,
} from "../../../lib/db";
import type { SessionPlayer } from "../../../lib/types";
import { c, radius, sp, type } from "../../../lib/theme";
import { Avatar, Btn, Card, Empty, H1, Loading, Muted, Pill, Row, Section } from "../../../components/ui";
import { Confirm } from "../../../components/Sheet";

/**
 * OS DESTAQUES DA NOITE.
 *
 * Cada pessoa aponta até três, e a contagem NUNCA aparece: o app mostra
 * quem foi destaque, não quem levou quantos votos. É decisão de produto,
 * não limitação — placar de votos entre amigos vira ranking de simpatia.
 *
 * Empate na última vaga entra junto, em vez de ser desfeito por critério
 * escondido (commit `5d97b25`). Quatro destaques numa noite é resposta
 * melhor que um desempate que ninguém consegue explicar na praia.
 *
 * Reler o próprio voto tem função de banco própria (`highlight_votes_by`,
 * 0019) porque sem conta não há policy que saiba que o voto é seu.
 */
export default function Destaques() {
  const { grupo, state, isAdmin, myPlayerId, loading, reload } = useGrupo();

  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [jaVotei, setJaVotei] = useState(false);
  const [vencedores, setVencedores] = useState<SessionPlayer[] | null>(null);
  const [quantosVotaram, setQuantosVotaram] = useState<number | null>(null);
  const [dias, setDias] = useState<HighlightDay[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fechando, setFechando] = useState(false);

  const sessionId = state?.sessionId;
  const status = state?.status;

  // Meu voto e o resultado saem de chamadas próprias — `fetchState` não
  // traz nenhum dos dois, e misturar votação no poll de 5s faria a tela
  // repintar a escolha da pessoa no meio do toque.
  const lerVoto = useCallback(async () => {
    if (!sessionId || !myPlayerId) return;
    const meus = await myVotes(sessionId, myPlayerId);
    if (meus && meus.length) {
      setEscolhidos(meus);
      setJaVotei(true);
    }
  }, [sessionId, myPlayerId]);

  const lerResultado = useCallback(async () => {
    if (!sessionId || !state) return;
    const [r, v] = await Promise.all([
      fetchHighlights(sessionId, state.players),
      fetchVoters(sessionId),
    ]);
    setVencedores(r.winners);
    setQuantosVotaram(v ? v.size : r.voters);
  }, [sessionId, state?.players]);

  useEffect(() => {
    void lerVoto();
  }, [lerVoto]);

  useEffect(() => {
    if (status === "voting" || status === "closed") void lerResultado();
  }, [status, lerResultado]);

  useEffect(() => {
    if (grupo) void fetchHighlightDays(grupo.id).then(setDias).catch(() => {});
  }, [grupo?.id]);

  if (loading && !state) return <Loading label="Carregando a noite…" />;

  if (!state) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: sp(4) }}>
          <H1>Destaques</H1>
          <View style={{ height: sp(4) }} />
          <Empty
            title="Sem pelada hoje"
            hint="Os destaques são da noite — abra a pelada primeiro."
          />
          {dias.length > 0 ? <Historico dias={dias} /> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const jogaram = state.players.filter((p) => p.checkedInAt && !p.excluded);
  const podeVotar = state.status === "voting" && myPlayerId !== null;
  const candidatos = jogaram.filter((p) => p.id !== myPlayerId);

  function alternar(id: string) {
    setEscolhidos((atual) =>
      atual.includes(id)
        ? atual.filter((x) => x !== id)
        : atual.length >= VOTES_PER_PLAYER
          ? atual
          : [...atual, id],
    );
  }

  async function acao(chave: string, fn: () => Promise<void>, erro: string) {
    setBusy(chave);
    try {
      await fn();
      await reload();
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : erro);
    } finally {
      setBusy(null);
    }
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
              await Promise.all([reload(), lerVoto(), lerResultado()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <H1>Destaques</H1>
        <Muted>
          {state.status === "voting"
            ? `Votação aberta · ${quantosVotaram ?? 0} já votaram`
            : state.status === "closed"
              ? "Noite encerrada"
              : "A votação abre quando a noite acabar"}
        </Muted>

        {/* ── o resultado ─────────────────────────────────── */}
        {vencedores && vencedores.length > 0 ? (
          <>
            <Section>Os destaques da noite</Section>
            <View style={{ gap: sp(2) }}>
              {vencedores.map((p) => (
                <Card key={p.id} style={{ borderColor: c.accent }}>
                  <Row gap={3}>
                    <Avatar name={p.name} size={44} color={c.accentDim} />
                    <Text style={[type.title, { color: c.text, flex: 1 }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Pill tone="accent">DESTAQUE</Pill>
                  </Row>
                </Card>
              ))}
            </View>
            <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
              Sem contagem de votos, de propósito. Empate na última vaga entra
              junto.
            </Text>
          </>
        ) : null}

        {/* ── votar ───────────────────────────────────────── */}
        {podeVotar ? (
          <>
            <Section
              right={
                <Text style={[type.tiny, { color: c.faint }]}>
                  {escolhidos.length}/{VOTES_PER_PLAYER}
                </Text>
              }
            >
              {jaVotei ? "Seu voto (dá pra trocar)" : "Quem jogou bem hoje?"}
            </Section>
            <View style={{ gap: sp(1.5) }}>
              {candidatos.map((p) => {
                const on = escolhidos.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => alternar(p.id)}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: sp(3),
                      backgroundColor: on ? c.accentDim : c.surface,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: on ? c.accent : c.border,
                      padding: sp(3),
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Avatar name={p.name} size={34} />
                    <Text style={[type.label, { color: c.text, flex: 1 }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {on ? <Pill tone="accent">✓</Pill> : null}
                  </Pressable>
                );
              })}
            </View>
            <Btn
              title={jaVotei ? "trocar meu voto" : "votar"}
              style={{ marginTop: sp(4) }}
              loading={busy === "votar"}
              disabled={escolhidos.length === 0}
              onPress={() =>
                acao(
                  "votar",
                  async () => {
                    await castVotes(state.sessionId, myPlayerId!, escolhidos);
                    setJaVotei(true);
                    await lerResultado();
                  },
                  "Falhou ao votar.",
                )
              }
            />
            <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
              Até {VOTES_PER_PLAYER}. Em você mesmo não vale.
            </Text>
          </>
        ) : null}

        {/* ── o que o organizador faz ──────────────────────── */}
        {isAdmin ? (
          <>
            <Section>Organizar</Section>
            {state.status !== "voting" && state.status !== "closed" ? (
              <Btn
                title="abrir a votação"
                loading={busy === "abrir"}
                onPress={() =>
                  acao(
                    "abrir",
                    () => openVoting(state.sessionId),
                    "Falhou ao abrir.",
                  )
                }
              />
            ) : null}
            {state.status === "voting" ? (
              <Btn
                title="encerrar a noite"
                variant="danger"
                onPress={() => setFechando(true)}
              />
            ) : null}
          </>
        ) : null}

        {dias.length > 0 ? <Historico dias={dias} /> : null}
      </ScrollView>

      <Confirm
        visible={fechando}
        title="Encerrar a noite?"
        message={
          `${quantosVotaram ?? 0} ${quantosVotaram === 1 ? "pessoa votou" : "pessoas votaram"}. ` +
          "Depois de encerrar ninguém vota mais — mas dá pra reabrir em Organizar, na aba da pelada."
        }
        confirmLabel="encerrar"
        busy={busy === "fechar"}
        onClose={() => setFechando(false)}
        onConfirm={() =>
          acao(
            "fechar",
            async () => {
              await closeVoting(state.sessionId);
              setFechando(false);
              await lerResultado();
            },
            "Falhou ao encerrar.",
          )
        }
      />
    </SafeAreaView>
  );
}

/** As sextas passadas — quem foi destaque em cada uma. */
function Historico({ dias }: { dias: HighlightDay[] }) {
  return (
    <>
      <Section>Sextas passadas</Section>
      <View style={{ gap: sp(2) }}>
        {dias.map((d) => (
          <Card key={d.sessionId} style={{ paddingVertical: sp(3) }}>
            <Text style={[type.tiny, { color: c.faint }]}>{diaMes(d.date)}</Text>
            <Text style={[type.body, { color: c.text, marginTop: sp(1) }]}>
              {d.winners.length
                ? d.winners.map((w) => w.name).join(" · ")
                : "ninguém votou"}
            </Text>
          </Card>
        ))}
      </View>
    </>
  );
}

/** `2026-09-11` → `11/09` — é como a lista do grupo escreve a data. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}
