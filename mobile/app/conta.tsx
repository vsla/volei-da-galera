import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { renamePlayer } from "../lib/db";
import { c, sp, type } from "../lib/theme";
import { Avatar, Btn, Card, Field, H1, Muted, Row, Screen, Section } from "../components/ui";
import { Confirm } from "../components/Sheet";

/**
 * A CONTA.
 *
 * Pouca coisa de propósito. A conta aqui existe pra uma coisa só —
 * provar que você é você, em qualquer aparelho — e tudo que dá pra
 * mudar nela é o que afeta o que os outros veem na quadra.
 *
 * O NOME é o que importa, e ele não é "do perfil": é o nome do
 * `players`, o mesmo que aparece na lista, na fila e no time. Mudar
 * aqui muda na pelada inteira, inclusive nas sextas passadas — é a
 * mesma pessoa, então é a mesma linha.
 *
 * Não tem apagar conta. Apagar um `players` com partidas registradas
 * levaria o histórico de quem jogou CONTRA a pessoa junto — o mesmo
 * motivo pelo qual `sync_members` marca `removed` em vez de deletar.
 */
export default function Conta() {
  const { session, me, nomeDaConta, signOut, refreshMe } = useAuth();
  const router = useRouter();

  const [nome, setNome] = useState(me?.name ?? "");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [saindo, setSaindo] = useState(false);

  const email = session?.user.email ?? null;
  const mudouNome = nome.trim().length >= 2 && nome.trim() !== me?.name;

  async function salvarNome() {
    if (!me || !mudouNome) return;
    setBusy("nome");
    try {
      await renamePlayer(me.playerId, nome.trim());
      await refreshMe();
      Alert.alert("Pronto", "Seu nome mudou na pelada inteira.");
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function trocarSenha() {
    if (senha.length < 6) return;
    setBusy("senha");
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setSenha("");
      Alert.alert("Pronto", "Senha trocada. Ela vale no próximo login.");
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao trocar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <H1>Sua conta</H1>

      <Card style={{ marginTop: sp(4) }}>
        <Row gap={3}>
          <Avatar name={me?.name ?? nomeDaConta} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={[type.title, { color: c.text }]} numberOfLines={1}>
              {me?.name ?? nomeDaConta}
            </Text>
            <Text style={[type.tiny, { color: c.faint }]}>
              {email ?? "sem e-mail"}
            </Text>
          </View>
        </Row>
        {!me ? (
          <Text style={[type.tiny, { color: c.warn, marginTop: sp(3) }]}>
            Sua conta ainda não joga em nenhum grupo — e tudo bem. Crie o seu ou
            entre com um código: é aí que a gente pergunta quem você é na lista.
          </Text>
        ) : null}
      </Card>

      {me ? (
        <>
          <Section>Seu nome na pelada</Section>
          <Card>
            <Muted>
              É o nome que aparece na lista, na fila e no time. Muda em todas as
              sextas, inclusive nas que já passaram — é a mesma pessoa.
            </Muted>
            <View style={{ height: sp(3) }} />
            <Field
              value={nome}
              onChangeText={setNome}
              autoCapitalize="words"
              placeholder="Seu nome"
            />
            <Btn
              title={mudouNome ? "salvar o nome" : "nada mudou"}
              disabled={!mudouNome}
              loading={busy === "nome"}
              onPress={salvarNome}
            />
          </Card>
        </>
      ) : null}

      <Section>Senha</Section>
      <Card>
        <Muted>
          Trocar aqui vale pro próximo login. Quem entrou com Google não usa
          senha — pode ignorar.
        </Muted>
        <View style={{ height: sp(3) }} />
        <Field
          value={senha}
          onChangeText={setSenha}
          placeholder="Senha nova (mínimo 6)"
          secureTextEntry
          autoCapitalize="none"
        />
        <Btn
          title="trocar a senha"
          disabled={senha.length < 6}
          loading={busy === "senha"}
          onPress={trocarSenha}
        />
      </Card>

      <Section>Sair</Section>
      <Btn title="sair da conta" variant="danger" onPress={() => setSaindo(true)} />
      <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
        Seu nome continua na pelada, com nota e histórico. Entrar de novo com a
        mesma conta te devolve ele.
      </Text>

      <Btn
        title="voltar"
        variant="ghost"
        style={{ marginTop: sp(6) }}
        onPress={() => router.back()}
      />

      <Confirm
        visible={saindo}
        title="Sair da conta?"
        message={
          "Este aparelho esquece você. Nada da pelada é apagado — seu nome, sua " +
          "nota e as sextas que você jogou continuam lá."
        }
        confirmLabel="sair"
        busy={busy === "sair"}
        onClose={() => setSaindo(false)}
        onConfirm={async () => {
          setBusy("sair");
          await signOut();
          setBusy(null);
          setSaindo(false);
          router.replace("/login");
        }}
      />
    </Screen>
  );
}
