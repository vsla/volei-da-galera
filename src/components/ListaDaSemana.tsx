"use client";

import { useCallback, useEffect, useState } from "react";
import {
  addMember,
  addMembers,
  ensureTodaySession,
  fetchState,
  syncMembers,
  type Member,
} from "@/lib/db";
import { diffRoster, parseRoster, type Diff } from "@/lib/roster-parse";
import { today } from "@/components/PeladaScreen";

/**
 * A LISTA DA SEXTA, NO PAINEL.
 *
 * Antes disto, a lista do WhatsApp virava um `.sql` escrito à mão e
 * rodado no SQL Editor do Supabase — `supabase/roster_2026_09_04.sql`.
 * Só uma pessoa no grupo conseguia fazer, e o arquivo começava com
 * `delete from players`, então cada sexta zerava a nota e o histórico de
 * todo mundo.
 *
 * São dois caminhos aqui porque são dois momentos diferentes:
 *
 *   • UM NOME é o "o Arthur vai hoje" das 20h50, digitado em pé, com
 *     areia na mão. Um campo, um toque;
 *   • COLAR A LISTA é sexta de manhã, sentado. O bloco inteiro do grupo,
 *     sem editar nada — e uma prévia antes de gravar, porque é a única
 *     operação daqui que TIRA gente da tela.
 */
export function ListaDaSemana({
  peladaId,
  members,
  canEdit,
  onChange,
}: {
  peladaId: string;
  members: Member[];
  canEdit: boolean;
  onChange: () => Promise<void> | void;
}) {
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [noite, setNoite] = useState<
    { date: string; checkIns: number } | null | undefined
  >(undefined);

  const lerNoite = useCallback(async () => {
    try {
      const s = await fetchState(peladaId);
      setNoite(
        s
          ? {
              date: s.date,
              checkIns: s.players.filter((p) => p.checkedInAt).length,
            }
          : null,
      );
    } catch {
      // `fetchState` levanta quando a LEITURA falha, e devolve null só
      // quando realmente não há noite. A diferença importa: `undefined`
      // aqui vira "não deu pra saber", e a tela não oferece abrir a
      // noite por cima de uma que pode estar acontecendo.
      setNoite(undefined);
    }
  }, [peladaId]);

  useEffect(() => {
    void lerNoite();
  }, [lerNoite]);

  if (!canEdit) return null;

  const box = "bg-surface border-border rounded-[12px] border px-3 py-3";
  const botao =
    "font-display bg-accent text-accent-ink h-12 rounded-[12px] px-4 text-sm font-bold tracking-widest uppercase disabled:opacity-40";

  const adicionarUm = async () => {
    const n = nome.trim();
    if (!n || busy) return;
    setBusy(true);
    setErro(null);
    try {
      await addMember(peladaId, n, /\([^)]*\)\s*$/.test(n));
      setNome("");
      setAviso(`${n} entrou na lista.`);
      await onChange();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra adicionar.");
    } finally {
      setBusy(false);
    }
  };

  const conferir = () => {
    setErro(null);
    setAviso(null);
    const lista = parseRoster(texto);
    if (!lista.length) {
      setErro("Não achei nome nenhum nesse texto.");
      return;
    }
    setPrevia(diffRoster(lista, members));
  };

  const gravar = async () => {
    if (!previa || busy) return;
    setBusy(true);
    setErro(null);
    try {
      // A ordem importa: SOMA antes de sincronizar. Ao contrário, quem
      // está na lista colada mas ainda não é membro seria contado como
      // "fora da lista" na hora do sync — e o sync veria a tela antiga.
      if (previa.entram.length) await addMembers(peladaId, previa.entram);
      const todos = parseRoster(texto).map((n) => n.name);
      const sairam = await syncMembers(peladaId, todos);

      setPrevia(null);
      setTexto("");
      setAviso(
        `${previa.entram.length} ${previa.entram.length === 1 ? "entrou" : "entraram"}, ` +
          `${sairam} ${sairam === 1 ? "saiu" : "saíram"} da tela.`,
      );
      await onChange();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra gravar a lista.");
    } finally {
      setBusy(false);
    }
  };

  const abrirNoite = async () => {
    if (busy) return;
    setBusy(true);
    setErro(null);
    try {
      await ensureTodaySession(peladaId, today());
      await lerNoite();
      setAviso("Noite aberta.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra abrir a noite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-4 flex flex-col gap-3">
      <h2 className="font-display text-muted text-xs tracking-widest uppercase">
        a lista da semana
      </h2>

      {/* ── A noite ─────────────────────────────────────────── */}
      <div className={`${box} flex items-center gap-3`}>
        <div className="min-w-0 flex-1">
          <p className="text-muted text-xs tracking-widest uppercase">
            a noite de hoje
          </p>
          <p className="text-ink text-sm">
            {noite === undefined
              ? "não deu pra ler agora"
              : noite === null
                ? "ninguém abriu ainda"
                : `noite de ${diaMes(noite.date)} aberta · ${noite.checkIns} ${
                    noite.checkIns === 1 ? "check-in" : "check-ins"
                  }`}
          </p>
        </div>
        {/* A data sai do fuso de São Paulo calculada no cliente — era uma
            linha de SQL escrita à mão, e uma sexta já começou com a lista
            marcada em "24/09", que não era sexta. */}
        {noite === null && (
          <button
            type="button"
            onClick={abrirNoite}
            disabled={busy}
            className={botao}
          >
            abrir
          </button>
        )}
      </div>

      {/* ── Um nome ─────────────────────────────────────────── */}
      <div className={`${box} flex flex-col gap-2`}>
        <label
          htmlFor="um-nome"
          className="text-muted text-xs tracking-widest uppercase"
        >
          um nome
        </label>
        <div className="flex gap-2">
          <input
            id="um-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void adicionarUm();
            }}
            placeholder="Arthur Farias"
            className="bg-surface-2 text-ink placeholder:text-muted/60 h-12 min-w-0 flex-1 rounded-[12px] px-3 text-base"
          />
          <button
            type="button"
            onClick={adicionarUm}
            disabled={busy || !nome.trim()}
            className={botao}
          >
            adicionar
          </button>
        </div>
        <p className="text-muted text-xs">
          Nome entre parênteses é convidado — <em>Guilherme (Lê)</em>.
        </p>
      </div>

      {/* ── Colar a lista ───────────────────────────────────── */}
      <div className={`${box} flex flex-col gap-2`}>
        <label
          htmlFor="colar-lista"
          className="text-muted text-xs tracking-widest uppercase"
        >
          colar a lista do grupo
        </label>
        <textarea
          id="colar-lista"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setPrevia(null);
          }}
          rows={6}
          placeholder={"Vôlei Sexta 11/09 | Prainha ZN\n1. Miguel\n2. Suzana…"}
          className="bg-surface-2 text-ink placeholder:text-muted/60 rounded-[12px] px-3 py-2 text-base"
        />

        {previa ? (
          <>
            <Coluna titulo="entram" nomes={previa.entram.map((n) => n.name)} />
            <Coluna titulo="ficam" nomes={previa.ficam.map((m) => m.name)} />
            <Coluna titulo="saem" nomes={previa.saem.map((m) => m.name)} />
            {previa.saem.length > 0 && (
              // Sem esta frase, "saem 12" parece perda de dados — que é
              // exatamente o que os `delete from players` mereciam.
              <p className="text-muted text-xs">
                Nota e histórico ficam no banco — voltam se o nome voltar na
                semana que vem.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={gravar}
                disabled={busy}
                className={botao}
              >
                gravar
              </button>
              <button
                type="button"
                onClick={() => setPrevia(null)}
                disabled={busy}
                className="font-display text-muted h-12 px-3 text-sm tracking-widest uppercase"
              >
                cancelar
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={conferir}
            disabled={busy || !texto.trim()}
            className={`${botao} self-start`}
          >
            conferir
          </button>
        )}
      </div>

      {aviso && <p className="text-accent text-sm">{aviso}</p>}
      {erro && <p className="text-live text-sm">{erro}</p>}
    </section>
  );
}

function Coluna({ titulo, nomes }: { titulo: string; nomes: string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-display text-muted text-xs tracking-widest uppercase">
        {titulo} ({nomes.length})
      </p>
      <p className="text-ink text-sm">
        {nomes.length ? nomes.join(" · ") : "—"}
      </p>
    </div>
  );
}

/** `2026-09-11` → `11/09`. É como a lista do grupo escreve a data. */
function diaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}
