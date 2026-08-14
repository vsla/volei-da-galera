import { NextResponse } from "next/server";

/**
 * Checagem do PIN no servidor — o PIN nunca vai pro bundle.
 * Não é segurança de banco (a RLS é aberta), é só pra evitar que
 * qualquer um saia gerando partida no meio do jogo.
 */
export async function POST(request: Request) {
  const expected = process.env.ORGANIZER_PIN;
  if (!expected) {
    return NextResponse.json({ error: "ORGANIZER_PIN não configurado" }, { status: 500 });
  }

  const { pin } = (await request.json().catch(() => ({}))) as { pin?: string };
  if (typeof pin !== "string" || pin !== expected) {
    return NextResponse.json({ error: "PIN inválido" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
