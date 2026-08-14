import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHighlightDay, longDate } from "@/lib/highlights-server";
import { ShareCard } from "@/components/ShareCard";

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date } = await params;
  const day = await getHighlightDay(date);
  const names = day?.winners.map((w) => w.name).join(" · ") ?? "";

  return {
    title: `Destaques de ${date} — Vôlei Prainha ZN`,
    description: names || "Destaques do Dia",
    openGraph: {
      title: "🏆 Destaques do Dia",
      description: names || "Vôlei Prainha ZN",
      images: [`/api/og/${date}`],
      type: "article",
    },
    twitter: { card: "summary_large_image", images: [`/api/og/${date}`] },
  };
}

export default async function DiaPage({ params }: Props) {
  const { date } = await params;
  const day = await getHighlightDay(date);
  if (!day) notFound();

  return (
    <main className="flex flex-1 flex-col px-4 pt-10 pb-6">
      <h1 className="font-display text-ink text-center text-2xl font-extrabold tracking-widest uppercase">
        🏆 Destaques do dia
      </h1>
      <p className="text-muted mt-2 mb-8 text-center">{longDate(day.date)}</p>

      <ul className="flex flex-col gap-3">
        {day.winners.map((p) => (
          <li
            key={p.id}
            className="bg-surface border-border flex items-center gap-4 rounded-[16px] border px-5 py-6"
          >
            <span className="text-3xl">⭐</span>
            <span className="font-display text-ink truncate text-xl font-extrabold tracking-widest uppercase">
              {p.name}
            </span>
          </li>
        ))}
      </ul>

      {day.winners.length === 0 && (
        <p className="text-muted py-10 text-center">Ninguém votou nessa noite.</p>
      )}

      <ShareCard date={day.date} names={day.winners.map((w) => w.name)} />

      <div className="mt-8 flex flex-col items-center gap-2">
        <Link
          href="/destaques"
          className="font-display text-muted h-12 text-sm tracking-widest uppercase"
        >
          ver todos os destaques
        </Link>
        <Link
          href="/"
          className="font-display text-muted h-12 text-sm tracking-widest uppercase"
        >
          voltar pra quadra
        </Link>
      </div>
    </main>
  );
}
