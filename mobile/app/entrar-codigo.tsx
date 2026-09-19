import { useState } from "react";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import { peekPelada } from "../lib/db";
import { Btn, Field, H2, Muted, Screen } from "../components/ui";
import { c, sp, type } from "../lib/theme";

/**
 * O código do grupo — só o campo.
 *
 * Antes esta tela ENTRAVA: digitava o código e `join_pelada` já criava
 * um jogador. Isso punha a escrita antes da pergunta, e a pergunta é
 * justamente "você não é alguém que já está nessa lista?".
 *
 * Agora ela só confere que o código existe (`peek_pelada`, leitura pura)
 * e passa a bola pra `/entrar/<código>`, que pergunta e só então grava.
 */
export default function EntrarCodigo() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function conferir() {
    setBusy(true);
    setMsg(null);
    try {
      const p = await peekPelada(code);
      if (!p) {
        setMsg("Código não encontrado. Confere com quem te chamou.");
        return;
      }
      if (p.archived) {
        setMsg(`O ${p.name} foi arquivado por quem organiza.`);
        return;
      }
      router.replace(`/entrar/${code.trim().toUpperCase()}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu pra conferir o código.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H2>Entrar num grupo</H2>
      <Muted>Pede o código pra quem organiza. São 6 caracteres.</Muted>

      <Field
        label="Código do convite"
        placeholder="ABC123"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        style={{ fontSize: 26, letterSpacing: 6, textAlign: "center", fontWeight: "800" }}
      />

      {msg ? <Text style={[type.body, { color: c.warn, marginBottom: sp(3) }]}>{msg}</Text> : null}

      <Btn title="Continuar" loading={busy} disabled={code.trim().length < 4} onPress={conferir} />
      <Btn
        title="Cancelar"
        variant="ghost"
        style={{ marginTop: sp(2) }}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
