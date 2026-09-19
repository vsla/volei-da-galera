import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O CLIENTE, INJETADO PELA PLATAFORMA.
 *
 * Tudo em `shared/` é igual nos dois apps — menos isto. O cliente da web
 * (`src/lib/supabase.ts`) não guarda sessão: a `0022` desfez as contas e
 * identidade lá é um toque no nome, no `localStorage`. O do celular
 * (`mobile/lib/supabase.ts`) guarda no AsyncStorage, renova sozinho e
 * pausa o refresh quando o app sai do primeiro plano — porque a pessoa
 * instala uma vez e espera continuar logada na semana seguinte.
 *
 * Duas configurações, um `db.ts` só. Cada app cria o seu cliente e chama
 * `setSupabaseClient` no topo do módulo.
 *
 * ⚠️ ORDEM. Isto só funciona porque ninguém importa `shared/db` direto:
 * os dois lados passam pelo atalho (`src/lib/db.ts`, `mobile/lib/db.ts`),
 * que faz `import "./supabase"` ANTES de reexportar. Módulo ES avalia os
 * imports na ordem em que aparecem, então o cliente sempre está registrado
 * quando a primeira query sai. Importar `shared/db` direto pula essa
 * garantia e estoura no primeiro uso — com a mensagem abaixo, que diz o
 * que fazer.
 */
let cliente: SupabaseClient | null = null;

export function setSupabaseClient(c: SupabaseClient) {
  cliente = c;
}

/**
 * Um proxy, e não o cliente, porque `db.ts` faz `supabase.from(...)` em
 * ~100 lugares e o import roda antes de o app existir. O proxy adia a
 * resolução pro momento da chamada, que é quando o cliente já está lá.
 *
 * `Reflect.get(cliente, prop, cliente)` — o terceiro argumento é o que
 * mantém o `this` certo lá dentro. Sem ele, métodos do supabase-js que
 * dependem de estado interno quebram de um jeito difícil de ler.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_alvo, prop) {
    if (!cliente) {
      throw new Error(
        "Cliente do Supabase não registrado. Importe `src/lib/db` (web) ou " +
          "`mobile/lib/db` (app) em vez de `shared/db`.",
      );
    }
    return Reflect.get(cliente, prop, cliente);
  },
});
