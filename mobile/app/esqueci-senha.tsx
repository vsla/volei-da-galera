import { useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { Btn, Field, H2, Muted, Screen } from "../components/ui";
import { c, sp, type } from "../lib/theme";

/**
 * Esqueci a senha — passo 1: pedir o link.
 *
 * Não dizemos se o e-mail existe ou não. Primeiro porque contar isso é
 * entregar quem está no app pra quem só tem uma lista de e-mails;
 * segundo porque o Supabase responde igual nos dois casos de propósito.
 * A tela fala do envio, não da conta.
 */
export default function EsqueciSenha() {
  const { enviarLinkDeSenha } = useAuth();
  const router = useRouter();
  // O login passa o que a pessoa já digitou — ninguém quer escrever o
  // e-mail duas vezes com o teclado do celular.
  const { email: inicial } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(inicial ?? "");
  const [busy, setBusy] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function enviar() {
    setBusy(true);
    setMsg(null);
    try {
      await enviarLinkDeSenha(email);
      setEnviado(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu pra enviar. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (enviado) {
    return (
      <Screen>
        <Text style={{ fontSize: 40, marginTop: sp(10) }}>📬</Text>
        <H2>Link enviado</H2>
        <Muted>
          Se existir conta com {email.trim()}, o link de troca de senha chegou lá. Abra o e-mail
          no celular e toque no link — ele abre o app direto na tela da senha nova.
        </Muted>
        <Btn title="Voltar pro login" style={{ marginTop: sp(6) }} onPress={() => router.replace("/login")} />
        <Btn
          title="Enviar de novo"
          variant="ghost"
          style={{ marginTop: sp(2) }}
          onPress={() => setEnviado(false)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={{ fontSize: 40, marginTop: sp(10) }}>🔑</Text>
      <H2>Esqueci minha senha</H2>
      <Muted>Diz o e-mail da conta que a gente manda um link pra você criar outra.</Muted>

      <Field
        label="E-mail"
        placeholder="voce@email.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        style={{ marginTop: sp(4) }}
      />

      {msg ? <Text style={[type.body, { color: c.warn, marginBottom: sp(3) }]}>{msg}</Text> : null}

      <Btn title="Enviar link" loading={busy} disabled={!email.includes("@")} onPress={enviar} />
      <Btn
        title="Voltar"
        variant="ghost"
        style={{ marginTop: sp(2) }}
        onPress={() => router.replace("/login")}
      />
    </Screen>
  );
}
