import { ImageResponse } from "next/og";
import { getHighlightDay, getPelada, longDate } from "@/lib/highlights-server";

export const runtime = "nodejs";

// Route handler só aceita exports conhecidos (GET, runtime, revalidate…).
// alt/size/contentType são de arquivo opengraph-image, aqui iam quebrar o build.
const SIZE = { width: 1200, height: 630 };

/**
 * Barlow Condensed pro card ficar com a mesma cara do app.
 *
 * Sem User-Agent, o Google Fonts devolve TTF em vez de WOFF2 — que é o
 * que o satori consegue ler. Se a rede falhar, o card sai na fonte
 * padrão em vez de dar erro: melhor feio que quebrado.
 */
let fontCache: ArrayBuffer | null | undefined;

async function loadFont(): Promise<ArrayBuffer | null> {
  if (fontCache !== undefined) return fontCache ?? null;
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800",
      { headers: { "User-Agent": "" } },
    ).then((r) => r.text());

    const url = css.match(/src:\s*url\(([^)]+)\)\s*format\('truetype'\)/)?.[1];
    fontCache = url ? await fetch(url).then((r) => r.arrayBuffer()) : null;
  } catch {
    fontCache = null;
  }
  return fontCache ?? null;
}

/**
 * O card que aparece quando alguém cola o link no grupo.
 *
 * Vale mais que qualquer botão de compartilhar: a pessoa manda a URL e
 * o WhatsApp já desenha isso na conversa, sem ninguém precisar salvar
 * imagem nenhuma.
 *
 * Tudo aqui é dimensionado à mão. O satori não encolhe conteúdo que não
 * cabe — ele deixa vazar por cima do resto. Os tamanhos abaixo fecham
 * em ~560px dos 630 disponíveis, com folga pra nome comprido.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; date: string }> },
) {
  const { slug, date } = await params;
  const pelada = await getPelada(slug);
  const day = pelada ? await getHighlightDay(pelada.id, date) : null;

  // ?nomes=a,b,c só em dev, pra ajustar o visual sem depender de votação
  const demo =
    process.env.NODE_ENV !== "production"
      ? new URL(req.url).searchParams.get("nomes")
      : null;

  const names = demo ? demo.split(",") : (day?.winners.map((w) => w.name) ?? []);
  const font = await loadFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0A0F0D",
          padding: "44px 56px",
          fontFamily: "Barlow Condensed, sans-serif",
        }}
      >
        {/* faixa lime na lateral, igual à quadra no app */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 16,
            background: "#C4F82A",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 30, display: "flex" }}>🏐</div>
          <div
            style={{
              fontSize: 26,
              color: "#8A9A93",
              letterSpacing: 8,
              textTransform: "uppercase",
              display: "flex",
            }}
          >
            {pelada?.name ?? "Vôlei da Galera"}
          </div>
        </div>

        <div
          style={{
            fontSize: 62,
            color: "#F2F5F2",
            letterSpacing: 2,
            textTransform: "uppercase",
            marginTop: 10,
            display: "flex",
          }}
        >
          🏆 Destaques do dia
        </div>

        <div
          style={{
            fontSize: 24,
            color: "#8A9A93",
            marginTop: 2,
            display: "flex",
          }}
        >
          {day ? longDate(day.date) : date}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: 26,
          }}
        >
          {names.length === 0 && (
            <div style={{ fontSize: 34, color: "#8A9A93", display: "flex" }}>
              Ninguém votou nessa noite.
            </div>
          )}
          {names.slice(0, 3).map((name) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                background: "#131A17",
                border: "2px solid #2A3833",
                borderRadius: 18,
                padding: "12px 26px",
              }}
            >
              <div style={{ fontSize: 34, display: "flex" }}>⭐</div>
              <div
                style={{
                  fontSize: 46,
                  color: "#F2F5F2",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  display: "flex",
                }}
              >
                {name}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            fontSize: 22,
            color: "#C4F82A",
            letterSpacing: 6,
            textTransform: "uppercase",
            marginTop: "auto",
            display: "flex",
          }}
        >
          {pelada?.name ?? "Vôlei da Galera"}
        </div>
      </div>
    ),
    {
      ...SIZE,
      fonts: font
        ? [
            {
              name: "Barlow Condensed",
              data: font,
              weight: 800 as const,
              style: "normal" as const,
            },
          ]
        : undefined,
    },
  );
}
