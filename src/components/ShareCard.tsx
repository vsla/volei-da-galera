"use client";

import { useState } from "react";
import { Download, Link2, Share2 } from "lucide-react";

/**
 * Três formas de levar o destaque pro grupo, da melhor pra pior:
 *
 *   1. compartilhar a imagem direto (Web Share API com arquivo)
 *   2. copiar o link — o WhatsApp desenha o card sozinho na prévia
 *   3. baixar o PNG, pra quem quiser postar em outro lugar
 *
 * O botão 1 só aparece quando o aparelho realmente sabe compartilhar
 * arquivo. No desktop quase nunca sabe, então cai no 2 sem drama.
 */
export function ShareCard({ date, names }: { date: string; names: string[] }) {
  const [msg, setMsg] = useState<string | null>(null);

  const imageUrl = `/api/og/${date}`;
  const texto = `🏆 Destaques do Dia — Vôlei Prainha ZN\n\n${names
    .map((n) => `⭐ ${n}`)
    .join("\n")}`;

  const pegarImagem = async () => {
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    return new File([blob], `destaques-${date}.png`, { type: "image/png" });
  };

  const compartilhar = async () => {
    setMsg(null);
    try {
      const file = await pegarImagem();
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: texto });
        return;
      }
      await navigator.share({ title: "Destaques do Dia", text: texto, url: location.href });
    } catch {
      setMsg("Não rolou compartilhar — copia o link.");
    }
  };

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setMsg("Link copiado! Cola no grupo que aparece o card.");
    } catch {
      setMsg(location.href);
    }
  };

  const baixar = async () => {
    const file = await pegarImagem();
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-8">
      {/* prévia do card exatamente como vai aparecer no grupo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="Card dos destaques"
        className="border-border w-full rounded-[16px] border"
      />

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Botao onClick={compartilhar} icon={<Share2 className="size-5" />}>
          Enviar
        </Botao>
        <Botao onClick={copiarLink} icon={<Link2 className="size-5" />}>
          Link
        </Botao>
        <Botao onClick={baixar} icon={<Download className="size-5" />}>
          Baixar
        </Botao>
      </div>

      {msg && <p className="text-muted mt-3 text-center text-sm">{msg}</p>}
    </div>
  );
}

function Botao({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display bg-surface border-border text-ink active:border-accent flex h-14 flex-col items-center justify-center gap-1 rounded-[12px] border text-xs tracking-widest uppercase"
    >
      {icon}
      {children}
    </button>
  );
}
