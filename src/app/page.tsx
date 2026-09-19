"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PeladaPicker } from "@/components/PeladaPicker";
import { getLastPelada } from "@/lib/identity";

/**
 * A raiz manda pra última pelada aberta.
 *
 * Quem joga numa pelada só — que é quase todo mundo — não deveria
 * escolher nada: o link do grupo abre a quadra da noite direto, igual
 * ao v1. A tela de escolha aparece pra quem ainda não entrou em
 * nenhuma, e por "← outras peladas".
 */
export default function Home() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // "?escolher=1" = veio de "← outras peladas" / trocar pelada.
    // Sem isso, a última aberta engolia o picker e o botão parecia
    // quebrado (sempre voltava pra Prainha ZN).
    const wantPicker = new URLSearchParams(window.location.search).has(
      "escolher",
    );
    if (wantPicker) {
      setChecked(true);
      return;
    }
    const last = getLastPelada();
    if (last) router.replace(`/p/${last}`);
    else setChecked(true);
  }, [router]);

  if (!checked) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="text-4xl">🏐</span>
      </main>
    );
  }

  return <PeladaPicker />;
}
