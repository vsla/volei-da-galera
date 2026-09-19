import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { addMembers, syncMembers, type Member } from "../lib/db";
import { diffRoster, parseRoster, type Diff } from "../lib/roster-parse";
import { c, radius, sp, type } from "../lib/theme";
import { Btn, Card, Field, Muted } from "./ui";

/**
 * COLAR A LISTA DO GRUPO.
 *
 * Sexta de manhã, sentado: o bloco inteiro do WhatsApp, sem editar nada.
 * O parser (`shared/roster-parse.ts`) é o mesmo da web, testado contra as
 * listas reais de 04/09 e 11/09 — inclusive o `⁠` invisível que o
 * WhatsApp do iOS enfia entre o "1." e o nome.
 *
 * A prévia não é conveniência: sincronizar é a única operação do app que
 * TIRA gente da tela, e sem ver "saem 12" antes ninguém aperta com
 * confiança. Era isso que os `delete from players` mereciam.
 */
export function ColarLista({
  peladaId,
  members,
  onDone,
}: {
  peladaId: string;
  members: Member[];
  onDone: () => Promise<void> | void;
}) {
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);

  function conferir() {
    const lista = parseRoster(texto);
    if (!lista.length) {
      Alert.alert("Nada encontrado", "Não achei nome nenhum nesse texto.");
      return;
    }
    setPrevia(diffRoster(lista, members));
  }

  async function gravar() {
    if (!previa) return;
    setBusy(true);
    try {
      // A ordem importa: SOMA antes de sincronizar. Ao contrário, quem
      // está na lista colada mas ainda não é membro seria contado como
      // "fora da lista" — e o sync veria a tela antiga.
      if (previa.entram.length) await addMembers(peladaId, previa.entram);
      const sairam = await syncMembers(
        peladaId,
        parseRoster(texto).map((n) => n.name),
      );

      setPrevia(null);
      setTexto("");
      await onDone();
      Alert.alert(
        "Lista gravada",
        `${previa.entram.length} ${previa.entram.length === 1 ? "entrou" : "entraram"}, ` +
          `${sairam} ${sairam === 1 ? "saiu" : "saíram"} da tela.`,
      );
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao gravar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Muted>
        Cola o bloco do grupo inteiro — cabeçalho, numeração e tudo. Nome entre
        parênteses vira convidado.
      </Muted>
      <View style={{ height: sp(3) }} />
      <Field
        placeholder={"Vôlei Sexta 11/09 | Prainha ZN\n1. Miguel\n2. Suzana…"}
        value={texto}
        onChangeText={(t) => {
          setTexto(t);
          setPrevia(null);
        }}
        multiline
        numberOfLines={6}
        style={{ minHeight: 128, textAlignVertical: "top" }}
      />

      {previa ? (
        <>
          <Coluna titulo="entram" nomes={previa.entram.map((n) => n.name)} tone={c.ok} />
          <Coluna titulo="ficam" nomes={previa.ficam.map((m) => m.name)} tone={c.dim} />
          <Coluna titulo="saem" nomes={previa.saem.map((m) => m.name)} tone={c.warn} />
          {previa.saem.length > 0 ? (
            // Sem esta frase, "saem 12" parece perda de dados.
            <Text style={[type.tiny, { color: c.faint, marginBottom: sp(3) }]}>
              Nota e histórico ficam no banco — voltam se o nome voltar na semana
              que vem.
            </Text>
          ) : null}
          <Btn title="gravar a lista" loading={busy} onPress={gravar} />
          <Btn
            title="cancelar"
            variant="ghost"
            disabled={busy}
            onPress={() => setPrevia(null)}
          />
        </>
      ) : (
        <Btn title="conferir" disabled={!texto.trim()} onPress={conferir} />
      )}
    </Card>
  );
}

function Coluna({
  titulo,
  nomes,
  tone,
}: {
  titulo: string;
  nomes: string[];
  tone: string;
}) {
  return (
    <View
      style={{
        marginTop: sp(3),
        marginBottom: sp(1),
        paddingLeft: sp(3),
        borderLeftWidth: 3,
        borderLeftColor: tone,
        borderRadius: radius.sm,
      }}
    >
      <Text style={[type.section, { color: tone }]}>
        {titulo.toUpperCase()} ({nomes.length})
      </Text>
      <Text style={[type.body, { color: c.text, marginTop: sp(1) }]}>
        {nomes.length ? nomes.join(" · ") : "—"}
      </Text>
    </View>
  );
}
