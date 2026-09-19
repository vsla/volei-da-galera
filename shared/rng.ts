/**
 * RNG determinístico. Mesmo seed → mesmo sorteio, sempre.
 *
 * O desempate da fila precisa ser estável: reabrir a tela não pode
 * embaralhar a ordem mostrada. Só o botão RESORTEAR gera seed novo.
 */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — pequeno, rápido, distribuição boa o suficiente. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Número estável para um jogador dentro de um sorteio.
 * Não depende da ordem em que os jogadores chegaram no array —
 * só do seed e do id. Isso mantém o resultado reprodutível.
 */
export function randomFor(seed: string, key: string): number {
  return mulberry32(hashString(`${seed}|${key}`))();
}

/** Embaralha uma cópia, sem tocar no array original. */
export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
