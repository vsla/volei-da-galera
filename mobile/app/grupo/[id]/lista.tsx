import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGrupo } from "../../../lib/grupo-ctx";
import { hojeSP } from "../../../lib/useLive";
import {
  addGuest,
  checkIn,
  ensureTodaySession,
  fetchState,
  undoCheckIn,
} from "../../../lib/db";
import { c, radius, sp, type } from "../../../lib/theme";
import { Avatar, Btn, Card, Empty, Field, H1, Loading, Muted, Pill, Row, Section } from "../../../components/ui";

/**
 * A LISTA DA PELADA DE HOJE.
 *
 * Dois momentos, e a tela é diferente em cada um:
 *
 * 1. ANTES: a lista não existe. Aparece o grupo inteiro com caixinha,
 *    todo mundo já marcado — porque o caso normal é "a lista da semana
 *    é quem joga hoje", e desmarcar dois é mais rápido que marcar treze.
 *    Convidado se cria aqui mesmo, e já entra marcado. Um botão só no
 *    fim: CRIAR A LISTA. Abre a noite e faz o check-in de todo mundo de
 *    uma vez, pronta pra gerar o primeiro jogo.
 *
 * 2. DEPOIS: a lista existe. A tela vira o check-in de sempre — quem
 *    chegou, quem falta, e quem chegou atrasado entra com um toque.
 *
 * O "de uma vez" é o ponto. Marcar 15 check-ins um a um, em pé, no
 * escuro, com 4G ruim, são 15 chances de a rede falhar no meio.
 */
export default function Lista() {
  const { grupo, state, members, isAdmin, myPlayerId, loading, reload } = useGrupo();
  const [guest, setGuest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Quem está marcado na tela de montar. `null` = ainda não mexi em
  // nada, então vale o padrão (todo mundo do grupo).
  const [marcados, setMarcados] = useState<Set<string> | null>(null);

  const candidatos = useMemo(
    () => members.filter((m) => m.status !== "removed"),
    [members],
  );
  const selecao = marcados ?? new Set(candidatos.map((m) => m.playerId));

  if (loading && !state && !members.length) return <Loading label="Carregando a lista…" />;

  // ─────────────────────────────────────────────────────────────
  // 1. A lista ainda não existe — montar
  // ─────────────────────────────────────────────────────────────
  if (!state) {
    if (!isAdmin) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
          <ScrollView contentContainerStyle={{ padding: sp(4) }}>
            <H1>{grupo?.name ?? "Grupo"}</H1>
            <View style={{ height: sp(6) }} />
            <Empty
              title="A lista de hoje ainda não saiu"
              hint="Quem organiza monta a lista e ela aparece aqui."
            />
          </ScrollView>
        </SafeAreaView>
      );
    }

    async function novoConvidado() {
      if (!grupo || guest.trim().length < 2) return;
      setBusy("guest");
      try {
        const id = await addGuest(grupo.id, guest.trim());
        setGuest("");
        await reload();
        // Convidado nasce marcado: ninguém digita um nome pra deixar de
        // fora. Precisa entrar na seleção à mão porque o padrão só vale
        // enquanto ninguém mexeu.
        if (id) setMarcados(new Set([...selecao, id]));
      } catch (e) {
        Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao convidar.");
      } finally {
        setBusy(null);
      }
    }

    async function criarLista() {
      if (!grupo || selecao.size === 0) return;
      setBusy("criar");
      try {
        await ensureTodaySession(grupo.id, hojeSP());

        // `ensureTodaySession` não devolve o id da noite — ela é um
        // upsert com `ignoreDuplicates`, então relemos pra descobrir se
        // acabamos de criar ou se já existia (o "se já tiver,
        // desconsidere"). Em ambos os casos o id vem daqui.
        const s = await fetchState(grupo.id);
        if (!s) throw new Error("A noite não abriu — tente de novo.");

        // Em série, e não `Promise.all`: 15 upserts simultâneos no 4G da
        // praia é o jeito mais rápido de metade falhar. Se cair no meio,
        // quem já entrou fica — e apertar de novo é seguro, porque
        // check-in é idempotente.
        for (const playerId of selecao) {
          await checkIn(s.sessionId, playerId);
        }
        await reload();
      } catch (e) {
        Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao criar a lista.");
      } finally {
        setBusy(null);
      }
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ padding: sp(4), paddingBottom: sp(28) }}
          keyboardShouldPersistTaps="handled"
        >
          <H1>Montar a lista</H1>
          <Muted>
            Quem joga hoje. Desmarca quem não vem e adiciona os convidados.
          </Muted>

          <Section
            right={
              <Row gap={2}>
                <Pressable onPress={() => setMarcados(new Set(candidatos.map((m) => m.playerId)))}>
                  <Pill tone="dim">TODOS</Pill>
                </Pressable>
                <Pressable onPress={() => setMarcados(new Set())}>
                  <Pill tone="dim">NENHUM</Pill>
                </Pressable>
              </Row>
            }
          >
            {`${selecao.size} de ${candidatos.length}`}
          </Section>

          {candidatos.length === 0 ? (
            <Empty
              title="O grupo está vazio"
              hint="Cola a lista da semana na aba Grupo, ou adiciona um convidado aqui embaixo."
            />
          ) : (
            <View style={{ gap: sp(1.5) }}>
              {candidatos.map((m) => {
                const on = selecao.has(m.playerId);
                return (
                  <Pressable
                    key={m.playerId}
                    onPress={() => {
                      const proxima = new Set(selecao);
                      if (on) proxima.delete(m.playerId);
                      else proxima.add(m.playerId);
                      setMarcados(proxima);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: sp(3),
                      backgroundColor: on ? c.surface : c.bg,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: on ? c.accent : c.border,
                      padding: sp(3),
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <Caixa on={on} />
                    <Avatar name={m.name} size={34} />
                    <Text
                      style={[type.label, { color: on ? c.text : c.faint, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {m.name}
                    </Text>
                    {m.isGuest ? <Pill tone="dim">CONVIDADO</Pill> : null}
                  </Pressable>
                );
              })}
            </View>
          )}

          <Section>Alguém de fora</Section>
          <Card>
            <Muted>
              Convidado não precisa de conta nenhuma — só do nome. Entra já
              marcado.
            </Muted>
            <View style={{ height: sp(3) }} />
            <Field
              placeholder="Nome do convidado"
              value={guest}
              onChangeText={setGuest}
              autoCapitalize="words"
              onSubmitEditing={novoConvidado}
            />
            <Btn
              title="adicionar convidado"
              variant="subtle"
              loading={busy === "guest"}
              disabled={guest.trim().length < 2}
              onPress={novoConvidado}
            />
          </Card>

          <Btn
            title={`criar a lista com ${selecao.size}`}
            style={{ marginTop: sp(6) }}
            loading={busy === "criar"}
            disabled={selecao.size === 0}
            onPress={criarLista}
          />
          <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
            Abre a noite de hoje e marca a presença de todo mundo de uma vez —
            pronta pra gerar o primeiro jogo.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. A lista existe — check-in de quem chega
  // ─────────────────────────────────────────────────────────────
  const dentro = state.players.filter((p) => p.checkedInAt && !p.excluded);
  const fora = state.players.filter((p) => !p.checkedInAt && !p.excluded);

  async function toggle(playerId: string, isIn: boolean) {
    if (!state) return;
    // Cada um marca a própria presença; admin marca de qualquer um —
    // tem gente que chega na quadra sem o app aberto.
    if (!isAdmin && playerId !== myPlayerId) return;
    setBusy(playerId);
    try {
      if (isIn) await undoCheckIn(state.sessionId, playerId);
      else await checkIn(state.sessionId, playerId);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function convidadoAtrasado() {
    if (!grupo || !state || guest.trim().length < 2) return;
    setBusy("guest");
    try {
      const id = await addGuest(grupo.id, guest.trim());
      if (id) await checkIn(state.sessionId, id);
      setGuest("");
      await reload();
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao convidar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: sp(4), paddingBottom: sp(20) }}
        keyboardShouldPersistTaps="handled"
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
        <H1>Lista de hoje</H1>
        <Muted>
          {dentro.length} confirmados · {state.teamSize} por time
        </Muted>

        <Section>Chegaram ({dentro.length})</Section>
        <Linhas
          players={dentro}
          dentro
          busy={busy}
          podeTocar={(id) => isAdmin || id === myPlayerId}
          onToggle={toggle}
        />

        {fora.length > 0 ? (
          <>
            <Section>Ainda não ({fora.length})</Section>
            <Linhas
              players={fora}
              dentro={false}
              busy={busy}
              podeTocar={(id) => isAdmin || id === myPlayerId}
              onToggle={toggle}
            />
          </>
        ) : null}

        {isAdmin ? (
          <>
            <Section>Chegou de fora</Section>
            <Card>
              <Field
                placeholder="Nome do convidado"
                value={guest}
                onChangeText={setGuest}
                autoCapitalize="words"
                onSubmitEditing={convidadoAtrasado}
              />
              <Btn
                title="entrar já confirmado"
                variant="subtle"
                loading={busy === "guest"}
                disabled={guest.trim().length < 2}
                onPress={convidadoAtrasado}
              />
            </Card>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Linhas({
  players,
  dentro,
  busy,
  podeTocar,
  onToggle,
}: {
  players: { id: string; name: string; isGuest: boolean; gamesPlayed: number }[];
  dentro: boolean;
  busy: string | null;
  podeTocar: (id: string) => boolean;
  onToggle: (id: string, isIn: boolean) => void;
}) {
  if (players.length === 0) return <Muted>—</Muted>;
  return (
    <View style={{ gap: sp(1.5) }}>
      {players.map((p) => {
        const pode = podeTocar(p.id);
        return (
          <Pressable
            key={p.id}
            disabled={!pode || busy === p.id}
            onPress={() => onToggle(p.id, dentro)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: sp(3),
              backgroundColor: c.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: dentro ? c.accent : c.border,
              padding: sp(3),
              opacity: !pode ? 0.5 : pressed ? 0.75 : 1,
            })}
          >
            <Caixa on={dentro} />
            <Avatar name={p.name} size={34} />
            <Text style={[type.label, { color: c.text, flex: 1 }]} numberOfLines={1}>
              {p.name}
            </Text>
            {p.isGuest ? <Pill tone="dim">CONVIDADO</Pill> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** A caixinha. Desenhada à mão porque RN não tem checkbox nativo. */
function Caixa({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: on ? c.accent : c.border,
        backgroundColor: on ? c.accent : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {on ? (
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "900" }}>✓</Text>
      ) : null}
    </View>
  );
}
