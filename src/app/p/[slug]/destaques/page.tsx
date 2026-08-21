import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPelada, listHighlightDays, longDate } from "@/lib/highlights-server";

type Props = { params: Promise<{ slug: string }> };

export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pelada = await getPelada(slug);
  return {
    title: `Destaques — ${pelada?.name ?? "Pelada"}`,
    description: "Todos os destaques, pelada a pelada.",
  };
}

export default async function DestaquesPage({ params }: Props) {
  const { slug } = await params;
  const pelada = await getPelada(slug);
  if (!pelada) notFound();

  const days = await listHighlightDays(pelada.id);
  const [ultimo, ...anteriores] = days;

  return (
    <main className="flex flex-1 flex-col px-4 pt-10 pb-6">
      <h1 className="font-display text-ink text-center text-2xl font-extrabold tracking-widest uppercase">
        🏆 Destaques
      </h1>
      <p className="text-muted mt-2 mb-8 text-center">{pelada.name}</p>

      {days.length === 0 ? (
        <p className="text-muted py-12 text-center">
          Nenhum destaque ainda.
          <br />
          Depois do primeiro jogo, aparece aqui.
        </p>
      ) : (
        <>
          {/* a noite mais recente vem aberta, as outras viram lista */}
          <Link
            href={`/p/${slug}/destaques/${ultimo.date}`}
            className="bg-surface border-accent/40 block rounded-[16px] border p-5"
          >
            <p className="font-display text-accent text-sm tracking-widest uppercase">
              última pelada
            </p>
            <p className="text-muted mt-1 text-sm">{longDate(ultimo.date)}</p>
            <ul className="mt-4 flex flex-col gap-2">
              {ultimo.winners.map((w) => (
                <li key={w.id} className="flex items-center gap-3">
                  <span className="text-xl">⭐</span>
                  <span className="font-display text-ink truncate text-lg font-extrabold tracking-widest uppercase">
                    {w.name}
                  </span>
                </li>
              ))}
            </ul>
          </Link>

          {anteriores.length > 0 && (
            <>
              <h2 className="font-display text-muted mt-8 mb-2 text-sm tracking-widest uppercase">
                Antes disso
              </h2>
              <ul className="flex flex-col gap-2">
                {anteriores.map((d) => (
                  <li key={d.sessionId}>
                    <Link
                      href={`/p/${slug}/destaques/${d.date}`}
                      className="bg-surface border-border block rounded-[12px] border px-4 py-3"
                    >
                      <p className="text-muted text-sm">{longDate(d.date)}</p>
                      <p className="font-display text-ink mt-1 truncate text-base font-semibold tracking-wide uppercase">
                        {d.winners.map((w) => w.name).join(" · ")}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <Link
        href={`/p/${slug}`}
        className="font-display text-muted mt-10 h-12 text-center text-sm tracking-widest uppercase"
      >
        voltar pra quadra
      </Link>
    </main>
  );
}
