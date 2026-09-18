"use client";

import { PeladaPicker } from "@/components/PeladaPicker";

/**
 * Home = painel das peladas.
 *
 * Antes a raiz redirecionava automaticamente para a última pelada aberta.
 * Isso era ótimo quando só existia uma, mas vira um beco sem saída quando
 * a mesma pessoa administra mais de um grupo. O link direto /p/<slug>
 * continua abrindo a quadra em um toque; a raiz agora é a "casa" do produto.
 */
export default function Home() {
  return <PeladaPicker />;
}
