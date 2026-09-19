import { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import { bumpScore, finishMatch, resetScore, type LiveState } from "../lib/db";
import { teamName } from "../lib/teams";
import type { Team } from "../lib/types";
import { c, radius, sp, type } from "../lib/theme";

/**
 * O PLACAR, DEITADO.
 *
 * Não é o caminho normal: "1 toque, sem placar" continua valendo, e o
 * botão "AZUL ganhou / LARANJA ganhou" segue sendo como a maioria das
 * rodadas termina. Esta tela é pra outra situação — alguém sentado,
 * fora da quadra, marcando ponto a ponto, com o celular apoiado na
 * areia. Daí deitado: o número precisa ser lido de longe.
 *
 * COMO ELE DEITA, já que o app é travado em `portrait` no `app.json`:
 * o conteúdo é desenhado numa caixa com largura e altura trocadas e
 * girada 90°. É o truque clássico, e aqui ele é melhor que soltar a
 * orientação de verdade — a pessoa vira o celular e a tela já está
 * certa, sem o giro do sistema chacoalhando o layout no meio do ponto.
 *
 * ── O PONTO QUE PISCAVA ────────────────────────────────────────
 *
 * A primeira versão mostrava `banco + pendente` e limpava o pendente
 * assim que o `bump_score` respondia. Só que quem atualiza o "banco" da
 * tela é o `onDone()`, que vem DEPOIS — então existia um instante em
 * que o pendente já tinha ido embora e o valor novo ainda não tinha
 * chegado. Resultado na mão de quem marca: 0 → 1 → 0 → 1, a cada ponto.
 *
 * Agora o número mostrado é o que o PRÓPRIO `bump_score` devolveu (ele
 * soma dentro do banco e retorna o total), e esse valor só é abandonado
 * quando não há nada em voo nem pendente — aí o que vem do poll assume.
 * Nenhuma janela em que a tela mostra um número que já não vale.
 *
 * O resto continua: `bump_score` soma DENTRO do banco, então dois
 * celulares marcando ao mesmo tempo somam em vez de um sobrescrever o
 * outro; se a rede cair, o delta fica pendente, a tela avisa, e o
 * reenvio acontece sozinho — ninguém perde ponto por causa do 4G da praia.
 */
export function Placar({
  state,
  visible,
  canManage,
  onClose,
  onDone,
}: {
  state: LiveState;
  visible: boolean;
  canManage: boolean;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const { width, height } = useWindowDimensions();
  const m = state.activeMatch;

  /** O que a tela mostra enquanto o poll não alcança. `null` = o banco manda. */
  const [local, setLocal] = useState<{ a: number; b: number } | null>(null);
  /** Deltas que a rede engoliu, esperando reenvio. */
  const pendente = useRef<{ A: number; B: number }>({ A: 0, B: 0 });
  const voando = useRef(0);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);

  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  // O banco mandou número novo (outro aparelho marcou) e não temos nada
  // em voo: adota. Com toque em voo, o otimista local manda — senão o
  // número volta atrás no meio do ponto.
  useEffect(() => {
    if (voando.current === 0 && pendente.current.A === 0 && pendente.current.B === 0) {
      setLocal(null);
    }
  }, [m?.scoreA, m?.scoreB, m?.id]);

  // Fechou e abriu de novo: começa limpo, do que estiver no banco.
  useEffect(() => {
    if (!visible) {
      setLocal(null);
      pendente.current = { A: 0, B: 0 };
      setOffline(false);
    }
  }, [visible]);

  async function enviar(matchId: string, team: Team, delta: number) {
    voando.current++;
    try {
      const r = await bumpScore(matchId, team, delta);
      if (r) setLocal(r);
      if (pendente.current.A === 0 && pendente.current.B === 0) setOffline(false);
      await onDone();
    } catch {
      // 4G de praia: guarda o ponto e tenta de novo sozinho.
      pendente.current[team] += delta;
      setOffline(true);
    } finally {
      voando.current--;
    }
  }

  // O reenvio do que ficou pendente.
  useEffect(() => {
    if (!visible || !m) return;
    const id = m.id;
    const t = setInterval(() => {
      const p = pendente.current;
      for (const team of ["A", "B"] as const) {
        if (p[team] === 0) continue;
        const delta = p[team];
        p[team] = 0;
        void enviar(id, team, delta);
      }
    }, 4000);
    return () => clearInterval(t);
  }, [visible, m?.id]);

  if (!m) return null;

  const placar = local ?? { a: m.scoreA, b: m.scoreB };
  const marcar = (team: Team, d: number) => {
    if (!canManage) return;
    const atual = team === "A" ? placar.a : placar.b;
    if (atual + d < 0) return;
    // O número sobe na hora; a resposta do banco corrige se precisar.
    setLocal({
      a: team === "A" ? atual + d : placar.a,
      b: team === "B" ? atual + d : placar.b,
    });
    void enviar(m.id, team, d);
  };

  // Empate não fecha: a rotação precisa saber quem fica na quadra.
  const empate = placar.a === placar.b;
  const vencedor: Team = placar.a > placar.b ? "A" : "B";

  async function finalizar() {
    if (!m || empate) return;
    setBusy(true);
    try {
      await finishMatch(state, vencedor, { a: placar.a, b: placar.b });
      await onDone();
      onClose();
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao encerrar.");
    } finally {
      setBusy(false);
    }
  }

  const tempo = m.startedAt ? decorrido(new Date(m.startedAt).getTime(), agora) : null;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {/* A caixa girada: largura e altura trocadas, 90°, centrada. */}
        <View
          style={{
            position: "absolute",
            width: height,
            height: width,
            top: (height - width) / 2,
            left: (width - height) / 2,
            transform: [{ rotate: "90deg" }],
            flexDirection: "row",
          }}
        >
          <Lado
            label={teamName("A", state.settings.teamLabels)}
            cor={c.teamA}
            valor={placar.a}
            podeMarcar={canManage}
            onMais={() => marcar("A", 1)}
            onMenos={() => marcar("A", -1)}
          />
          <Lado
            label={teamName("B", state.settings.teamLabels)}
            cor={c.teamB}
            valor={placar.b}
            podeMarcar={canManage}
            onMais={() => marcar("B", 1)}
            onMenos={() => marcar("B", -1)}
          />

          {/* A faixa do meio: fechar, tempo, zerar. Fica por cima da
              divisa dos dois lados, onde não tem número pra tapar. */}
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              alignItems: "center",
              paddingTop: sp(2),
            }}
            pointerEvents="box-none"
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: sp(4),
                backgroundColor: "rgba(0,0,0,0.55)",
                borderRadius: radius.pill,
                paddingHorizontal: sp(4),
                paddingVertical: sp(2),
              }}
            >
              <Pressable onPress={onClose} hitSlop={16}>
                <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "800" }}>✕</Text>
              </Pressable>
              <Text style={{ color: "#FFF", fontSize: 15, fontWeight: "800" }}>
                {tempo ?? `Rodada ${m.round}`}
              </Text>
              {canManage ? (
                <Pressable
                  hitSlop={16}
                  onPress={async () => {
                    pendente.current = { A: 0, B: 0 };
                    setLocal({ a: 0, b: 0 });
                    try {
                      await resetScore(m.id);
                      await onDone();
                    } catch {
                      setOffline(true);
                    }
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>ZERAR</Text>
                </Pressable>
              ) : null}
            </View>

            {offline ? (
              <View
                style={{
                  marginTop: sp(2),
                  backgroundColor: c.warn,
                  borderRadius: radius.pill,
                  paddingHorizontal: sp(3),
                  paddingVertical: sp(1),
                }}
              >
                <Text style={[type.tiny, { color: "#000" }]}>
                  sem rede — o ponto sobe quando voltar
                </Text>
              </View>
            ) : null}
          </View>

          {/* FINALIZAR, aqui dentro.
              Sem isto, terminar a partida obrigava a fechar o placar,
              virar o celular e achar o botão do time na tela de pé — no
              exato momento em que a quadra inteira está esperando saber
              quem entra. O vencedor não é escolhido: é quem está na
              frente, e empate não fecha porque a rotação precisa saber
              quem fica. */}
          {canManage ? (
            <View
              style={{
                position: "absolute",
                bottom: sp(3),
                left: 0,
                right: 0,
                alignItems: "center",
              }}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={finalizar}
                disabled={empate || busy}
                style={{
                  backgroundColor: empate ? "rgba(0,0,0,0.45)" : c.accent,
                  borderRadius: radius.pill,
                  paddingHorizontal: sp(8),
                  paddingVertical: sp(3),
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: empate ? "#FFF" : c.accentInk,
                    fontSize: 16,
                    fontWeight: "900",
                    letterSpacing: 1,
                  }}
                >
                  {empate
                    ? "EMPATE NÃO FECHA"
                    : `${teamName(vencedor, state.settings.teamLabels).toUpperCase()} VENCEU — FINALIZAR`}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Lado({
  label,
  cor,
  valor,
  podeMarcar,
  onMais,
  onMenos,
}: {
  label: string;
  cor: string;
  valor: number;
  podeMarcar: boolean;
  onMais: () => void;
  onMenos: () => void;
}) {
  return (
    <Pressable
      onPress={onMais}
      disabled={!podeMarcar}
      style={{
        flex: 1,
        backgroundColor: cor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          position: "absolute",
          top: sp(10),
          color: "rgba(0,0,0,0.65)",
          fontSize: 18,
          fontWeight: "900",
          letterSpacing: 3,
        }}
      >
        {label.toUpperCase()}
      </Text>

      {/* O número é o conteúdo da tela — tudo o mais é borda. */}
      <Text
        style={{
          color: "#FFFFFF",
          fontSize: 140,
          fontWeight: "900",
          fontVariant: ["tabular-nums"],
        }}
      >
        {valor}
      </Text>

      {podeMarcar ? (
        <Pressable
          onPress={onMenos}
          hitSlop={20}
          style={{
            position: "absolute",
            bottom: sp(16),
            paddingHorizontal: sp(6),
            paddingVertical: sp(1),
            borderRadius: radius.pill,
            backgroundColor: "rgba(0,0,0,0.25)",
          }}
        >
          <Text style={{ color: "#FFF", fontSize: 26, fontWeight: "800" }}>−</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function decorrido(de: number, ate: number): string {
  const total = Math.max(0, Math.floor((ate - de) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
