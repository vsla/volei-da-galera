import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useGrupo } from "../../../lib/grupo-ctx";
import {
  addMember,
  archivePelada,
  inviteMember,
  leavePelada,
  regenerateJoinCode,
  removePeladaMember,
  renamePelada,
  setMemberRole,
  transferPeladaOwner,
  type Member,
} from "../../../lib/db";
import {
  Avatar,
  Btn,
  Card,
  Empty,
  Field,
  H1,
  Loading,
  Muted,
  Pill,
  Row,
  Section,
} from "../../../components/ui";
import { Confirm, Sheet, SheetRow } from "../../../components/Sheet";
import { c, radius, sp, type } from "../../../lib/theme";
import { ColarLista } from "../../../components/ColarLista";
import { Regras } from "../../../components/Regras";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** O que a gaveta de confirmação está prestes a fazer. */
type Perigo =
  | { tipo: "remover"; m: Member }
  | { tipo: "passar"; m: Member }
  | { tipo: "codigo" }
  | { tipo: "sair" }
  | { tipo: "arquivar" }
  | null;

/**
 * A ABA GRUPO — tudo que existe fora da noite de jogo.
 *
 * Ela cresceu porque o app virou self-service. Quando havia uma pelada
 * no banco e um dono, você, quase nada aqui precisava existir: o grupo
 * não mudava de nome, ninguém entrava errado e ninguém queria sair.
 * Com qualquer um criando o próprio grupo e chamando amigos, cada um
 * desses vira o caso normal de alguém.
 *
 * O que ela deixa fazer, e por que cada um está aqui:
 *
 *   identidade do grupo — nome e dia mudam (`rename_pelada`); o `slug`
 *     não, porque ele já está no link que caiu no WhatsApp;
 *   o código — mostrar, compartilhar e TROCAR: código vive em grupo de
 *     WhatsApp, e grupo de WhatsApp vaza;
 *   as pessoas — promover, rebaixar, mandar o link pessoal, remover;
 *   passar o grupo — o dono não pode sair deixando o grupo sem dono;
 *   arquivar — o "excluir pelada" que não apaga nada.
 *
 * O QUE ELA NÃO FAZ: apagar um grupo com histórico. Três meses de sexta
 * guardam nota, partida e destaque de gente que talvez nem use mais o
 * app, e queimar isso pra limpar uma linha de lista é troca ruim.
 * Arquivar tira da frente de todo mundo e é reversível — e o banco só
 * apaga de vez o que comprovadamente não tem nada pra preservar
 * (`remove_pelada_member`, 0026).
 */
export default function Gestao() {
  const { grupo, members, state, isAdmin, isOwner, myPlayerId, loading, reload, reloadGrupo } =
    useGrupo();
  const router = useRouter();

  const [novo, setNovo] = useState("");
  const [nome, setNome] = useState<string | null>(null);
  const [dia, setDia] = useState<number | null | undefined>(undefined);
  const [sel, setSel] = useState<Member | null>(null);
  const [perigo, setPerigo] = useState<Perigo>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  if (loading && !grupo) return <Loading label="Carregando o grupo…" />;

  const ativos = members.filter((m) => m.status !== "removed");
  const admins = ativos.filter((m) => m.role === "owner" || m.role === "admin");
  // O rascunho do formulário começa igual ao que está salvo, e só existe
  // depois que a pessoa digita — assim o poll de 5s não apaga o que ela
  // está escrevendo.
  const nomeAtual = nome ?? grupo?.name ?? "";
  const diaAtual = dia === undefined ? (grupo?.weekday ?? null) : dia;
  const mudouIdentidade =
    grupo != null &&
    nomeAtual.trim().length >= 2 &&
    (nomeAtual.trim() !== grupo.name || diaAtual !== grupo.weekday);

  async function correr(fn: () => Promise<void>, erro = "Não deu") {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(erro, e instanceof Error ? e.message : "Tenta de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function adicionar() {
    if (!grupo || novo.trim().length < 2) return;
    await correr(async () => {
      await addMember(grupo.id, novo.trim(), false);
      setNovo("");
      await reload();
    }, "Erro ao adicionar");
  }

  async function salvarIdentidade() {
    if (!grupo || !mudouIdentidade) return;
    await correr(async () => {
      await renamePelada(grupo.id, nomeAtual.trim(), diaAtual);
      await reloadGrupo();
      setNome(null);
      setDia(undefined);
    }, "Erro ao salvar");
  }

  /**
   * O link pessoal de UMA pessoa da lista.
   *
   * Diferente do código do grupo: o código serve pra qualquer um entrar
   * como si mesmo, e este link diz QUEM a pessoa é. É o que fecha o furo
   * do §9b do `reasonable.md` — escolher o próprio nome numa lista é
   * auto-serviço, e alguém já votou a noite inteira como outra pessoa.
   * Com conta, esse engano seria permanente.
   *
   * Vale uma vez só. Gerar de novo invalida o anterior, o que é o certo
   * pra quando o link vaza no grupo errado.
   */
  async function linkDe(m: Member) {
    if (!grupo) return;
    try {
      const { token } = await inviteMember(grupo.id, m.name);
      const url = Linking.createURL(`/convite/${token}`);
      await Share.share({
        message:
          `${m.name}, teu lugar no ${grupo.name} tá guardado 🏐\n\n` +
          `Abre esse link no celular pra entrar como você mesmo:\n${url}\n\n` +
          `Serve uma vez só.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao gerar o convite.";
      Alert.alert(
        "Não deu pra convidar",
        msg.includes("organizadores") || msg.includes("organiza")
          ? "O banco não te reconhece como organizador. Isso acontece quando a " +
              "sua conta ainda não está ligada ao seu nome na lista — entre no " +
              "grupo pelo código e toque no seu nome, ou peça o link pra quem é dono."
          : msg,
      );
    }
  }

  async function compartilharCodigo() {
    if (!grupo?.joinCode) {
      Alert.alert("Sem código", "Esse grupo ainda não tem código de convite.");
      return;
    }
    await Share.share({
      message:
        `Bora jogar vôlei no ${grupo.name}? 🏐\n\n` +
        `Baixa o app e entra com o código: ${grupo.joinCode}`,
    });
  }

  async function confirmarPerigo() {
    if (!perigo || !grupo) return;
    await correr(async () => {
      switch (perigo.tipo) {
        case "remover": {
          const r = await removePeladaMember(grupo.id, perigo.m.playerId);
          await reload();
          Alert.alert(
            r === "deleted" ? "Apagado de vez" : "Saiu da lista",
            r === "deleted"
              ? `${perigo.m.name} não tinha conta nem partida registrada — não sobrou nada no banco.`
              : `${perigo.m.name} saiu do grupo. O nome continua nas partidas já jogadas, ` +
                  "porque apagar levaria junto o histórico de quem jogou com ele.",
          );
          break;
        }
        case "passar":
          await transferPeladaOwner(grupo.id, perigo.m.playerId);
          await reload();
          break;
        case "codigo": {
          const novoCodigo = await regenerateJoinCode(grupo.id);
          await reloadGrupo();
          Alert.alert("Código novo", `Agora é ${novoCodigo}. O anterior parou de funcionar.`);
          break;
        }
        case "sair":
          await leavePelada(grupo.id);
          router.replace("/");
          break;
        case "arquivar":
          await archivePelada(grupo.id, true);
          router.replace("/");
          break;
      }
      setPerigo(null);
      setSel(null);
    });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: sp(4), paddingBottom: sp(12) }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.dim}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([reload(), reloadGrupo()]);
              setRefreshing(false);
            }}
          />
        }
      >
        <Btn
          title="‹ Meus grupos"
          variant="ghost"
          small
          style={{ alignSelf: "flex-start", marginBottom: sp(3) }}
          onPress={() => router.replace("/")}
        />

        <H1>{grupo?.name ?? "Grupo"}</H1>
        <Muted>
          {ativos.length} {ativos.length === 1 ? "membro" : "membros"} · {admins.length}{" "}
          {admins.length === 1 ? "admin" : "admins"}
        </Muted>

        {/* ── O código ─────────────────────────────────────────── */}
        <Section>Convite</Section>
        <Card>
          <Muted>Quem tiver esse código entra direto no grupo.</Muted>
          <Text
            style={{
              color: c.accent,
              fontSize: 34,
              fontWeight: "800",
              letterSpacing: 8,
              textAlign: "center",
              marginVertical: sp(4),
            }}
            adjustsFontSizeToFit
            numberOfLines={1}
          >
            {grupo?.joinCode ?? "······"}
          </Text>
          <Btn title="Compartilhar convite" onPress={compartilharCodigo} />
          {isAdmin ? (
            <>
              <Btn
                title="trocar o código"
                variant="ghost"
                small
                style={{ marginTop: sp(2) }}
                onPress={() => setPerigo({ tipo: "codigo" })}
              />
              <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
                Use quando o código vazar pro grupo errado. O antigo para de
                funcionar na hora; quem já entrou continua dentro.
              </Text>
            </>
          ) : null}
        </Card>

        {/* ── Nome e dia ───────────────────────────────────────── */}
        {isAdmin && grupo ? (
          <>
            <Section>Nome e dia</Section>
            <Card>
              <Field
                label="Nome do grupo"
                value={nomeAtual}
                onChangeText={setNome}
                autoCapitalize="words"
                placeholder="Ex: Prainha ZN"
              />
              <Text style={[type.label, { color: c.dim, marginBottom: sp(1.5) }]}>
                Dia da semana
              </Text>
              <Row gap={1.5} style={{ flexWrap: "wrap", marginBottom: sp(4) }}>
                {DIAS.map((d, i) => {
                  const on = diaAtual === i;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setDia(on ? null : i)}
                      style={{
                        paddingVertical: sp(2),
                        paddingHorizontal: sp(3),
                        borderRadius: radius.pill,
                        backgroundColor: on ? c.accent : c.surface2,
                        borderWidth: 1,
                        borderColor: on ? c.accent : c.border,
                      }}
                    >
                      <Text style={[type.tiny, { color: on ? c.accentInk : c.dim }]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </Row>
              <Btn
                title={mudouIdentidade ? "salvar" : "nada mudou"}
                disabled={!mudouIdentidade}
                loading={busy}
                onPress={salvarIdentidade}
              />
              <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
                O endereço do grupo não muda junto — ele já está no link que caiu
                no WhatsApp, e link que morre é pior que nome desatualizado.
              </Text>
            </Card>
          </>
        ) : null}

        {/* ── A lista da semana ────────────────────────────────── */}
        {isAdmin && grupo ? (
          <>
            <Section>A lista da semana</Section>
            <ColarLista peladaId={grupo.id} members={members} onDone={reload} />
          </>
        ) : null}

        {isAdmin ? (
          <>
            <Section>Adicionar alguém</Section>
            <Card>
              <Muted>
                Cadastra quem já joga mas ainda não tem o app. A pessoa aparece na lista e
                pode reivindicar o cadastro depois.
              </Muted>
              <View style={{ height: sp(3) }} />
              <Field
                placeholder="Nome da pessoa"
                value={novo}
                onChangeText={setNovo}
                autoCapitalize="words"
                onSubmitEditing={adicionar}
              />
              <Btn
                title="Adicionar ao grupo"
                loading={busy}
                disabled={novo.trim().length < 2}
                onPress={adicionar}
              />
            </Card>
          </>
        ) : null}

        {isAdmin && grupo && state ? (
          <>
            <Section>As regras</Section>
            <Regras peladaId={grupo.id} settings={state.settings} onDone={reload} />
          </>
        ) : null}

        {/* ── As pessoas ───────────────────────────────────────── */}
        <Section>Membros</Section>
        {ativos.length === 0 ? (
          <Empty title="Ninguém ainda" hint="Adiciona a galera ou manda o código de convite." />
        ) : (
          <View style={{ gap: sp(2) }}>
            {ativos.map((m) => (
              <Card
                key={m.playerId}
                style={{ paddingVertical: sp(3) }}
                onPress={isAdmin ? () => setSel(m) : undefined}
              >
                <Row gap={3}>
                  <Avatar name={m.name} size={38} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.label, { color: c.text }]} numberOfLines={1}>
                      {m.name}
                      {m.playerId === myPlayerId ? "  (você)" : ""}
                    </Text>
                    <Text style={[type.tiny, { color: c.faint, marginTop: 2 }]}>
                      nota {m.rating.toFixed(1)}
                      {m.status === "invited" ? " · convite pendente" : ""}
                    </Text>
                  </View>
                  {m.role === "owner" ? (
                    <Pill tone="accent">DONO</Pill>
                  ) : m.role === "admin" ? (
                    <Pill tone="accent">ADMIN</Pill>
                  ) : m.isGuest ? (
                    <Pill tone="dim">CONVIDADO</Pill>
                  ) : null}
                </Row>
              </Card>
            ))}
          </View>
        )}

        {isAdmin && ativos.length > 0 ? (
          <View
            style={{
              marginTop: sp(3),
              padding: sp(3),
              borderRadius: radius.md,
              backgroundColor: c.surface2,
            }}
          >
            <Text style={[type.tiny, { color: c.faint }]}>
              Toca num membro pra mandar o link pessoal, tornar admin ou remover.
            </Text>
          </View>
        ) : null}

        {/* ── A porta de saída ─────────────────────────────────── */}
        <Section>Este grupo</Section>
        {isOwner ? (
          <Card>
            <Muted>
              Arquivar tira o grupo da lista de todo mundo e fecha o código. Nada
              é apagado: nota, partidas e destaques continuam no banco, e dá pra
              desarquivar na tela inicial.
            </Muted>
            <View style={{ height: sp(3) }} />
            <Btn title="arquivar o grupo" variant="danger" onPress={() => setPerigo({ tipo: "arquivar" })} />
            <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
              Quer sair sem fechar o grupo? Toque em alguém da lista e passe o
              grupo pra essa pessoa primeiro.
            </Text>
          </Card>
        ) : (
          <Card>
            <Muted>
              Sair tira você da lista. Suas partidas continuam registradas, e
              voltar é entrar com o código de novo — com a mesma nota.
            </Muted>
            <View style={{ height: sp(3) }} />
            <Btn title="sair do grupo" variant="danger" onPress={() => setPerigo({ tipo: "sair" })} />
          </Card>
        )}
      </ScrollView>

      {/* ── A gaveta de um membro ──────────────────────────────── */}
      <Sheet
        visible={sel !== null && perigo === null}
        title={sel?.name ?? ""}
        subtitle={sel?.role === "owner" ? "dono do grupo" : undefined}
        onClose={() => setSel(null)}
      >
        <SheetRow
          title="Mandar link de convite"
          hint="entra como essa pessoa, uma vez só"
          onPress={() => sel && linkDe(sel)}
        />
        {sel && sel.role !== "owner" ? (
          <SheetRow
            title={sel.role === "admin" ? "Tirar de admin" : "Tornar admin"}
            hint="admin cola a lista, gera times e registra vencedor"
            onPress={() =>
              correr(async () => {
                if (!grupo) return;
                await setMemberRole(grupo.id, sel.playerId, sel.role === "admin" ? "player" : "admin");
                await reload();
                setSel(null);
              })
            }
          />
        ) : null}
        {isOwner && sel && sel.playerId !== myPlayerId ? (
          <SheetRow
            title="Passar o grupo pra essa pessoa"
            hint="ela vira dona; você continua admin"
            onPress={() => setPerigo({ tipo: "passar", m: sel })}
          />
        ) : null}
        {sel && sel.role !== "owner" ? (
          <SheetRow
            title="Remover do grupo"
            hint="sem conta e sem partida, some de vez"
            onPress={() => setPerigo({ tipo: "remover", m: sel })}
          />
        ) : null}
      </Sheet>

      <Confirm
        visible={perigo !== null}
        danger={perigo?.tipo !== "passar"}
        busy={busy}
        title={tituloDoPerigo(perigo)}
        message={recadoDoPerigo(perigo, grupo?.name ?? "o grupo")}
        confirmLabel={rotuloDoPerigo(perigo)}
        onClose={() => setPerigo(null)}
        onConfirm={confirmarPerigo}
      />
    </SafeAreaView>
  );
}

/**
 * §12 do `reasonable.md`: a confirmação DIZ O QUE SOME.
 *
 * "Tem certeza?" não informa nada às 22h com o celular na mão, e as
 * ações daqui não são todas iguais — remover alguém que nunca jogou
 * apaga de verdade, e o texto precisa admitir isso.
 */
function tituloDoPerigo(p: Perigo): string {
  switch (p?.tipo) {
    case "remover":
      return `Remover ${p.m.name}?`;
    case "passar":
      return `Passar o grupo pra ${p.m.name}?`;
    case "codigo":
      return "Trocar o código?";
    case "sair":
      return "Sair do grupo?";
    case "arquivar":
      return "Arquivar o grupo?";
    default:
      return "";
  }
}

function recadoDoPerigo(p: Perigo, grupo: string): string {
  switch (p?.tipo) {
    case "remover":
      return (
        `${p.m.name} sai da lista do ${grupo}. Se essa pessoa nunca entrou em ` +
        "quadra, não votou e não tem conta, o cadastro é apagado de vez — não " +
        "há nada pra guardar. Se já jogou, o nome fica nas partidas dela."
      );
    case "passar":
      return (
        `${p.m.name} vira dona do ${grupo}: passa a poder arquivar o grupo e ` +
        "passar a bola de novo. Você continua admin, organizando a pelada."
      );
    case "codigo":
      return (
        "O código atual para de funcionar na hora — quem tentar entrar com ele " +
        "vai ouvir que não existe. Quem já está no grupo não é afetado."
      );
    case "sair":
      return (
        `Você sai da lista do ${grupo}. Suas partidas continuam registradas, e ` +
        "voltar é entrar com o código de novo, com a mesma nota."
      );
    case "arquivar":
      return (
        `O ${grupo} some da lista de todo mundo e o código para de funcionar. ` +
        "Nada é apagado: nota, partidas e destaques continuam no banco, e você " +
        "pode desarquivar na tela inicial."
      );
    default:
      return "";
  }
}

function rotuloDoPerigo(p: Perigo): string {
  switch (p?.tipo) {
    case "remover":
      return "remover";
    case "passar":
      return "passar o grupo";
    case "codigo":
      return "trocar";
    case "sair":
      return "sair";
    case "arquivar":
      return "arquivar";
    default:
      return "confirmar";
  }
}
