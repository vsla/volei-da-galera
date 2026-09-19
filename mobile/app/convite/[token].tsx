import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { claimInvite } from "../../lib/db";
import { c, sp, type } from "../../lib/theme";
import { Btn, Empty, H1, Loading, Muted, Screen } from "../../components/ui";

/**
 * O LINK DE CONVITE, ABERTO NO APARELHO.
 *
 * `voleidagalera://convite/<token>` — o organizador gera na aba Gestão e
 * manda no grupo do WhatsApp, que é onde a lista já vive.
 *
 * Por que existe, já que a tela de entrar no grupo também reivindica:
 * porque escolher o próprio nome numa lista é auto-serviço, e auto-serviço tem o
 * furo do §9b do `reasonable.md` — "alguém votou a noite inteira como
 * outra pessoa". Com conta, esse erro seria permanente. O link move a
 * autorização pra quem monta a lista.
 *
 * Precisa de sessão: `claim_roster_invite` levanta "sem sessão" sem ela.
 * Então guardamos o token e mandamos pro login, voltando aqui depois.
 */
export default function Convite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, loading: authLoading, refreshMe } = useAuth();
  const router = useRouter();

  const [erro, setErro] = useState<string | null>(null);
  const [usando, setUsando] = useState(false);
  // O deep link pode acordar a tela duas vezes (cold start + listener), e
  // o token é de uso único: a segunda tentativa acharia ele já gasto e
  // mostraria "convite já usado" pra quem acabou de usar com sucesso.
  const jaTentou = useRef(false);

  useEffect(() => {
    if (authLoading || !token || jaTentou.current) return;
    if (!session) {
      router.replace({ pathname: "/login", params: { convite: token } });
      return;
    }

    jaTentou.current = true;
    setUsando(true);
    claimInvite(token)
      .then(async (r) => {
        if (!r) {
          setErro(
            "Esse convite não vale mais — ou já foi usado, ou quem organiza gerou outro.",
          );
          return;
        }
        await refreshMe();
        router.replace(`/grupo/${r.peladaId}`);
      })
      .catch((e) =>
        setErro(e instanceof Error ? e.message : "Não deu pra usar o convite."),
      )
      .finally(() => setUsando(false));
  }, [authLoading, session, token, router, refreshMe]);

  if (authLoading || usando) return <Loading label="Entrando na pelada…" />;

  return (
    <Screen>
      <H1>Convite</H1>
      {erro ? (
        <>
          <Muted>{erro}</Muted>
          <Text style={[type.tiny, { color: c.faint, marginTop: sp(3) }]}>
            Peça um link novo pra quem organiza a pelada. Cada link serve uma
            vez, de propósito.
          </Text>
          <Btn
            title="ir pro início"
            style={{ marginTop: sp(5) }}
            onPress={() => router.replace("/")}
          />
        </>
      ) : (
        <Empty title="Sem convite" hint="Abra o link que mandaram no grupo." />
      )}
    </Screen>
  );
}
