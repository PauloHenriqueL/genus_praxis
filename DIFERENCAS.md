# Genus Práxis × All_OS — o que mudou

O Genus Práxis nasceu como fork white-label do **All_OS**. Hoje os dois compartilham
o mesmo motor de MMR e os mesmos prompts de avaliação, mas divergiram em arquitetura,
provedor de IA e escopo de produto.

Este documento registra as diferenças **verificadas no código**, não as pretendidas.
Números conferidos em 2026-07-09.

| | All_OS | Genus Práxis |
|---|---|---|
| `server/index.js` | 3001 linhas | 2160 linhas |
| Rotas HTTP | 65 | 54 |
| Provedor de IA | Anthropic (paciente) + OpenAI (avaliadores) | **100% OpenAI** |
| Módulo Neuro | sim | **não** |
| Testes | 8 arquivos | **20 arquivos, 497 testes** |
| CSS | 1 arquivo de 3126 linhas | 646 linhas + 15 arquivos por página |
| Deps de runtime | 10 (inclui `@anthropic-ai/sdk` e `uuid`, este sem uso) | **7** |

---

## 1. Escopo do produto

### O que o Genus NÃO tem
- **Todo o módulo Neuro** (neuropsicologia): `/api/neuro*`, `neuro-characters.json`,
  `neuro-tests.json`, as telas `NeuroEval` e `AdminNeuro`, os componentes
  `TestSelector`/`TestComparison`. Removido por decisão de produto.
- Como consequência, sumiram também: a conquista `neuro_complete` (o Genus tem **19**,
  o All_OS 20), a missão diária `daily_neuro` (o Genus tem **3**, o All_OS 4) e o stat
  `totalNeuro`.
- A conquista `polivalente` mudou de significado: no All_OS exigia
  `exercise + freeplay + neuro` no mesmo dia; aqui, `exercise + freeplay`.

### O que só o Genus tem
- `GET /api/health` — healthcheck que valida se o volume de dados está gravável.
- `POST /api/entrevistador/extract` e `POST /api/entrevistador/character` — extração
  dos Blocos 1/2 e criação automática de personagem, **no servidor** (no All_OS o
  parsing era regex no cliente).
- `PUT /api/freeplay/:id/photo` — foto de paciente em rota própria, com validação de
  MIME/tamanho (no All_OS a foto ia junto no `PUT` do personagem).
- Página `Home` (`/inicio`) e barra lateral recolhível.

> As rotas `GET/POST/PUT/DELETE /api/freeplay` e `/api/exercises` existem nos dois.
> No Genus elas são montadas por `mountCharacterCrud()`, por isso não aparecem num
> `grep` de `app.get('...`. Não confunda com rota faltando.

---

## 2. Inteligência artificial

O All_OS usa **Claude (Anthropic)** para interpretar o paciente e OpenAI para os
avaliadores. O Genus é **100% OpenAI** — não há `@anthropic-ai/sdk` nem
`ANTHROPIC_API_KEY`.

| papel | All_OS | Genus |
|---|---|---|
| Paciente (chat) | `claude-sonnet-4-6` | `gpt-4o-mini` (`OPENAI_PATIENT_MODEL`) |
| Avaliador | `gpt-5.5` | `gpt-4o` (`OPENAI_EVAL_MODEL`) |
| Entrevistador | `gpt-5.4` | `OPENAI_ENTREVISTADOR_MODEL` (default = avaliador) |
| Transcrição | Whisper | Whisper |

### `/api/evaluate` não é streaming
No All_OS a avaliação volta em **SSE** (`text/event-stream`), com o texto aparecendo ao
vivo e um toggle `showReasoning`. No Genus é uma resposta JSON única:

```js
await api.evaluate(messages, context)
// → { role, content, score }
// → + { criteriaScores, reasoning } se supervisor/admin
```

Quem decide se o `reasoning` vai é o **papel do usuário**, no servidor — não uma flag
enviada pelo cliente. Toda a UI que mostrava texto chegando ao vivo virou spinner +
texto completo no fim.

---

## 3. Arquitetura do servidor

### Escrita concorrente
O Genus tem `withFileLock(file, fn)` e o usa em **34 pontos** — toda escrita de JSON.
O All_OS faz `read → push → write` sem lock (**0 ocorrências**), o que perde escritas
sob concorrência.

### Seed de conteúdo (`server/seed/`)
Só o Genus. `server/data/*.json` está no `.gitignore` (contém hashes de senha), então o
**conteúdo** que precisa existir num deploy limpo — pacientes e exercícios — mora em
`server/seed/` e é copiado no primeiro boot, sem nunca sobrescrever o volume.

Sem isso, um deploy novo subiria sem nenhum paciente.

### Avaliação em background
O `finalizeDuel` do Genus roda **depois** de responder ao cliente, com retry
(`status: 'pending'` se a IA falhar). No All_OS a avaliação comparativa acontece dentro
do `POST /submit`, segurando a request.

### `pruneExpiredDuels`
Roda no boot **e** nas rotas `GET /api/duels/social` e `GET /api/duel/:id/export` — nos
dois sistemas. TTL de 30 dias.

Não roda em `GET /api/duel/:id` (nem aqui, nem no All_OS): essa rota é o alvo do polling
do `DuelSession` enquanto o `finalizeDuel` avalia, e `pruneExpiredDuels` escreve em
`duels.json` **sem `withFileLock`** — prunar ali poderia atropelar a gravação do
resultado. Há teste travando essa decisão nos dois sentidos.

---

## 4. Schema de dados

### Log de sessão
O Genus **adicionou** três campos e **perdeu** um:

| campo | All_OS | Genus |
|---|---|---|
| `type` | — | `'exercise' \| 'freeplay'` — **obrigatório** (400 sem ele) |
| `mode` | `'competitive' \| 'training'` | idem |
| `difficulty` | vinha do cliente | **resolvida no servidor** (o cliente não decide) |
| `sessionCount` | — | número de sessões da simulação |
| `skillId` | vem do **cliente** (`body.skillId`) | **resolvido no servidor** a partir do `exercises.json` |

`difficulty` e `skillId` saem da mesma leitura do `exercises.json`. O cliente pode mandar
`skillId: 99` que o servidor ignora — no All_OS esse 99 iria para o log e contaminaria
qualquer relatório por competência. `normalizeSkillId` também rejeita `null`/`''`/`[]`,
que um `Number.isFinite(Number(v))` ingênuo transformaria na **competência 0**
(inexistente — são 1 a 5).

Nos Logs, um selo mostra a competência treinada, e o `.txt` exportado ganha a linha
`Competência: Hermenêutica`.

### Personagens
O All_OS unificava tudo; o Genus separa `exercises.json` (trilha) de
`freeplay-characters.json` (simulação). O `characters.json` legado foi removido.

### Duelo (`publicDuel`)
Nomes de campo mudaram: `youAre` → **`side`**; as mensagens vêm em `myMessages` /
`challengerMessages` / `opponentMessages`. Cada lado só vê as próprias mensagens até o
duelo completar (o Genus entrega `myMessages` durante o duelo, para retomar sessão, sem
vazar as do oponente).

---

## 5. Avaliador customizado por exercício

Nos dois sistemas, um exercício com `evaluatorPrompt` preenchido usa **aquele prompt como
avaliador**, não o global. A diferença está em quem faz a conta.

Cada avaliador customizado traz a **própria escala** — os três exercícios reais usam
*"5 eixos de 0 a 2 pontos, máx. 10"*. Por isso o wrapper pede `[NOTA:X]`: a IA devolve a
nota final já na escala que o prompt definiu.

- **All_OS**: o cliente parseia `[NOTA:X]` e manda no `saveLog`.
- **Genus**: o **servidor** parseia (`extractFinalScore`), remove o marcador do texto do
  aluno e devolve `score`. `POST /api/logs` repete a limpeza como rede de segurança.

> **Cuidado ao mexer**: forçar esses avaliadores a emitir o bloco `[notas-supervisor]`
> (6 critérios) corrompe a nota. O `finalScoreFromCriteria` assume
> `base = nº critérios × 10`; com 5 eixos de 0–2, a mesma sessão vale **7 numa escala e
> 40 na outra**. Já testamos ao vivo.

**Consequência herdada do All_OS** — e mantida por decisão consciente: as escalas
convivem. Exercício sai em 0–10 (escala do próprio avaliador); freeplay, duelo e
progressão em 0–100.

O `ScoreBadge` clampa em 0–100 e colore por faixa (`≤22` vermelho … `≥81` verde), então
**toda nota de exercício cai na faixa vermelha "Erro" — inclusive um 10/10 perfeito**.
A conquista `high_score` (`score >= 25`) também é inalcançável por exercício. O MMR não é
afetado (só olha freeplay).

O All_OS tem o mesmo comportamento: o wrapper dele manda "use a escala que sua avaliação
considerar apropriada", o cliente só arredonda, e o comentário do `ScoreBadge` dele
assume — *"notas fora de 0-100 são clampadas… a coloração fica aproximada"*.

> **Não conserte isso sem decisão de produto.** Foi avaliado e mantido para não divergir
> do All_OS. As saídas seriam: (a) o wrapper exigir `[NOTA:X]` em 0–100; (b) uma prop
> `max` no badge. Ambas afastam o Genus do original.

---

## 6. Segurança

Em termos de garantias, os dois sistemas hoje estão equivalentes. Vale registrar o
histórico com honestidade: **três proteções que o All_OS já tinha foram perdidas durante
o porte** e depois restauradas no Genus. Não eram bugs do All_OS — eram regressões do
fork:

1. **`GET /api/logs` deixou de ser deny-by-default.** O filtro passou a pegar só
   `role === 'therapist'`, e o **visitante caía no `else`, recebendo os logs de todos os
   usuários**. O All_OS tratava `therapist || visitor` explicitamente. Hoje o Genus
   inverteu a regra: quem não é professor/admin só vê os próprios.
2. **O professor passou a ver os logs de todos os alunos**, não só os vinculados a ele,
   e o `?userId=` deixou de ser validado. O All_OS já usava `canAccessUserResource`.
   Restaurado.
3. **`GET /api/entrevistador-prompt` ficou aberto** a qualquer usuário autenticado —
   aluno e visitante baixavam 46KB de IP da Allos. No All_OS a rota sempre foi
   `requireRole('admin')`. Restaurado.

> Moral: as três regressões passariam despercebidas se o porte tivesse trazido também a
> suíte de testes do All_OS. Foi o que motivou os 497 testes de hoje (ver §7).

Os dois rejeitam `systemPrompt` no body de `/api/chat` com **400** (anti
prompt-injection). O Genus acrescenta que `criteriaScores`/`reasoning` só vão para
supervisor/admin — decidido pelo **papel do usuário no servidor**, não por uma flag que o
cliente envia (no All_OS o cliente pedia `showReasoning`).

### Rate limiters — mais frouxos, de propósito
| limiter | All_OS | Genus | por quê |
|---|---|---|---|
| `loginLimiter` | 10 / 15min | **20 / 15min** | tolerância a erro de digitação |
| `visitorLimiter` | 5 / 15min | **30 / 60min** | uma turma inteira atrás do mesmo NAT compartilha o IP |
| `aiLimiter` | 300 / h | 400 / h | |
| `writeLimiter` | 200 / h | 300 / h | |

`ADMIN_INITIAL_PASSWORD` aceita 8 caracteres no Genus (12 no All_OS) e, se ausente, o app
sobe com contas de demonstração em vez de recusar. **Decisões conscientes** — não são
regressões esquecidas.

---

## 7. Testes

O All_OS tem 8 arquivos. O Genus tem **20 arquivos, 497 testes**, e o harness
(`tests/helpers.js`) garante três invariantes:

- `DATA_DIR` é um tmpdir por processo — **nunca toca `server/data/`**;
- `OPENAI_API_KEY=''` — **nenhum teste chama a OpenAI de verdade** (o `dotenv` não
  sobrescreve env já definida, então o `''` vence mesmo com `.env` no disco);
- `NODE_ENV=test` desliga os rate limiters.

`tests/harness.test.js` testa o próprio harness. Se ele falhar, a suíte está mentindo.

A suíte foi validada por **mutação**: cada bug real já corrigido foi reintroduzido no
servidor, um a um, para confirmar que a suíte falha. Um deles (`avaliador.md`) não era
pego por nenhum teste de HTTP — daí `tests/prompt-files.test.js`, que verifica no
código-fonte e no disco que todo prompt referenciado existe.

---

## 8. Frontend

- **Tema laranja** (`--orange: #ff6200`) no lugar do verde/terra.
- **CSS por página**: o `index.css` guarda só o tema base; cada página tem seu
  `styles/<Nome>.css`. Classes de nome genérico (`.active`, `.win`, `.assistant`) são
  **escopadas** sob um wrapper (`.duel-page`, `.session-page`, …). O All_OS tem tudo num
  arquivo de 3126 linhas.
- **Sem `client/src/prompts.js`**: o parsing de notas vive no servidor. Só
  `SKILL_NAMES`/`SKILL_COLORS` foram extraídos para `utils/skills.js`.
- **Modo competitivo** trafega por query string: `/chat/freeplay/:id?mode=competitive`.
- **Responsividade**: `100dvh` (com fallback `@supports`) no chat e no drawer, para o
  campo de digitação não sumir atrás do teclado virtual; `font-size: 16px` nos inputs no
  mobile (abaixo disso o iOS dá zoom automático).

### O que o Genus ainda não tem do All_OS
- `Profile`: campo de gênero e opt-ins de e-mail.

### Botão "Log" no cabeçalho da sessão
Baixa o `.txt` sem finalizar o atendimento. O All_OS só o tem no `ChatSession`
(exercício da trilha); o Genus o tem **também no `EchoSession`** (Simulação), onde as
sessões são mais longas (multi-sessão com time-skip) e a falta era mais sentida.

Em ambos, o botão só aparece quando existe conversa de verdade: a mensagem de kickoff é
`isSystem` e, no EchoSession, os marcadores de troca de sessão têm `type` — nenhum dos
dois habilita o download.

### Cropper de foto de perfil
Os dois usam o `<PhotoCropper>` (arrastar + zoom, JPEG 320×320 via `onCrop(dataUrl)`).
Duas diferenças no Genus:

- **O stage encolhe em telas estreitas.** O All_OS fixa 280px, que estoura um celular de
  320px (o modal come 92px de padding). Aqui o tamanho é calculado no mount e no
  `resize`; ao mudar, `scale` e `offset` são reescalados na mesma proporção, senão o
  recorte salvo sairia diferente do que o usuário enquadrou.
- **Reabrir a foto só funciona com data URL.** Um avatar da galeria vem de
  `/profiles_icon`, servido por `express.static` **sem `Access-Control-Allow-Origin`** —
  num deploy com o front noutra origem (`VITE_API_BASE`) ele tingiria o canvas e o
  `toDataURL()` lançaria `SecurityError`. Nesse caso o cropper abre vazio. (O All_OS
  nunca passa `initialImage`, então não esbarra nisso.)

### Onde o Genus é melhor: notas por critério
Os dois renderizam a `CriteriaTable` nos Logs e incluem o bloco "NOTAS POR CRITÉRIO" no
`.txt` exportado (só para professor/admin — o servidor não envia `criteriaScores` ao
aluno).

O Genus corrigiu um bug que o All_OS tem: o filtro era
`Number.isFinite(Number(v))`, mas `Number(null)`, `Number('')` e `Number([])` valem **0**.
Um critério ausente virava um **"0/10" inventado** na avaliação do aluno. Agora só passa
número de verdade ou string numérica — e a nota **0 legítima** continua aparecendo.
Rótulos e ordenação vivem em `client/src/logFiles.js` (módulo puro), fonte única para a
tabela e para o `.txt`.

---

## 9. Deploy

Os dois têm `railway.json`. O do Genus acrescenta `healthcheckPath: /api/health` — um
deploy com o volume mal montado **falha no healthcheck** em vez de subir com dados
efêmeros.

O Genus **aposentou o GitHub Pages** (o workflow foi removido): um único serviço Node
serve a API e o `client/dist`.

Dois detalhes que quebram um deploy limpo se esquecidos:

- `npm run build` usa `npm install --include=dev`. O Railway define
  `NODE_ENV=production`, e o `vite` é devDependency do client — sem a flag o build morre
  com `ERR_MODULE_NOT_FOUND`.
- O volume é **obrigatório**: `DATA_DIR=/data` com mount point. Sem ele, contas, logs,
  MMR e fotos somem a cada deploy.

---

## Resumo em uma frase

O Genus Práxis é o All_OS **sem neuro e sem Anthropic**, com escrita de arquivo segura
sob concorrência, avaliação não-streaming, três furos de segurança fechados, CSS
modularizado e uma suíte de testes 2,5× maior validada por mutação — ao custo de algumas
telas menos completas e de rate limiters deliberadamente mais permissivos.
