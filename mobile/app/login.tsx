import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { Btn, Field, H1, H2, Muted, Row, Screen } from "../components/ui";
import { c, sp, type } from "../lib/theme";

type Mode = "entrar" | "criar";

/**
 * A PORTA DO APP.
 *
 * Três coisas mudaram quando ele virou self-service:
 *
 *   1. "Esqueci minha senha" aparece nos DOIS modos. Estava escondido
 *      atrás do modo "entrar", e quem não lembra a senha muitas vezes
 *      está justo em "criar conta", tentando de novo;
 *   2. cadastro que precisa de confirmação de e-mail virou uma TELA, com
 *      botão de reenviar. Antes era um texto amarelo de erro numa conta
 *      que tinha sido criada com sucesso;
 *   3. depois de entrar, ninguém mais é interrogado sobre "qual desses é
 *      você?". Essa pergunta é de dentro de um grupo, e mora lá.
 */
export default function Login() {
  const {
    signInEmail,
    signUpEmail,
    signInGoogle,
    reenviarConfirmacao,
    avisoDoLink,
    limparAvisoDoLink,
  } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("entrar");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** Conta criada, mas o projeto exige confirmar o e-mail antes de entrar. */
  const [confirmar, setConfirmar] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Deu ruim. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    email.includes("@") && password.length >= 6 && (mode === "entrar" || name.trim().length > 1);

  if (confirmar) {
    return (
      <Screen>
        <Text style={{ fontSize: 40, marginTop: sp(10) }}>📬</Text>
        <H2>Confirme seu e-mail</H2>
        <Muted>
          A conta foi criada. Mandamos um link pra {email.trim()} — toque nele
          no celular e volte aqui pra entrar.
        </Muted>

        {msg ? (
          <Text style={[type.body, { color: c.warn, marginTop: sp(4) }]}>{msg}</Text>
        ) : null}

        <Btn
          title={reenviado ? "link reenviado" : "reenviar o link"}
          variant="subtle"
          loading={busy}
          disabled={reenviado}
          style={{ marginTop: sp(6) }}
          onPress={() =>
            run(async () => {
              await reenviarConfirmacao(email);
              setReenviado(true);
            })
          }
        />
        <Btn
          title="já confirmei — entrar"
          style={{ marginTop: sp(2) }}
          onPress={() => {
            setConfirmar(false);
            setReenviado(false);
            setMode("entrar");
            setMsg(null);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ marginTop: sp(14), marginBottom: sp(8) }}>
          <Text style={{ fontSize: 44 }}>🏐</Text>
          <H1>Vôlei da Galera</H1>
          <Muted>Cria o grupo, chama a galera, roda a pelada.</Muted>
        </View>

        <Row gap={2} style={{ marginBottom: sp(5) }}>
          <Btn
            title="Entrar"
            small
            variant={mode === "entrar" ? "primary" : "subtle"}
            onPress={() => setMode("entrar")}
            style={{ flex: 1 }}
          />
          <Btn
            title="Criar conta"
            small
            variant={mode === "criar" ? "primary" : "subtle"}
            onPress={() => setMode("criar")}
            style={{ flex: 1 }}
          />
        </Row>

        {mode === "criar" && (
          <Field
            label="Seu nome"
            placeholder="Como a galera te chama"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        )}

        <Field
          label="E-mail"
          placeholder="voce@email.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />

        <Field
          label="Senha"
          placeholder="mínimo 6 caracteres"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {msg ?? avisoDoLink ? (
          <Text style={[type.body, { color: c.warn, marginBottom: sp(3) }]}>
            {msg ?? avisoDoLink}
          </Text>
        ) : null}

        <Btn
          title={mode === "entrar" ? "Entrar" : "Criar conta"}
          loading={busy}
          disabled={!canSubmit}
          onPress={() =>
            run(async () => {
              if (mode === "entrar") {
                await signInEmail(email, password);
                return;
              }
              if (await signUpEmail(name, email, password)) setConfirmar(true);
            })
          }
        />

        <Pressable
          onPress={() => {
            limparAvisoDoLink();
            router.push({ pathname: "/esqueci-senha", params: { email: email.trim() } });
          }}
          style={{ alignSelf: "center", paddingVertical: sp(3) }}
          hitSlop={8}
        >
          <Text style={[type.label, { color: c.accent }]}>Esqueci minha senha</Text>
        </Pressable>

        <Row gap={3} style={{ marginVertical: sp(5) }}>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          <Text style={[type.tiny, { color: c.faint }]}>OU</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        </Row>

        <Btn title="Continuar com Google" variant="ghost" onPress={() => run(signInGoogle)} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
