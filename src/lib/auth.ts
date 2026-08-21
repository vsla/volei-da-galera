"use client";

import { supabase } from "./supabase";

/**
 * CONTA — e por que ela é opcional.
 *
 * O `RESUMO.md` decidiu "login não pode custar mais que um toque", e o
 * playtest confirmou: check-in próprio foi o que fez a galera adotar o
 * site. Ao mesmo tempo, o playtest pediu cadastro e foto, e a 0014
 * precisa de `auth.uid()` pra proteger a escrita.
 *
 * A saída são DOIS níveis:
 *
 *   • sessão anônima — criada sozinha no primeiro carregamento. Dá
 *     identidade pro banco sem pedir nada pra pessoa. É o que mantém o
 *     check-in em um toque;
 *   • conta de verdade — e-mail ou Google, com nome e foto. Quem faz
 *     vira dono do próprio histórico e leva a foto pro Destaque.
 *
 * Subir de anônimo pra conta NÃO troca o usuário: o Supabase promove a
 * mesma `auth.users`, então o player reivindicado continua sendo o seu.
 */

export type Profile = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAnonymous: boolean;
};

/**
 * Garante que existe sessão. Chamada no carregamento de qualquer tela
 * que escreve — sem isso a RLS recusa até o check-in.
 */
export async function ensureSession(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;

  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) {
    // login anônimo desabilitado no painel: a tela continua LENDO
    // normalmente (a leitura é aberta na 0014) e só a escrita falha,
    // com mensagem — melhor que uma tela branca
    console.warn("sem sessão anônima:", error.message);
    return null;
  }
  return anon.user?.id ?? null;
}

export async function currentProfile(): Promise<Profile | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const { data: rows } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .limit(1);

  const p = rows?.[0];
  return {
    id: user.id,
    displayName: (p?.display_name as string) ?? null,
    avatarUrl: (p?.avatar_url as string) ?? null,
    // `is_anonymous` existe no JWT do Supabase desde o login anônimo
    isAnonymous: Boolean((user as { is_anonymous?: boolean }).is_anonymous),
  };
}

/** Link mágico por e-mail — sem senha pra decorar, sem senha pra vazar. */
export async function signInWithEmail(email: string, redirectTo: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(error.message);
}

export async function signInWithGoogle(redirectTo: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function saveProfile(patch: {
  displayName?: string;
  avatarUrl?: string;
}) {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("sem sessão");

  const body: Record<string, unknown> = { id };
  if (patch.displayName !== undefined) body.display_name = patch.displayName;
  if (patch.avatarUrl !== undefined) body.avatar_url = patch.avatarUrl;

  const { error } = await supabase.from("profiles").upsert(body);
  if (error) throw new Error(error.message);
}

/**
 * "Você é o João da lista?" — liga a conta ao jogador que já existe.
 *
 * Sem isso, criar conta zeraria o histórico e a nota de quem já jogava,
 * que é exatamente o motivo de tanta gente não criar conta em app de
 * pelada. Só reivindica quem não tem dono (`claim_player`, 0013).
 */
export async function claimPlayer(playerId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("claim_player", {
    p_player: playerId,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Leva nome e foto da conta pro jogador.
 *
 * A quadra lê `players`, não `profiles` — é o `players` que tem
 * convidado sem conta. Então a conta é a fonte, e isto aqui é o
 * espelho: sem esse passo, a foto ficaria só no perfil e nunca
 * apareceria no Destaque do Dia, que foi o pedido do playtest.
 */
export async function syncPlayerFromProfile(patch: {
  name?: string;
  avatarUrl?: string;
}) {
  const playerId = await myPlayerId();
  if (!playerId) return;

  const body: Record<string, unknown> = {};
  if (patch.name) body.name = patch.name;
  if (patch.avatarUrl) body.avatar_url = patch.avatarUrl;
  if (Object.keys(body).length === 0) return;

  await supabase.from("players").update(body).eq("id", playerId);
}

/** O jogador desta conta, se já reivindicado. */
export async function myPlayerId(): Promise<string | null> {
  const { data } = await supabase.rpc("current_player_id");
  return (data as string) ?? null;
}

/**
 * Sobe a foto.
 *
 * Redimensiona no cliente antes de mandar: 4G de praia não sobe 4 MB, e
 * a foto aparece num avatar de 40px e num card de 1200px — 512 é de
 * sobra pros dois.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("sem sessão");

  const blob = await resize(file, 512);
  const path = `${uid}/avatar-${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(error.message);

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  return pub.publicUrl;
}

async function resize(file: File, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85),
  );
}
