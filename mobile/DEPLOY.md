# Rodar o app sem depender do PC

Hoje o app só roda com `expo start` ligado: o Expo Go baixa o bundle da sua
máquina. Desligou o notebook, acabou o app. Pra sair disso, o caminho é gerar
um **build de verdade** (EAS Build) — o JS vai embutido no APK/IPA — e depois
mandar atualizações por ar (EAS Update), sem reinstalar nada.

## 1. Uma vez só

```bash
npm i -g eas-cli
cd mobile
eas login                 # conta Expo (grátis)
eas init                  # cria o projeto e grava extra.eas.projectId no app.json
eas update:configure      # instala expo-updates e configura runtimeVersion/channel
```

## 2. Variáveis de ambiente (Supabase)

O build não enxerga o `.env` local. Sobe pro EAS:

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://SEU-PROJETO.supabase.co" --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
  --value "sb_publishable_..." --visibility plaintext
```

Repita com `--environment production` quando for pra loja. São chaves
publishable (vão pro bundle de qualquer jeito), então `plaintext` está certo —
a `service_role` **nunca** entra aqui.

## 3. Gerar o APK (Android — o caminho barato)

```bash
eas build -p android --profile preview
```

Sai um link de download. Abre no celular, instala, pronto: funciona offline do
seu PC, em qualquer lugar. Pra galera, é só mandar o mesmo link no zap (perfil
`preview` = `distribution: internal`, sem loja, sem revisão).

## 4. Atualizar depois (sem rebuildar)

```bash
eas update --branch preview --message "ajuste no sorteio"
```

Chega em segundos no celular de todo mundo na próxima abertura. Só precisa de
build novo quando mudar dependência nativa ou `app.json`.

## iOS

Curto: **não é obrigatório pagar**, mas as alternativas grátis têm pedágio.

### Grátis, com Xcode (só pra você)

Você tem Mac. Dá pra assinar com Apple ID comum (sem pagar) — mas exige o
**Xcode completo** (App Store, ~8 GB de download e ~25 GB instalado) mais o
CocoaPods. Só as Command Line Tools não bastam. Confira o espaço em disco antes.

Com isso pronto:

```bash
npx expo run:ios --device     # escolhe o iPhone plugado no cabo
```

Na primeira vez o Xcode pede pra escolher o "Personal Team" em Signing &
Capabilities. O app fica instalado de verdade — abre offline, sem `expo start`,
sem PC por perto.

O pedágio: certificado de conta grátis **expira em 7 dias**. Passou disso, o app
para de abrir e você reconecta no Mac pra reinstalar. Também não dá pra mandar
pros amigos — só pros aparelhos que você mesmo plugar.

### Grátis, sem Xcode: usar a web como app

O projeto já tem o site Next.js. No iPhone: Safari → Compartilhar → "Adicionar à
Tela de Início". Vira ícone, abre em tela cheia, funciona de qualquer lugar e
atualiza sozinho. É o caminho sem custo nenhum pra galera toda.

### Pago (US$ 99/ano) — TestFlight

Vale quando você quiser que os outros instalem sem cabo e sem prazo de validade:

```bash
eas build -p ios --profile preview     # ad-hoc: só nos aparelhos registrados
eas build -p ios --profile production && eas submit -p ios   # TestFlight
```

Build do TestFlight dura 90 dias, aceita até 100 testadores por link e recebe
`eas update` normalmente.

## Nota sobre o monorepo

O `metro.config.js` puxa `../shared`. O EAS empacota a partir da raiz do git
(`mobile/` é subpasta), então `shared/` sobe junto — desde que esteja
**commitado**. Arquivo novo em `shared/` sem commit = build quebrado com
"Unable to resolve module".
