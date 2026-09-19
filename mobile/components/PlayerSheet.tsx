import { useState } from "react";
import { Alert, Text, View } from "react-native";
import {
  leaveSession,
  movePlayer,
  rejoinSession,
  swapPlayer,
  type LiveState,
} from "../lib/db";
import { teamName } from "../lib/teams";
import type { SessionPlayer, Team } from "../lib/types";
import { c, sp, type } from "../lib/theme";
import { Avatar, Btn } from "./ui";
import { Sheet, SheetRow } from "./Sheet";

/**
 * O QUE DÁ PRA FAZER COM UMA PESSOA.
 *
 * Esta gaveta é a resposta pra tudo que dá errado numa sexta e que o
 * app, até agora, só sabia resolver na web:
 *
 *   · "o Neto tem que sair, o Arthur entra no lugar"  → trocar
 *   · "ficou 3 contra 2"                              → passar de time
 *   · "vou embora"                                    → tirar da noite
 *   · "voltei"                                        → botar de volta
 *
 * Nenhuma delas é hipótese: são as que a `Queue` e o `PlayerSheet` da
 * web resolvem, e a falta delas é o que obrigava alguém a abrir o site
 * no meio do jogo.
 *
 * As ações moram todas aqui, e não espalhadas pela tela, porque na
 * quadra o gesto é sempre o mesmo: toca na pessoa, escolhe o que fazer.
 */
export function PlayerSheet({
  state,
  player,
  canManage,
  onClose,
  onDone,
}: {
  state: LiveState;
  player: SessionPlayer | null;
  canManage: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  // `null` = o menu. Um valor = a lista de "escolha quem" daquela ação.
  const [escolhendo, setEscolhendo] = useState<"trocar" | "sair" | null>(null);
  const [busy, setBusy] = useState(false);

  if (!player) return null;

  const m = state.activeMatch;
  const emQuadra = m
    ? [...m.teamA, ...m.teamB].some((p) => p.id === player.id)
    : false;
  const meuTime: Team | null = !m
    ? null
    : m.teamA.some((p) => p.id === player.id)
      ? "A"
      : m.teamB.some((p) => p.id === player.id)
        ? "B"
        : null;

  const fila = state.players.filter(
    (p) =>
      p.checkedInAt &&
      !p.excluded &&
      p.id !== player.id &&
      !(m ? [...m.teamA, ...m.teamB].some((q) => q.id === p.id) : false),
  );

  const fechar = () => {
    setEscolhendo(null);
    onClose();
  };

  async function agir(fn: () => Promise<void>, erro: string) {
    setBusy(true);
    try {
      await fn();
      await onDone();
      fechar();
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : erro);
    } finally {
      setBusy(false);
    }
  }

  // ── escolher quem entra no lugar ────────────────────────────
  if (escolhendo) {
    const saindo = escolhendo === "sair";
    return (
      <Sheet
        visible
        title={saindo ? "Quem entra no lugar?" : "Trocar com quem?"}
        subtitle={
          saindo
            ? `${player.name} sai da noite. Quem estiver na fila assume a vaga na quadra.`
            : undefined
        }
        onClose={() => setEscolhendo(null)}
      >
        {fila.length === 0 ? (
          <Text style={[type.body, { color: c.dim }]}>
            A fila está vazia — não tem ninguém pra entrar.
          </Text>
        ) : (
          fila.map((p) => (
            <SheetRow
              key={p.id}
              title={p.name}
              hint={`${p.gamesPlayed}j · ${p.roundsWaiting} fora`}
              left={<Avatar name={p.name} size={32} />}
              disabled={busy}
              onPress={() =>
                agir(async () => {
                  if (saindo) {
                    await leaveSession(state, player.id, p.id);
                  } else if (m) {
                    await swapPlayer(m.id, player.id, p.id);
                  }
                }, "Falhou a troca.")
              }
            />
          ))
        )}
        {saindo && emQuadra ? (
          <Btn
            title="sair sem repor"
            variant="ghost"
            disabled={busy}
            onPress={() =>
              agir(
                () => leaveSession(state, player.id, null),
                "Falhou ao tirar.",
              )
            }
          />
        ) : null}
      </Sheet>
    );
  }

  // ── o menu ──────────────────────────────────────────────────
  return (
    <Sheet
      visible
      title={player.name}
      subtitle={
        emQuadra
          ? `Em quadra, ${teamName(meuTime!, state.settings.teamLabels)}`
          : player.excluded
            ? "Fora da noite"
            : `Na fila · ${player.gamesPlayed} jogos · ${player.roundsWaiting} rodadas fora`
      }
      onClose={fechar}
    >
      {!canManage ? (
        <Text style={[type.body, { color: c.dim }]}>
          Só quem organiza mexe na quadra.
        </Text>
      ) : player.excluded ? (
        <Btn
          title="botar de volta na noite"
          loading={busy}
          onPress={() =>
            agir(
              () => rejoinSession(state.sessionId, player.id),
              "Falhou ao trazer de volta.",
            )
          }
        />
      ) : (
        <>
          {emQuadra && meuTime ? (
            <>
              <SheetRow
                title={`Passar pro ${teamName(
                  meuTime === "A" ? "B" : "A",
                  state.settings.teamLabels,
                )}`}
                hint="Resolve o 3 contra 2 sem refazer os times"
                disabled={busy}
                onPress={() =>
                  agir(
                    () => movePlayer(m!.id, player.id, meuTime === "A" ? "B" : "A"),
                    "Falhou ao mover.",
                  )
                }
              />
              <SheetRow
                title="Trocar por alguém da fila"
                hint={
                  fila.length
                    ? `${fila.length} esperando`
                    : "ninguém na fila agora"
                }
                disabled={busy || fila.length === 0}
                onPress={() => setEscolhendo("trocar")}
              />
            </>
          ) : (
            <SheetRow
              title="Botar em quadra no lugar de…"
              hint={emQuadra ? undefined : "entra já nesta rodada"}
              disabled={busy || !m}
              onPress={() => setEscolhendo("trocar")}
            />
          )}

          <View style={{ height: sp(1) }} />
          <Btn
            title="tirar da noite"
            variant="danger"
            disabled={busy}
            onPress={() =>
              emQuadra
                ? setEscolhendo("sair")
                : agir(
                    () => leaveSession(state, player.id, null),
                    "Falhou ao tirar.",
                  )
            }
          />
          <Text style={[type.tiny, { color: c.faint }]}>
            Sai da tela de hoje. Nota e histórico ficam — volta com um toque.
          </Text>
        </>
      )}
    </Sheet>
  );
}

/**
 * A variante "quem está na fila", quando NÃO há partida ativa.
 *
 * Sem quadra montada não existe "trocar com", então o menu acima ficaria
 * com dois itens mortos. Aqui sobra o que faz sentido entre rodadas.
 */
export function useJogadorSelecionado() {
  const [sel, setSel] = useState<SessionPlayer | null>(null);
  return { sel, abrir: setSel, fechar: () => setSel(null) };
}
