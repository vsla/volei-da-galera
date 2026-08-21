import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Veja .env.example",
  );
}

/**
 * A sessão agora PERSISTE (mudou na F4).
 *
 * No v1 não havia login, então guardar sessão era peso morto. Com a
 * 0014 a RLS passa a exigir `auth.uid()` pra qualquer escrita — e o
 * convidado, que não tem conta, entra por login anônimo. Perder essa
 * sessão a cada recarga significaria um usuário novo por refresh, e o
 * check-in do celular de alguém pararia de funcionar no meio da noite.
 */
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
  realtime: { params: { eventsPerSecond: 5 } },
});
