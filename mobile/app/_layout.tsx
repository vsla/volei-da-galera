import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useGlobalSearchParams, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { Loading } from "../components/ui";
import { c } from "../lib/theme";

/**
 * Porteiro do app.
 *
 * Sem conta você só vê `/login`; com conta você nunca vê `/login`. Fica
 * num componente separado porque precisa rodar *dentro* do AuthProvider
 * e o redirect só pode acontecer depois que o Stack montou — daí o efeito
 * em vez de um `<Redirect>` solto no render.
 */
function Gate() {
  const { session, loading, recuperandoSenha } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // O token que o `/convite/...` deixou ao mandar pro login sem sessão.
  // Sem lê-lo aqui, o "logou → vai pra home" abaixo engoliria o convite.
  const { convite } = useGlobalSearchParams<{ convite?: string }>();

  useEffect(() => {
    if (loading) return;
    const onde = segments[0];
    const inAuth = onde === "login";
    // Veio do link do e-mail: a sessão de recuperação serve pra UMA
    // coisa, trocar a senha. Vem antes de tudo porque ela nasce como
    // sessão normal — sem este desvio a pessoa entraria no app inteiro
    // só por ter aberto um e-mail antigo.
    if (recuperandoSenha) {
      if (onde !== "nova-senha") router.replace("/nova-senha");
      return;
    }
    // O convite abre sem sessão de propósito: ele guarda o token e manda
    // pro login, voltando depois. Barrar aqui perderia o token.
    // `esqueci-senha` também é público — quem não consegue entrar é
    // exatamente quem precisa dela.
    const publico = inAuth || onde === "convite" || onde === "esqueci-senha";

    if (!session && !publico) {
      router.replace("/login");
      return;
    }
    if (session && inAuth) {
      router.replace(convite ? `/convite/${convite}` : "/");
      return;
    }
    // Conta sem jogador NÃO é mais um estado a consertar antes de entrar.
    //
    // Até aqui o porteiro prendia quem acabou de se cadastrar numa tela
    // de "qual desses é você?", montada com os nomes de um grupo qualquer
    // do banco. Isso vinha de quando existia uma pelada só. Num app
    // self-service, quem cria conta em geral vem criar o PRÓPRIO grupo, e
    // a pergunta só faz sentido dentro de um grupo específico — é onde
    // ela mora agora (`/entrar/[code]`).
    //
    // Então a home aceita conta sem jogador: ela mostra "nenhum grupo
    // ainda" e as duas portas, criar e entrar. Virar jogador é
    // consequência de atravessar uma delas.
  }, [session, loading, recuperandoSenha, segments, convite]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Loading label="Entrando…" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerTitleStyle: { fontWeight: "800" },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="esqueci-senha" options={{ headerShown: false }} />
      <Stack.Screen name="nova-senha" options={{ headerShown: false }} />
      <Stack.Screen name="convite/[token]" options={{ headerShown: false }} />
      <Stack.Screen name="entrar/[code]" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="grupo/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="conta"
        options={{ presentation: "modal", title: "Sua conta" }}
      />
      <Stack.Screen
        name="criar-grupo"
        options={{ presentation: "modal", title: "Criar grupo" }}
      />
      <Stack.Screen
        name="entrar-codigo"
        options={{ presentation: "modal", title: "Entrar com código" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
