"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy } from "lucide-react";
import {
  fetchMembers,
  fetchPeladaBySlug,
  removeMember,
  savePeladaSettings,
  setMemberRole,
  type Member,
  type Pelada,
  type Role,
} from "@/lib/db";
import { ensureSession, myPlayerId } from "@/lib/auth";
import { getMe } from "@/lib/identity";
import { DEFAULT_SETTINGS, type PeladaSettings } from "@/lib/settings";

/**
 * O PAINEL DA PELADA.
 *
 * Playtest 01: "ter seus painéis para ver tudo que precisa, toda a
 * gestão da pelada". Ele fica FORA da tela de jogo de propósito — o
 * lobby é operado em pé, no escuro, com areia na mão, e não pode virar
 * um painel de administração. Aqui é o contrário: é onde se senta pra
 * mexer nas regras.
 */
const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "owner", label: "dono", hint: "manda em tudo, transfere a pelada" },
  { value: "admin", label: "organizador", hint: "monta partida, mexe na noite" },
  { value: "player", label: "jogador", hint: "check-in, vota, acompanha" },
  { value: "guest", label: "convidado", hint: "veio jogar hoje" },
];

export function AdminPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const [pelada, setPelada] = useState<Pelada | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<PeladaSettings>(DEFAULT_SETTINGS);
  const [meId, setMeId] = useState<string | null>(null);
  const [tab, setTab] = useState<"membros" | "regras">("membros");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = await fetchPeladaBySlug(slug);
    setPelada(p);
    if (!p) return;
    setSettings(p.settings);
    setMembers(await fetchMembers(p.id));
  }, [slug]);

  useEffect(() => {
    void ensureSession();
    myPlayerId().then((id) => setMeId(id ?? getMe()));
    void load();
  }, [load]);

  const myRole = members.find((m) => m.playerId === meId)?.role ?? null;
  const canEdit = myRole === "owner" || myRole === "admin";

  const save = async (next: PeladaSettings) => {
    if (!pelada) return;
    setSettings(next);
    setBusy(true);
    try {
      await savePeladaSettings(pelada.id, next);
      setMsg("Salvo.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu pra salvar.");
    } finally {
      setBusy(false);
    }
  };

  if (pelada === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="text-4xl">🏐</span>
      </main>
    );
  }

  if (!pelada) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-display text-muted tracking-widest uppercase">
          Pelada não encontrada
        </p>
      </main>
    );
  }

  const row = "bg-surface border-border rounded-[12px] border px-3 py-3";

  return (
    <main className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push(`/p/${slug}`)}
          aria-label="Voltar pra quadra"
          className="text-muted -ml-2 flex size-12 items-center justify-center"
        >
          <ChevronLeft className="size-6" />
        </button>
        <h1 className="font-display text-ink min-w-0 flex-1 truncate text-xl font-extrabold tracking-widest uppercase">
          {pelada.name}
        </h1>
      </div>

      {!canEdit && (
        <p className="text-muted mb-4 text-sm">
          Você está vendo o painel como {myRole ?? "visitante"} — pra mudar
          alguma coisa, peça pra quem organiza.
        </p>
      )}

      <div className="mb-4 flex gap-1.5">
        {(["membros", "regras"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`font-display h-12 flex-1 rounded-[12px] text-sm tracking-widest uppercase ${
              tab === t ? "bg-accent text-accent-ink font-bold" : "bg-surface text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {msg && <p className="text-accent mb-3 text-sm">{msg}</p>}

      {tab === "membros" ? (
        <>
          {/* o código é o convite: cabe num áudio de WhatsApp */}
          {pelada.joinCode && (
            <div className={`${row} mb-4 flex items-center gap-3`}>
              <div className="min-w-0 flex-1">
                <p className="text-muted text-xs tracking-widest uppercase">
                  código de entrada
                </p>
                <p className="font-display text-ink text-2xl font-extrabold tracking-[0.3em]">
                  {pelada.joinCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `${window.location.origin}/p/${slug} — código ${pelada.joinCode}`,
                  );
                  setMsg("Link copiado.");
                }}
                className="text-muted flex size-12 items-center justify-center"
                aria-label="Copiar convite"
              >
                <Copy className="size-5" />
              </button>
            </div>
          )}

          <p className="text-muted mb-2 text-sm">
            {members.length} {members.length === 1 ? "membro" : "membros"}
          </p>

          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li key={m.playerId} className={row}>
                <div className="flex items-center gap-3">
                  <span className="font-display text-ink min-w-0 flex-1 truncate text-base font-semibold tracking-wide uppercase">
                    {m.name}
                    {m.status === "removed" && (
                      <span className="text-muted ml-2 text-xs">(removido)</span>
                    )}
                  </span>
                  <span className="tnum text-muted/70 text-sm">
                    nota {m.rating.toFixed(1)}
                  </span>
                </div>

                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ROLES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!pelada) return;
                          await setMemberRole(pelada.id, m.playerId, r.value);
                          await load();
                        }}
                        className={`font-display h-9 rounded-full px-3 text-xs tracking-widest uppercase ${
                          m.role === r.value
                            ? "bg-accent text-accent-ink font-bold"
                            : "bg-surface-2 text-muted"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                    {m.status !== "removed" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (!pelada) return;
                          if (!confirm(`Tirar ${m.name} da pelada?`)) return;
                          await removeMember(pelada.id, m.playerId);
                          await load();
                        }}
                        className="font-display text-live ml-auto h-9 px-2 text-xs tracking-widest uppercase"
                      >
                        remover
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Num
            label="Jogadores por time"
            hint="6 = 6×6 na areia"
            value={settings.teamSize}
            min={2}
            max={8}
            disabled={!canEdit}
            onChange={(v) => save({ ...settings, teamSize: v })}
          />
          <Num
            label="Vitórias até cair"
            hint="no teto, o vencedor é desfeito e quem perdeu segura a quadra"
            value={settings.maxStreak}
            min={1}
            max={10}
            disabled={!canEdit}
            onChange={(v) => save({ ...settings, maxStreak: v })}
          />
          <Num
            label="Teto de espera"
            hint="depois de N rodadas fora, entra na próxima. 0 = desligado"
            value={settings.waitCap ?? 0}
            min={0}
            max={10}
            disabled={!canEdit}
            onChange={(v) => save({ ...settings, waitCap: v === 0 ? null : v })}
          />
          <Num
            label="Destaques por pessoa"
            hint="quantos cada um escolhe no fim da noite"
            value={settings.votesPerPlayer}
            min={1}
            max={10}
            disabled={!canEdit}
            onChange={(v) => save({ ...settings, votesPerPlayer: v })}
          />

          <div className={row}>
            <p className="font-display text-ink text-sm tracking-widest uppercase">
              Nome dos times
            </p>
            <p className="text-muted mb-2 text-xs">
              o time não troca de lado — e agora não troca de nome também
            </p>
            <div className="flex gap-2">
              {(["A", "B"] as const).map((side) => (
                <input
                  key={side}
                  disabled={!canEdit}
                  defaultValue={settings.teamLabels[side]}
                  onBlur={(e) =>
                    save({
                      ...settings,
                      teamLabels: {
                        ...settings.teamLabels,
                        [side]: e.target.value.toUpperCase().slice(0, 12),
                      },
                    })
                  }
                  className={`bg-surface-2 border-border text-ink h-12 flex-1 rounded-[12px] border px-3 text-center tracking-widest uppercase ${
                    side === "A" ? "text-team-a" : "text-team-b"
                  }`}
                />
              ))}
            </div>
          </div>

          <Choice
            label="Substituição no meio da partida"
            hint="quem entra no lugar de alguém depois do apito inicial"
            value={settings.substitutionMode}
            disabled={!canEdit}
            options={[
              { value: "titular", label: "vira titular", hint: "conta o jogo e herda a vaga na quadra" },
              { value: "tapa_buraco", label: "tapa-buraco", hint: "não conta o jogo nem herda a vaga" },
            ]}
            onChange={(v) =>
              save({ ...settings, substitutionMode: v as PeladaSettings["substitutionMode"] })
            }
          />

          <Choice
            label="Quem vê a nota"
            hint="nota pública entre amigos vira ranking social"
            value={settings.showRating}
            disabled={!canEdit}
            options={[
              { value: "organizers", label: "organizadores" },
              { value: "everyone", label: "todo mundo" },
              { value: "nobody", label: "ninguém" },
            ]}
            onChange={(v) =>
              save({ ...settings, showRating: v as PeladaSettings["showRating"] })
            }
          />

          <Choice
            label="Quem monta as partidas"
            hint="pelada pequena às vezes não quer burocracia"
            value={settings.whoCanManage}
            disabled={!canEdit}
            options={[
              { value: "admins", label: "só organizadores" },
              { value: "everyone", label: "qualquer um" },
            ]}
            onChange={(v) =>
              save({ ...settings, whoCanManage: v as PeladaSettings["whoCanManage"] })
            }
          />

          <Choice
            label="Placar ponto a ponto"
            hint="o botão de 'quem ganhou' continua existindo do mesmo jeito"
            value={settings.scoring ? "on" : "off"}
            disabled={!canEdit}
            options={[
              { value: "on", label: "ligado" },
              { value: "off", label: "desligado" },
            ]}
            onChange={(v) => save({ ...settings, scoring: v === "on" })}
          />

          <Choice
            label="Convidado sem cadastro"
            hint="entra na lista com um toque, sem conta"
            value={settings.allowGuests ? "on" : "off"}
            disabled={!canEdit}
            options={[
              { value: "on", label: "pode" },
              { value: "off", label: "não pode" },
            ]}
            onChange={(v) => save({ ...settings, allowGuests: v === "on" })}
          />
        </div>
      )}
    </main>
  );
}

function Num({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="bg-surface border-border rounded-[12px] border px-3 py-3">
      <p className="font-display text-ink text-sm tracking-widest uppercase">{label}</p>
      <p className="text-muted mb-2 text-xs">{hint}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
          className="font-display bg-surface-2 text-ink size-12 rounded-[12px] text-xl font-bold disabled:opacity-30"
        >
          −
        </button>
        <span className="font-display tnum text-ink w-10 text-center text-2xl font-extrabold">
          {value}
        </span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
          className="font-display bg-surface-2 text-ink size-12 rounded-[12px] text-xl font-bold disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Choice({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  options: { value: string; label: string; hint?: string }[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="bg-surface border-border rounded-[12px] border px-3 py-3">
      <p className="font-display text-ink text-sm tracking-widest uppercase">{label}</p>
      <p className="text-muted mb-2 text-xs">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.value)}
            title={o.hint}
            className={`font-display h-11 rounded-full px-4 text-xs tracking-widest uppercase disabled:opacity-50 ${
              value === o.value
                ? "bg-accent text-accent-ink font-bold"
                : "bg-surface-2 text-muted"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
