import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { setSupabaseClient } from "../../shared/supabase";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Faltam EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY em mobile/.env",
  );
}

/**
 * Cliente do app nativo.
 *
 * Difere do cliente da web (`src/lib/supabase.ts`) em um ponto só, mas é o
 * ponto que importa: aqui a sessão **persiste**. A web foi pra identidade
 * sem conta na `0022` — um toque no nome guardado no aparelho. No celular
 * a pessoa instala o app uma vez e espera continuar logada na semana
 * seguinte, então guardamos o token no AsyncStorage e renovamos sozinho.
 *
 * `detectSessionInUrl` fica desligado porque não existe URL de browser aqui:
 * o retorno do OAuth do Google chega por deep link e é tratado à mão em
 * `auth.tsx`.
 */
export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 5 } },
});

// Registra este cliente no `shared/` — ver `shared/supabase.ts`.
setSupabaseClient(supabase);

/**
 * O refresh automático só roda com o app em primeiro plano.
 *
 * Sem isso o timer continua disparando com o celular no bolso, falha sem
 * rede e queima o refresh token — a pessoa abre o app na quadra e está
 * deslogada. Ver docs do supabase-js para React Native.
 */
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
