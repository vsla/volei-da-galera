// Atalho pro `shared/db`. O `import "./supabase"` NÃO é decorativo: ele
// registra o cliente da plataforma antes de qualquer query sair. Ver o
// comentário de ordem em `shared/supabase.ts`.
import "./supabase";

export * from "../../shared/db";
