import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import {
  claimPlayer,
  claimableMembers,
  joinPeladaByCode,
  peekPelada,
  type Claimable,
  type PeladaPreview,
} from "../../lib/db";
import { Avatar, Btn, Card, Empty, H1, Loading, Muted, Screen, Section } from "../../components/ui";
import { Confirm } from "../../components/Sheet";
import { c, sp, type } from "../../lib/theme";

/**
 * "VOCÊ JÁ ESTÁ NESSA LISTA?"
 *
 * Esta pergunta já foi feita no lugar errado. A tela antiga (`quem-sou`)
 * aparecia logo depois do LOGIN, lia a tabela `peladas` inteira e
 * oferecia os nomes do primeiro grupo que achasse — o que fazia sentido
 * quando o banco tinha uma pelada só, a Prainha, e quem instalava o app
 * já era da lista. Num app self-service isso vira: crio conta pra abrir
 * o MEU grupo e o app me pergunta se eu sou o Miguel de um grupo de
 * estranhos.
 *
 * A pergunta é do GRUPO, não da conta. Ela só faz sentido no momento em
 * que você entra em um, porque é aí que existe uma lista pra você estar
 * dentro — e por isso ela mora aqui, atrás do código de convite.
 *
 * QUEM VÊ A PERGUNTA: só quem ainda não é jogador nenhum. Se a sua conta
 * já está ligada a um nome, você já é alguém — entra como você mesmo,
 * sem escolher nada. Ligar a sua conta a um nome que já está na lista
 * daquele grupo é trabalho do organizador, pelo link pessoal da aba
 * Grupo (`claim_roster_invite`), justamente porque auto-serviço aqui
 * tem o furo do §9b do `reasonable.md`.
 *
 * Só aparecem nomes SEM DONO (`claimable_members`, 0026). Nome já
 * reivindicado não está na lista, e essa é a trava inteira.
 */
export default function EntrarNoGrupo() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { me, nomeDaConta, refreshMe } = useAuth();
  const router = useRouter();

  const [grupo, setGrupo] = useState<PeladaPreview | null>(null);
  const [nomes, setNomes] = useState<Claimable[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [alvo, setAlvo] = useState<Claimable | null>(null);
  const [busy, setBusy] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const p = await peekPelada(code ?? "");
      if (!p) {
        setErro("Esse código não existe. Confere com quem te chamou.");
        return;
      }
      if (p.archived) {
        setErro(`O ${p.name} foi arquivado por quem organiza.`);
        return;
      }
      setGrupo(p);
      // Quem já é jogador não escolhe nome nenhum — a lista nem carrega.
      setNomes(me ? [] : await claimableMembers(p.id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra abrir o grupo.");
    } finally {
      setCarregando(false);
    }
  }, [code, me?.playerId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Entra de fato. `joinPeladaByCode` é quem escreve — tudo até aqui foi
   * leitura, de propósito.
   *
   * `playerId` manda no que acontece lá dentro: com um id, a filiação vai
   * pro jogador que você já é (ou que acabou de reivindicar); sem id, o
   * banco abre um jogador novo, e aí a conta precisa reivindicá-lo na
   * sequência — senão a pessoa vira dona de nada e `is_pelada_admin()`
   * não a reconhece nem no próprio grupo.
   */
  async function entrar(playerId: string | null, nome: string) {
    if (!grupo) return;
    setBusy(true);
    try {
      const res = await joinPeladaByCode(code ?? "", nome, playerId);
      if (!res) throw new Error("O grupo sumiu no meio do caminho.");
      if (!me) {
        const ok = await claimPlayer(res.playerId);
        if (!ok && playerId) {
          Alert.alert(
            "Esse nome já tem dono",
            `Alguém entrou como ${nome} enquanto você decidia. Se for você em ` +
              "outro aparelho, entre com a mesma conta. Se foi engano, peça o " +
              "link de convite pra quem organiza.",
          );
          await carregar();
          return;
        }
        await refreshMe();
      }
      router.replace(`/grupo/${res.id}`);
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao entrar.");
    } finally {
      setBusy(false);
      setAlvo(null);
    }
  }

  if (carregando) return <Loading label="Abrindo o grupo…" />;

  if (erro || !grupo) {
    return (
      <Screen>
        <H1>Convite</H1>
        <Muted>{erro}</Muted>
        <Btn
          title="tentar outro código"
          style={{ marginTop: sp(5) }}
          onPress={() => router.replace("/entrar-codigo")}
        />
        <Btn
          title="voltar"
          variant="ghost"
          style={{ marginTop: sp(2) }}
          onPress={() => router.replace("/")}
        />
      </Screen>
    );
  }

  // Já sou alguém: não há o que escolher. Uma conta, um jogador.
  if (me) {
    return (
      <Screen>
        <Text style={{ fontSize: 40, marginTop: sp(8) }}>🏐</Text>
        <H1>{grupo.name}</H1>
        <Muted>
          {grupo.memberCount} {grupo.memberCount === 1 ? "pessoa" : "pessoas"} nesse grupo.
          Você entra como {me.name}.
        </Muted>
        <Btn
          title="entrar no grupo"
          loading={busy}
          style={{ marginTop: sp(6) }}
          onPress={() => entrar(me.playerId, me.name)}
        />
        <Btn
          title="cancelar"
          variant="ghost"
          style={{ marginTop: sp(2) }}
          onPress={() => router.replace("/")}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={{ fontSize: 40, marginTop: sp(6) }}>🏐</Text>
      <H1>{grupo.name}</H1>
      <Muted>
        {grupo.memberCount} {grupo.memberCount === 1 ? "pessoa" : "pessoas"} nesse grupo.
      </Muted>

      {nomes.length > 0 ? (
        <>
          <Section>Você já está na lista?</Section>
          <Muted>
            Toque no seu nome pra continuar com a nota e o histórico que ele já tem.
          </Muted>
          <View style={{ gap: sp(2), marginTop: sp(3) }}>
            {nomes.map((n) => (
              <Card key={n.playerId} onPress={() => setAlvo(n)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: sp(3) }}>
                  <Avatar name={n.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.label, { color: c.text }]}>{n.name}</Text>
                    <Text style={[type.tiny, { color: c.faint }]}>
                      nota {n.rating.toFixed(1)}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        </>
      ) : (
        <Empty
          title="Nenhum nome esperando dono"
          hint="Todo mundo da lista já tem conta — ou quem organiza ainda não colou a lista da semana."
        />
      )}

      <Section>Não está aí?</Section>
      <Btn
        title={`entrar como ${nomeDaConta}`}
        variant={nomes.length > 0 ? "subtle" : "primary"}
        loading={busy && alvo === null}
        onPress={() => entrar(null, nomeDaConta)}
      />
      <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
        Você entra como pessoa nova, com nota inicial. Se depois aparecer que
        você já estava na lista com outro nome, quem organiza junta os dois.
      </Text>

      <Btn
        title="cancelar"
        variant="ghost"
        style={{ marginTop: sp(6) }}
        onPress={() => router.replace("/")}
      />

      <Confirm
        visible={alvo !== null}
        danger={false}
        title={`Você é ${alvo?.name ?? ""}?`}
        message={
          "Esse nome fica ligado à sua conta pra sempre — em qualquer aparelho " +
          "que você entrar, você é essa pessoa. Se errar, só quem organiza desfaz."
        }
        confirmLabel="sou eu"
        busy={busy}
        onClose={() => setAlvo(null)}
        onConfirm={() => alvo && entrar(alvo.playerId, alvo.name)}
      />
    </Screen>
  );
}
