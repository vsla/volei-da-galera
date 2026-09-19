import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { claimPlayer, createPelada } from "../lib/db";
import { Btn, Field, H2, Muted, Row, Screen } from "../components/ui";
import { c, radius, sp, type } from "../lib/theme";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function CriarGrupo() {
  const { me, nomeDaConta, refreshMe } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [weekday, setWeekday] = useState<number | null>(null);
  const [teamSize, setTeamSize] = useState("4");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function criar() {
    setBusy(true);
    setMsg(null);
    try {
      // Sem `me` aqui é o caso normal de quem acabou de criar conta: a
      // pessoa ainda não é jogador nenhum, e criar o grupo é justamente
      // o que a torna um. `playerId: null` faz o banco abrir um novo.
      const res = await createPelada({
        name,
        weekday,
        ownerName: me?.name ?? nomeDaConta,
        playerId: me?.playerId ?? null,
        settings: { teamSize: Number(teamSize) || 4 },
      });
      if (!res) throw new Error("O banco não devolveu o grupo criado.");

      // Amarra o jogador recém-criado à conta. Sem isto,
      // `is_pelada_admin()` não reconhece nem o DONO do grupo — e o
      // convite por link recusa quem acabou de criar a pelada.
      if (!me) {
        await claimPlayer(res.playerId);
        await refreshMe();
      }
      router.replace(`/grupo/${res.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu pra criar o grupo.");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H2>Novo grupo</H2>
      <Muted>
        O grupo é a turma fixa. Depois, dentro dele, tu abre a pelada de cada dia.
      </Muted>

      <View style={{ height: sp(6) }} />

      <Field
        label="Nome do grupo"
        placeholder="Ex: Prainha ZN"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />

      <Text style={[type.label, { color: c.dim, marginBottom: sp(1.5) }]}>
        Dia da semana (opcional)
      </Text>
      <Row gap={1.5} style={{ flexWrap: "wrap", marginBottom: sp(4) }}>
        {DIAS.map((d, i) => {
          const on = weekday === i;
          return (
            <Pressable
              key={d}
              onPress={() => setWeekday(on ? null : i)}
              style={{
                paddingVertical: sp(2),
                paddingHorizontal: sp(3),
                borderRadius: radius.pill,
                backgroundColor: on ? c.accent : c.surface2,
                borderWidth: 1,
                borderColor: on ? c.accent : c.border,
              }}
            >
              <Text style={[type.tiny, { color: on ? c.accentInk : c.dim }]}>{d}</Text>
            </Pressable>
          );
        })}
      </Row>

      <Field
        label="Jogadores por time"
        placeholder="4"
        value={teamSize}
        onChangeText={setTeamSize}
        keyboardType="number-pad"
      />

      {msg ? <Text style={[type.body, { color: c.warn, marginBottom: sp(3) }]}>{msg}</Text> : null}

      <Btn
        title="Criar grupo"
        loading={busy}
        disabled={name.trim().length < 2}
        onPress={criar}
      />
      <Btn title="Cancelar" variant="ghost" style={{ marginTop: sp(2) }} onPress={() => router.back()} />
    </Screen>
  );
}
