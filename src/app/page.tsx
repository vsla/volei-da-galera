"use client";

/**
 * TAREFA 1 — prova visual do lobby com dados fixos.
 * As tarefas 2 e 3 trocam este mock por Supabase + realtime;
 * os componentes abaixo já têm a forma final.
 */

import { Header } from "@/components/Header";
import { LiveStrip } from "@/components/LiveStrip";
import { CourtCard } from "@/components/CourtCard";
import { Queue } from "@/components/Queue";
import { BottomBar } from "@/components/BottomBar";
import type { SessionPlayer } from "@/lib/types";

const mock = (name: string, gamesPlayed: number): SessionPlayer => ({
  id: name,
  name,
  avatarUrl: null,
  isGuest: false,
  checkedInAt: new Date().toISOString(),
  gamesPlayed,
  lastPlayedAt: null,
  excluded: false,
});

const TEAM_A = [
  mock("Maria Gabrielly", 3),
  mock("Pedro Augusto", 3),
  mock("Fefa", 3),
  mock("Baca", 3),
  mock("Bia", 3),
  mock("Tali", 3),
];

const TEAM_B = [
  mock("Neto", 2),
  mock("Ewerton", 2),
  mock("Miguel", 2),
  mock("Lenin Pastichi", 2),
  mock("Álvaro Gabriel", 2),
  mock("Ítalo Thiago", 2),
];

const QUEUE = [
  mock("João", 0),
  mock("Arthur Farias", 1),
  mock("Suzana Rodrigues", 1),
  mock("Mateus", 2),
  mock("Guilherme", 2),
  mock("Alisson", 2),
  mock("Brenno", 2),
  mock("Victor", 3),
  mock("Leandro", 3),
];

const ME = "Ítalo Thiago";

const dateLabel = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
})
  .format(new Date())
  .replace(".", "");

export default function Home() {
  return (
    <>
      <Header dateLabel={dateLabel} isOrganizer />
      <LiveStrip checkedIn={TEAM_A.length + TEAM_B.length + QUEUE.length} round={4} />

      <main className="flex-1 overflow-y-auto">
        <CourtCard
          teamA={TEAM_A}
          teamB={TEAM_B}
          championTeam="A"
          streak={2}
          meId={ME}
          canFinish
        />
        <Queue players={QUEUE} meId={ME} />
      </main>

      <BottomBar state={{ kind: "playing" }} />
    </>
  );
}
