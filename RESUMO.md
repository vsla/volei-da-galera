# Vôlei Prainha ZN — Resumo do planejamento

## O que é

Site mobile-first para organizar o vôlei de toda sexta na Prainha ZN.
~25 pessoas, 1 quadra, 6x6 na areia. Hoje isso roda num bot de Telegram.

## O problema real

Não é "sortear nomes". São três coisas que o bot mistura:

| Pergunta | O que resolve |
|---|---|
| Quem joga agora? | **Justiça** — quem jogou menos tem prioridade |
| Com quem joga? | **Variedade** — não repetir sempre os mesmos parceiros |
| Todo mundo vê o mesmo? | **Estado compartilhado** — é aqui que o site ganha do bot |

**O diferencial do site não é o algoritmo — é a tela ao vivo.** Cada um faz o
próprio check-in e vê sua posição na fila em tempo real. O algoritmo o bot já
faz. Se a tela ficar desatualizada, a galera volta pro WhatsApp na hora.

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Formato | 1 quadra, 6x6, `teamSize` configurável | Como vocês jogam hoje |
| Rotação | **Vencedor fica**, cai após `N` vitórias. N=2, editável na tela | Regra clássica de praia; simplifica muito o sorteio (escolhe 6, não 12) |
| Fim de partida | 1 toque: quem ganhou. **Sem placar** | Placar é físico na quadra; digitar ponto no meio do jogo ninguém faz |
| Login | Lista de nomes, clica no seu | OAuth quebra no WebView do WhatsApp e 4G de praia |
| Desempate na fila | **Sorteio com seed**, não ordem de chegada | Chegada acumula viés: quem chega cedo jogaria mais a noite toda |
| Nota de habilidade | **Fora** | "Quem foi o filho da puta que me deu 2.3?" |
| Destaques do Dia | **Dentro** — 3 votos, sem contagem pública | Lúdico em vez de competitivo |
| Visual | Placar noturno — fundo escuro, lime, números grandes | Lê bem à noite na praia, poupa bateria |
| Organizador | Mesma tela + modo edição | Não perde de vista o estado real no meio do jogo |

## O algoritmo, em duas frases

1. **Quem joga:** ordena por `menos jogos` → `há mais tempo sem jogar` →
   `sorteio`. Pega os 6 (ou 12) primeiros.
2. **Com quem joga:** entre os escolhidos, testa ~300 divisões A/B e fica com a
   que menos repete parceiros das últimas 3 rodadas.

Separado assim, cada metade se explica em uma frase. Isso importa: o Ítalo já
perguntou *"ele sorteia bem distribuído ou é aleatório?"*. Tem uma tela
**"por que esses 6?"** que mostra a conta. Se ninguém entende, ninguém confia.

Quem chega atrasado sobe sozinho pro topo — tem 0 jogos. Não existe regra
especial de atrasado; é consequência de "quem jogou menos joga antes".

## Telas

1. **Entrar** — grid de 25 nomes, clica no seu
2. **Lobby** — quadra ao vivo, botão de check-in, fila com "← VOCÊ"
3. **Modo edição** *(organizador, mesma tela)* — drag & drop, fixar, re-sortear
4. **Por que esses 6?** — sheet de explicabilidade
5. **Destaques** — votação em até 3
6. **Resultado** — os 3 destaques, sem contagem de votos

## Fora do escopo

chat · pagamento · ELO · nota de habilidade · placar em pontos · feed social ·
push · múltiplos eventos · múltiplas quadras · estatísticas históricas ·
perfil de jogador

## Ordem de entrega

1. Schema + seed + deploy vazio na Vercel
2. Login por lista + check-in
3. Lobby ao vivo (realtime)
4. `generateNextMatch` + testes
5. Fim de partida + rotação do campeão
6. Modo edição / drag & drop
7. Destaques do Dia

**Do 1 ao 5 já substitui o bot.** Se apertar o tempo, corta do 7 pra trás.

## Riscos conhecidos

- **4G da praia.** O app precisa aguentar reconexão e mostrar estado velho sem
  quebrar. Polling de fallback se o realtime cair.
- **Adoção.** Se o Neto for o único a mexer, virou o bot com CSS. O check-in
  próprio é o que muda o jogo — tem que ser 1 toque, sem login chato.
- **Confiança no sorteio.** Por isso a tela de explicabilidade não é enfeite.

---

📄 Especificação executável completa: **[PRP.md](./PRP.md)**
