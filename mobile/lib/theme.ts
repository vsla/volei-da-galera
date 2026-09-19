/**
 * Paleta escura, pensada pra tela lida na beira da quadra à noite.
 *
 * Fundo quase preto porque o app é usado às 21h no escuro e branco cega.
 * O laranja é a única cor de ação — se tudo brilha, nada brilha, e na
 * quadra a pessoa tem três segundos pra achar o botão certo.
 */
export const c = {
  bg: "#0B0D10",
  surface: "#14181D",
  surface2: "#1C2229",
  border: "#252C35",
  text: "#F2F5F8",
  dim: "#8A97A6",
  faint: "#5A6672",

  accent: "#FF6B1A",
  accentDim: "#7A3410",
  /**
   * A tinta que vai EM CIMA do laranja.
   *
   * Era `#FFFFFF`, e branco sobre `#FF6B1A` dá 2,6:1 — abaixo de
   * qualquer piso de leitura, e pior ainda às 21h com brilho baixo. Este
   * quase-preto quente dá ~7:1 e é o que faz o botão laranja parecer
   * sólido em vez de lavado.
   */
  accentInk: "#180A02",
  /**
   * O fundo do "selecionado" que NÃO é um botão.
   *
   * O `accentDim` servia de fundo pra opção escolhida e o texto de apoio
   * ficava em `faint` — cinza sobre laranja queimado, ilegível. A opção
   * marcada agora é um cartão escuro com borda laranja: a cor diz qual
   * é, e o texto continua sendo texto.
   */
  selBg: "#1E1611",

  teamA: "#2F7DF6",
  teamB: "#FF6B1A",

  ok: "#2ECC71",
  warn: "#F5B942",
  danger: "#E5484D",
} as const;

export const sp = (n: number) => n * 4;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const type = {
  hero: { fontSize: 32, fontWeight: "800" },
  title: { fontSize: 22, fontWeight: "800" },
  section: { fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  body: { fontSize: 15, fontWeight: "500" },
  label: { fontSize: 13, fontWeight: "600" },
  tiny: { fontSize: 11, fontWeight: "600" },
} as const;
