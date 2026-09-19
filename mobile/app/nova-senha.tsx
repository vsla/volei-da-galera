import { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { Btn, Field, H2, Muted, Screen } from "../components/ui";
import { c, sp, type } from "../lib/theme";

/**
 * Esqueci a senha — passo 2: escrever a nova.
 *
 * Só se chega aqui pelo link do e-mail: ele planta uma sessão de
 * recuperação (`lib/auth.tsx`) e o porteiro prende a pessoa nesta tela
 * até a senha trocar. Sair sem trocar desloga — sessão de recuperação
 * que sobra vira conta aberta por um e-mail antigo.
 */
export default function NovaSenha() {
  const { trocarSenha, signOut } = useAuth();
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function salvar() {
    setBusy(true);
    setMsg(null);
    try {
      await trocarSenha(senha);
      // A sessão continua viva — trocou a senha, já está dentro. O
      // porteiro leva pra home (ou pro "quem sou" no primeiro login).
      router.replace("/");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu pra trocar a senha.");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 40, marginTop: sp(10) }}>🔐</Text>
      <H2>Nova senha</H2>
      <Muted>Escolhe uma senha de pelo menos 6 caracteres. Depois é só entrar com ela.</Muted>

      <Field
        label="Senha nova"
        placeholder="mínimo 6 caracteres"
        value={senha}
        onChangeText={setSenha}
        secureTextEntry
        autoCapitalize="none"
        style={{ marginTop: sp(4) }}
      />

      {msg ? <Text style={[type.body, { color: c.warn, marginBottom: sp(3) }]}>{msg}</Text> : null}

      <Btn title="Salvar senha" loading={busy} disabled={senha.length < 6} onPress={salvar} />
      <Btn
        title="Cancelar"
        variant="ghost"
        style={{ marginTop: sp(2) }}
        onPress={async () => {
          await signOut();
          router.replace("/login");
        }}
      />
    </Screen>
  );
}
