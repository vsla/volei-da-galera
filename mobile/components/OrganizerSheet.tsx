import { useState } from "react";
import { Alert, Text } from "react-native";
import {
  reopenSession,
  resetScore,
  resetSession,
  swapSides,
  type LiveState,
} from "../lib/db";
import { c, sp, type } from "../lib/theme";
import { Confirm, Sheet, SheetRow } from "./Sheet";

type Perigo = "reset-placar" | "reabrir" | "reset-noite" | null;

/**
 * O MENU DE QUEM ORGANIZA.
 *
 * Três das quatro ações daqui desfazem alguma coisa, e é justamente por
 * isso que elas existem: §14 do `reasonable.md` conta que encerrar sem
 * querer era irreversível pela tela, e a saída era o SQL Editor.
 *
 * Cada uma que apaga passa por uma confirmação que DIZ O QUE SOME — §12.
 * "Tem certeza?" não informa nada às 22h com o celular na mão.
 */
export function OrganizerSheet({
  state,
  visible,
  onClose,
  onDone,
}: {
  state: LiveState;
  visible: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [perigo, setPerigo] = useState<Perigo>(null);
  const [busy, setBusy] = useState(false);

  const m = state.activeMatch;
  const temPartidas = state.history.length > 0 || m !== null;

  async function agir(fn: () => Promise<void>, erro: string) {
    setBusy(true);
    try {
      await fn();
      await onDone();
      setPerigo(null);
      onClose();
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : erro);
    } finally {
      setBusy(false);
    }
  }

  if (perigo === "reset-placar") {
    return (
      <Confirm
        visible
        title="Zerar o placar?"
        message="O placar desta rodada volta pra 0 — 0. Os times e a rodada continuam como estão."
        confirmLabel="zerar o placar"
        busy={busy}
        onClose={() => setPerigo(null)}
        onConfirm={() => agir(() => resetScore(m!.id), "Falhou ao zerar.")}
      />
    );
  }

  if (perigo === "reabrir") {
    return (
      <Confirm
        visible
        title="Reabrir a noite?"
        message={
          temPartidas
            ? "A noite volta pro estado de jogo. As partidas e o placar continuam onde estavam — nada é apagado."
            : "A noite volta pra aberta, esperando gente confirmar."
        }
        confirmLabel="reabrir"
        danger={false}
        busy={busy}
        onClose={() => setPerigo(null)}
        onConfirm={() =>
          agir(
            () => reopenSession(state.sessionId, temPartidas),
            "Falhou ao reabrir.",
          )
        }
      />
    );
  }

  if (perigo === "reset-noite") {
    return (
      <Confirm
        visible
        title="Recomeçar a noite?"
        message={
          `Apaga as ${state.history.length} rodadas de hoje, o placar e os votos de destaque. ` +
          "Quem fez check-in continua na lista, e a nota de ninguém muda. Não dá pra desfazer."
        }
        confirmLabel="apagar as rodadas de hoje"
        busy={busy}
        onClose={() => setPerigo(null)}
        onConfirm={() =>
          agir(() => resetSession(state.sessionId), "Falhou ao recomeçar.")
        }
      />
    );
  }

  return (
    <Sheet
      visible={visible}
      title="Organizar"
      subtitle={`Rodada ${state.round} · ${state.history.length} jogadas hoje`}
      onClose={onClose}
    >
      <SheetRow
        title="Trocar os lados"
        hint="Quem estava na esquerda vai pra direita. O placar acompanha."
        disabled={busy || !m}
        onPress={() => agir(() => swapSides(m!.id), "Falhou ao trocar os lados.")}
      />
      <SheetRow
        title="Zerar o placar da rodada"
        hint={m ? "Volta pra 0 — 0" : "não tem rodada rolando"}
        disabled={busy || !m}
        onPress={() => setPerigo("reset-placar")}
      />
      <SheetRow
        title="Reabrir a noite"
        hint="Pra quando o encerrar foi sem querer"
        disabled={busy || state.status !== "closed"}
        onPress={() => setPerigo("reabrir")}
      />
      <SheetRow
        title="Recomeçar a noite"
        hint="Apaga as rodadas de hoje. Não desfaz."
        disabled={busy || state.history.length === 0}
        onPress={() => setPerigo("reset-noite")}
      />
      <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
        Nota e histórico das outras sextas não são tocados por nada daqui.
      </Text>
    </Sheet>
  );
}
