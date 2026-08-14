"use client";

/**
 * Identidade sem senha: a pessoa clica no próprio nome e pronto.
 *
 * 25 amigos numa praia, 4G ruim, link aberto dentro do WebView do
 * WhatsApp — onde OAuth do Google quebra com frequência. Login não pode
 * custar mais que um toque. Qualquer um consegue clicar no nome de
 * qualquer um, e entre amigos isso é aceitável.
 */

const KEY = "volei.me";
const ORG_KEY = "volei.organizador";

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

export function isOrganizer(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ORG_KEY) === "1";
}

export function setOrganizer(on: boolean) {
  if (on) localStorage.setItem(ORG_KEY, "1");
  else localStorage.removeItem(ORG_KEY);
}
