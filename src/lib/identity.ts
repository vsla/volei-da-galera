"use client";

/**
 * Identidade sem senha: a pessoa clica no próprio nome e pronto.
 *
 * 25 amigos numa praia, 4G ruim, link aberto dentro do WebView do
 * WhatsApp — onde OAuth do Google quebra com frequência. Login não pode
 * custar mais que um toque. Qualquer um consegue clicar no nome de
 * qualquer um, e entre amigos isso é aceitável.
 *
 * Com contas de verdade (F4) isto vira o caminho do CONVIDADO, não o
 * caminho principal — mas continua existindo, porque é ele que faz o
 * check-in caber em um toque.
 */

const KEY = "volei.me";
const ORG_KEY = "volei.organizador";
const LAST_KEY = "volei.ultima-pelada";

export function getMe(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY);
}

export function setMe(playerId: string) {
  localStorage.setItem(KEY, playerId);
}

export function clearMe() {
  localStorage.removeItem(KEY);
}

/**
 * O PIN vale por PELADA, não pelo aparelho.
 *
 * Ser organizador do vôlei da sexta não pode dar acesso de organizador
 * ao vôlei de domingo — que é de outra galera.
 */
export function isOrganizer(peladaId?: string): boolean {
  if (typeof window === "undefined") return false;
  if (!peladaId) return localStorage.getItem(ORG_KEY) === "1";
  return localStorage.getItem(`${ORG_KEY}:${peladaId}`) === "1";
}

export function setOrganizer(on: boolean, peladaId?: string) {
  const key = peladaId ? `${ORG_KEY}:${peladaId}` : ORG_KEY;
  if (on) localStorage.setItem(key, "1");
  else localStorage.removeItem(key);
}

/** A última pelada aberta — pra quem tem uma só não escolher toda vez. */
export function getLastPelada(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_KEY);
}

export function setLastPelada(slug: string) {
  localStorage.setItem(LAST_KEY, slug);
}
