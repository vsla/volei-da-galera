import { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { archivePelada, fetchMyPeladas, type Pelada } from "../lib/db";
import { Avatar, Btn, Card, Empty, H1, Loading, Muted, Pill, Row, Section } from "../components/ui";
import { c, radius, sp, type } from "../lib/theme";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * A HOME — e o primeiro lugar onde o app virou self-service.
 *
 * Ela aceita uma conta SEM JOGADOR, que é o estado normal de quem acabou
 * de se cadastrar. Antes isso era tratado como pendência: o porteiro
 * mandava pra uma tela de "qual desses é você?" antes de deixar entrar.
 * Agora conta nova chega aqui, vê "nenhum grupo ainda", e tem as duas
 * portas na frente: criar o próprio, ou entrar no de um amigo. Virar
 * jogador é consequência de atravessar uma delas — não um pedágio.
 *
 * A lista é só a DELE (`fetchMyPeladas`). A versão antiga lia a tabela
 * inteira e filtrava na tela, o que era inofensivo com uma pelada no
 * banco e vira vazamento com mil.
 */
export default function MeusGrupos() {
  const { me, nomeDaConta, signOut } = useAuth();
  const router = useRouter();
  const [grupos, setGrupos] = useState<Pelada[] | null>(null);
  const [arquivados, setArquivados] = useState<Pelada[]>([]);
  const [verArquivados, setVerArquivados] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const id = me?.playerId ?? null;
    const [vivos, velhos] = await Promise.all([
      fetchMyPeladas(id),
      fetchMyPeladas(id, true),
    ]);
    setGrupos(vivos);
    setArquivados(velhos);
  }, [me?.playerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (grupos === null) return <Loading label="Carregando seus grupos…" />;

  async function desarquivar(g: Pelada) {
    setBusy(true);
    try {
      await archivePelada(g.id, false);
      await load();
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao desarquivar.");
    } finally {
      setBusy(false);
    }
  }

  const nome = me?.name ?? nomeDaConta;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: sp(4), paddingBottom: sp(24) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.dim}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <Row style={{ justifyContent: "space-between", marginBottom: sp(6) }}>
          <View style={{ flex: 1 }}>
            <Muted>Salve,</Muted>
            <H1>{nome.split(" ")[0]}</H1>
          </View>
          {/* O avatar É a porta da conta: é onde a mão já vai, e evita
              mais um botão numa tela que tem que caber num polegar. */}
          <Pressable onPress={() => router.push("/conta")} hitSlop={8}>
            <Avatar name={nome} size={48} />
          </Pressable>
        </Row>

        <Section>Meus grupos</Section>

        {grupos.length === 0 ? (
          <Empty
            title="Nenhum grupo ainda"
            hint="Cria o teu grupo ou entra no de um amigo com o código de convite."
          />
        ) : (
          <View style={{ gap: sp(3) }}>
            {grupos.map((g) => (
              <Card key={g.id} onPress={() => router.push(`/grupo/${g.id}`)}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Row gap={3} style={{ flex: 1 }}>
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: radius.md,
                        backgroundColor: c.accentDim,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 22 }}>🏐</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.label, { color: c.text, fontSize: 17 }]} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={[type.tiny, { color: c.dim, marginTop: 2 }]}>
                        {g.memberCount} {g.memberCount === 1 ? "membro" : "membros"}
                        {g.weekday !== null ? ` · ${WEEKDAYS[g.weekday]}` : ""}
                      </Text>
                    </View>
                  </Row>
                  {g.myRole === "owner" || g.myRole === "admin" ? (
                    <Pill tone="accent">{g.myRole === "owner" ? "DONO" : "ADMIN"}</Pill>
                  ) : null}
                </Row>
              </Card>
            ))}
          </View>
        )}

        <View style={{ gap: sp(2), marginTop: sp(6) }}>
          <Btn title="+ Criar grupo" onPress={() => router.push("/criar-grupo")} />
          <Btn
            title="Entrar com código"
            variant="ghost"
            onPress={() => router.push("/entrar-codigo")}
          />
        </View>

        {/* Arquivado não some do app de quem é dono, senão arquivar seria
            o mesmo que apagar — e a promessa era o contrário. */}
        {arquivados.length > 0 ? (
          <>
            <Section
              right={
                <Pressable onPress={() => setVerArquivados((v) => !v)} hitSlop={8}>
                  <Text style={[type.tiny, { color: c.accent }]}>
                    {verArquivados ? "esconder" : `ver (${arquivados.length})`}
                  </Text>
                </Pressable>
              }
            >
              Arquivados
            </Section>
            {verArquivados ? (
              <View style={{ gap: sp(2) }}>
                {arquivados.map((g) => (
                  <Card key={g.id}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.label, { color: c.dim }]} numberOfLines={1}>
                          {g.name}
                        </Text>
                        <Text style={[type.tiny, { color: c.faint, marginTop: 2 }]}>
                          nada foi apagado
                        </Text>
                      </View>
                      {g.myRole === "owner" ? (
                        <Btn
                          title="desarquivar"
                          variant="subtle"
                          small
                          loading={busy}
                          onPress={() => desarquivar(g)}
                        />
                      ) : null}
                    </Row>
                  </Card>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        <View style={{ marginTop: sp(10), alignItems: "center" }}>
          <Btn title="Sair da conta" variant="danger" small onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
