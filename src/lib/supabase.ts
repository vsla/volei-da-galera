import { createClient } from "@supabase/supabase-js";
import { setSupabaseClient } from "../../shared/supabase";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Veja .env.example",
  );
}

/**
 * Cliente único, sem autenticação.
 *
 * A `0022` desfez as contas: identidade é um toque no nome, guardado no
 * aparelho (`identity.ts`), e a escrita é liberada pra quem tem o link.
 * Não há sessão pra persistir nem token pra renovar — o que sobrou de
 * config é o teto do realtime, pra 25 celulares na praia não afogarem
 * a conexão em eventos.
 */
export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

// Registra este cliente no `shared/`, que é de onde o `db.ts` fala com o
// banco. Roda no import, antes de qualquer query — ver `shared/supabase.ts`.
setSupabaseClient(supabase);
