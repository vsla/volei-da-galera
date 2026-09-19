import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { savePeladaSettings } from "../lib/db";
import type { PeladaSettings } from "../lib/settings";
import { SIDE_SUGGESTIONS, type TeamLabels } from "../lib/teams";
import { c, radius, sp, type } from "../lib/theme";
import { Btn, Card, Field, Muted, Row } from "./ui";

/**
 * AS REGRAS DA PELADA.
 *
 * Tudo aqui tem padrão, e pelada nova funciona sem tocar em nada — é
 * assim que a maioria vai continuar. Mas cada grupo joga de um jeito, e
 * o playtest 01 terminou com "deixar mais configurável e fácil".
 *
 * As regras moram num `jsonb` (0012), então mexer aqui não é migration
 * nem deploy. O que a tela NÃO deixa fazer é tão importante quanto:
 * nada aqui apaga partida, nota ou histórico — mudar a regra muda o
 * futuro, nunca o que já foi jogado.
 */
export function Regras({
  peladaId,
  settings,
  onDone,
}: {
  peladaId: string;
  settings: PeladaSettings;
  onDone: () => Promise<void> | void;
}) {
  const [s, setS] = useState<PeladaSettings>(settings);
  const [busy, setBusy] = useState(false);

  const mudou = JSON.stringify(s) !== JSON.stringify(settings);
  const set = <K extends keyof PeladaSettings>(k: K, v: PeladaSettings[K]) =>
    setS((atual) => ({ ...atual, [k]: v }));

  async function salvar() {
    setBusy(true);
    try {
      await savePeladaSettings(peladaId, s);
      await onDone();
      Alert.alert("Pronto", "As regras valem da próxima rodada em diante.");
    } catch (e) {
      Alert.alert("Não deu", e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Numero
        label="Gente por time"
        hint="6×6 é o padrão da areia"
        valor={s.teamSize}
        min={2}
        max={8}
        onChange={(v) => set("teamSize", v)}
      />
      <Numero
        label="Vitórias até desfazer o time"
        hint="Quem segura a quadra por muito tempo cansa a fila"
        valor={s.maxStreak}
        min={1}
        max={10}
        onChange={(v) => set("maxStreak", v)}
      />
      <Numero
        label="Teto de espera"
        hint={
          s.waitCap === null
            ? "desligado — a fila decide sozinha"
            : `depois de ${s.waitCap} rodadas fora, entra de qualquer jeito`
        }
        valor={s.waitCap ?? 0}
        min={0}
        max={20}
        zeroDesliga
        onChange={(v) => set("waitCap", v === 0 ? null : v)}
      />
      <Numero
        label="Destaques por pessoa"
        hint="quantos nomes cada um aponta no fim da noite"
        valor={s.votesPerPlayer}
        min={1}
        max={10}
        onChange={(v) => set("votesPerPlayer", v)}
      />

      <Lados valor={s.teamLabels} onChange={(v) => set("teamLabels", v)} />

      <Escolha
        label="Quem entra no meio da partida"
        valor={s.substitutionMode}
        opcoes={[
          { v: "titular", t: "Vira titular", h: "herda a vaga e a série de quem saiu" },
          { v: "tapa_buraco", t: "Só tapa o buraco", h: "não herda nada; volta pra fila depois" },
        ]}
        onChange={(v) => set("substitutionMode", v)}
      />
      <Escolha
        label="Quem mexe na quadra"
        valor={s.whoCanManage}
        opcoes={[
          { v: "admins", t: "Só quem organiza", h: "gerar times e registrar vencedor" },
          { v: "everyone", t: "Qualquer um", h: "pelada pequena, todo mundo resolve" },
        ]}
        onChange={(v) => set("whoCanManage", v)}
      />
      <Escolha
        label="Quem vê a nota"
        valor={s.showRating}
        opcoes={[
          { v: "organizers", t: "Só quem organiza", h: "o padrão" },
          { v: "everyone", t: "Todo mundo", h: "transparente, e às vezes constrangedor" },
          { v: "nobody", t: "Ninguém", h: "continua nivelando, sem ninguém ver" },
        ]}
        onChange={(v) => set("showRating", v)}
      />
      <Liga
        label="Placar ponto a ponto"
        hint="sem isso, só se registra quem venceu"
        on={s.scoring}
        onChange={(v) => set("scoring", v)}
      />
      <Liga
        label="Aceitar convidado"
        hint="quem não é da lista entra pelo nome, sem conta"
        on={s.allowGuests}
        onChange={(v) => set("allowGuests", v)}
      />

      <View style={{ height: sp(2) }} />
      <Btn
        title={mudou ? "salvar as regras" : "nada mudou"}
        disabled={!mudou}
        loading={busy}
        onPress={salvar}
      />
      <Text style={[type.tiny, { color: c.faint, marginTop: sp(2) }]}>
        Vale da próxima rodada em diante. Partida, nota e histórico já
        registrados não mudam.
      </Text>
    </Card>
  );
}

function Numero({
  label,
  hint,
  valor,
  min,
  max,
  zeroDesliga,
  onChange,
}: {
  label: string;
  hint: string;
  valor: number;
  min: number;
  max: number;
  zeroDesliga?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <View style={{ marginBottom: sp(4) }}>
      <Text style={[type.label, { color: c.text }]}>{label}</Text>
      {/* `flex: 1` no texto e `flexShrink: 0` no controle.
          Sem isso o hint longo ("depois de 3 rodadas fora, entra de
          qualquer jeito") empurrava o −/+ pra fora da tela no iPhone,
          e a regra virava não-editável sem nenhum aviso. */}
      <Row style={{ justifyContent: "space-between", marginTop: sp(2) }} gap={3}>
        <Muted style={{ flex: 1 }}>{hint}</Muted>
        <Row gap={3} style={{ flexShrink: 0 }}>
          <Passo char="−" onPress={() => onChange(Math.max(min, valor - 1))} />
          <Text
            style={{
              color: c.text,
              fontSize: 20,
              fontWeight: "800",
              minWidth: 34,
              textAlign: "center",
            }}
          >
            {zeroDesliga && valor === 0 ? "off" : valor}
          </Text>
          <Passo char="+" onPress={() => onChange(Math.min(max, valor + 1))} />
        </Row>
      </Row>
    </View>
  );
}

/**
 * O NOME DOS LADOS.
 *
 * A web já tinha isto e o app não, o que deixava todo grupo preso em
 * "AZUL / LARANJA". E o nome do time não é enfeite: o playtest 01 (§5)
 * terminou com ponto marcado no time errado porque a tela chamava de "A"
 * quem estava do outro lado da rede. O nome tem que ser conferível
 * OLHANDO PRA QUADRA — e só quem joga lá sabe o que existe dos dois
 * lados dela.
 *
 * As sugestões vêm antes dos campos porque ninguém abre configuração pra
 * digitar duas palavras: o caminho tem que ser tocar, não escrever.
 */
function Lados({
  valor,
  onChange,
}: {
  valor: TeamLabels;
  onChange: (v: TeamLabels) => void;
}) {
  const limpa = (t: string) => t.slice(0, 12).toUpperCase();

  return (
    <View style={{ marginBottom: sp(4) }}>
      <Text style={[type.label, { color: c.text }]}>Nome dos lados</Text>
      <Text style={[type.tiny, { color: c.faint, marginTop: 2, marginBottom: sp(2) }]}>
        O que dá pra ver da quadra: o mar, a rua, o quiosque. Vale a noite inteira.
      </Text>

      <Row gap={1.5} style={{ flexWrap: "wrap", marginBottom: sp(3) }}>
        {SIDE_SUGGESTIONS.map((s) => {
          const on = s.A === valor.A && s.B === valor.B;
          return (
            <Pressable
              key={`${s.A}-${s.B}`}
              onPress={() => onChange(s)}
              style={{
                paddingVertical: sp(2),
                paddingHorizontal: sp(3),
                borderRadius: radius.pill,
                backgroundColor: on ? c.selBg : c.surface2,
                borderWidth: on ? 2 : 1,
                borderColor: on ? c.accent : c.border,
              }}
            >
              <Text style={[type.tiny, { color: on ? c.text : c.dim }]}>
                {s.A} × {s.B}
              </Text>
            </Pressable>
          );
        })}
      </Row>

      <Row gap={2} style={{ alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Um lado"
            value={valor.A}
            onChangeText={(t) => onChange({ ...valor, A: limpa(t) })}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="O outro"
            value={valor.B}
            onChangeText={(t) => onChange({ ...valor, B: limpa(t) })}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
          />
        </View>
      </Row>
    </View>
  );
}

function Passo({ char, onPress }: { char: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12}>
      <Text style={{ color: c.accent, fontSize: 24, fontWeight: "700" }}>{char}</Text>
    </Pressable>
  );
}

function Escolha<T extends string>({
  label,
  valor,
  opcoes,
  onChange,
}: {
  label: string;
  valor: T;
  opcoes: { v: T; t: string; h: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginBottom: sp(4) }}>
      <Text style={[type.label, { color: c.text, marginBottom: sp(2) }]}>{label}</Text>
      <View style={{ gap: sp(1.5) }}>
        {opcoes.map((o) => {
          const on = o.v === valor;
          return (
            <Pressable
              key={o.v}
              onPress={() => onChange(o.v)}
              style={{
                // Selecionado = cartão escuro com borda laranja, não
                // preenchimento laranja. O fundo `accentDim` com texto
                // `faint` em cima era cinza sobre laranja queimado — a
                // opção marcada era a menos legível da tela.
                backgroundColor: on ? c.selBg : c.surface2,
                borderRadius: radius.md,
                borderWidth: on ? 2 : 1,
                borderColor: on ? c.accent : c.border,
                padding: sp(2.5),
              }}
            >
              <Row gap={2}>
                <Text style={[type.label, { color: on ? c.text : c.dim, flex: 1 }]}>{o.t}</Text>
                {on ? (
                  <Text style={{ color: c.accent, fontSize: 14, fontWeight: "900" }}>✓</Text>
                ) : null}
              </Row>
              <Text style={[type.tiny, { color: on ? c.dim : c.faint, marginTop: 2 }]}>{o.h}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Liga({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      style={{ flexDirection: "row", alignItems: "center", gap: sp(3), marginBottom: sp(4) }}
    >
      <View
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          backgroundColor: on ? c.accent : c.surface2,
          borderWidth: 1,
          borderColor: on ? c.accent : c.border,
          justifyContent: "center",
          paddingHorizontal: 3,
          flexShrink: 0,
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: on ? c.accentInk : c.faint,
            alignSelf: on ? "flex-end" : "flex-start",
          }}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.label, { color: c.text }]}>{label}</Text>
        <Text style={[type.tiny, { color: c.faint }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}
