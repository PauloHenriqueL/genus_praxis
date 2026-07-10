# Genus Práxis — Porte do backend All_OS

## Contexto do projeto
Genus Práxis é um fork "white-label" (estética laranja) do **All_OS**
(`/home/paulo/Documentos/projetos/allos/all_os`). O fork original tinha SÓ o modo
Simulação. Estamos **portando todo o backend do All_OS para cá, exceto o módulo
Neuro** (neuropsicologia).

## Decisões de arquitetura (fechadas com o usuário)
1. **Tipos de personagem do All_OS**: trazer a separação `exercise` / `freeplay`
   do All_OS (o Genus tinha unificado tudo em `characters.json` — vamos substituir
   por `exercises.json` + `freeplay-characters.json`). **Copiar também os pacientes
   já criados** em `all_os/server/data/`.
2. **IA 100% OpenAI**: o All_OS usa Claude (Anthropic) para o paciente; aqui NÃO.
   Todos os avaliadores novos (duelo, progressão) usam o cliente OpenAI que o Genus
   já tem em `server/index.js` (`getOpenAI`, `openaiChat`, `PATIENT_MODEL`, `EVAL_MODEL`).
   NÃO adicionar `@anthropic-ai/sdk` nem `ANTHROPIC_API_KEY`.
3. **NÃO portar Neuro**: nada de `/api/neuro*`, `neuro-characters.json`,
   `neuro-tests.json`, `NeuroEval.jsx`, `AdminNeuro.jsx`, `TestSelector`,
   `TestComparison`. Mas cuidado: gamificação/logs referenciam `type:'neuro'` —
   remover essas referências ao adaptar (achievements `neuro_complete`, missão
   `daily_neuro`, stats `totalNeuro`).

## Diferenças estruturais a preservar do Genus
- Genus tem `withFileLock(file, fn)` — usar em toda escrita de JSON (All_OS não tem).
- Genus é OpenAI. All_OS é Anthropic para o chat. Reescrever chamadas de IA.
- Log do Genus NÃO tem `type` nem `mode` — precisamos ADICIONAR esses campos ao
  portar (LOG_VALID_TYPES = exercise|freeplay; mode = competitive|training).

## Sistemas a portar (do All_OS, menos neuro)
Referência de rotas/funções: ver `all_os/server/index.js` (3001 linhas).

- [x] **0. Base de personagem (BACKEND FEITO)**: exercises + freeplay (CRUD via
      `mountCharacterCrud`), seed data copiada, /api/chat resolve por `type`,
      /api/logs valida `type` (exercise|freeplay) + `mode` (competitive|training)
      e ALIMENTA O MMR. /api/progress/:userId. Foto só em freeplay.
      FALTA o client: FreePlay, SkillMap, AdminExercises, AdminFreeplay,
      EchoSession, Competitive (o client ainda chama /api/characters → QUEBRADO).
- [ ] **1. Gamificação**: ACHIEVEMENT_DEFS, computeStreak, computeDailyMissions,
      computeEarnedAchievements, GET /api/gamification/:userId, POST /api/me/title.
      SEM neuro. Client: Missoes.jsx, stats no Profile.
- [ ] **2. Ranking + MMR**: copiar `server/mmr.js`, GET /api/ranking, GET /api/me/mmr,
      POST /api/admin/ranking/reset. Client: Ranking.jsx, Competitive.jsx.
- [ ] **3. Duelo**: duels.json + TTL, todas /api/duel*, /api/duels/social,
      runComparativeEvaluation (via OpenAI), applyDuelMmr. Client: Duelo, DuelSession,
      DuelAccept, LogsSociais.
- [ ] **4. Progressão**: /api/progression/available-patients, /api/progression/evaluate
      (via OpenAI). Client: Progression, ProgressionChat.
- [ ] **5. Notificações**: notifications.json, GET /api/notifications,
      POST .../read, .../read-all, pushNotification. Client: NotificationBell.
- [ ] **6. Supervisor/Professor**: GET /api/teacher/students, rota /supervisor,
      aba /avaliacao (reasoning só p/ supervisor/admin). Client: Avaliacao.jsx.
- [ ] **7. Visitante**: POST /api/login/visitor, visitorLimiter, exclusões
      (ranking/mmr/notif/duelo), visitorEvaluationEnabled em /api/settings.
- [ ] **8. Extras**: /api/entrevistador-prompt + AdminEntrevistador, /api/profile-photos,
      SystemUpdates + changelog.js, PhotoCropper, testes vitest.

## PROGRESSO (atualizar a cada passo!)

### Feito
- **Sistema 0 — base de personagem (backend)**. Em `server/index.js`:
  - requires: `mmrEngine = require('./mmr')`, prompts `buildExercisePrompt`/`buildFreeplayPrompt`/`wrapCustomEvaluatorPrompt`.
  - bootstrap de `exercises.json`, `freeplay-characters.json`, `progress.json`,
    `achievements.json`, `mmr.json`, `duels.json`, `notifications.json`.
  - `mountCharacterCrud(routePath, file, idPrefix, fields, decorate)` monta
    GET/POST/PUT/DELETE. Montado para `/api/freeplay` (fp) e `/api/exercises` (ex).
  - `decorateFreeplayWithMmr` injeta `difficulty` + `competitiveMatches`.
  - `publicCharacter` esconde specificInstruction/evaluationCriteria/evaluatorPrompt.
  - `PUT /api/freeplay/:id/photo` (só freeplay tem foto).
  - `GET/POST /api/progress/:userId`.
  - `resolveChatPrompt(type,itemId)` e `resolveEvaluationCriteria(type,itemId)`.
  - `LOG_VALID_TYPES=['exercise','freeplay']`, log ganha `type` + `mode`;
    freeplay+competitive+score+não-visitante → `mmrEngine.updateMatch` em mmr.json.
  - `isVisitor(user)` helper. `VALID_SESSION_TYPES=['exercise','freeplay']`.
  - `/api/admin/export` exporta todos os JSONs novos.
  - VERIFICADO: boot ok; 6 freeplay + 3 exercises carregam; aluno não vê gabarito;
    log sem type → 400; log competitivo score 70 → MMR P=50→60.
  - REMOVIDO: todo o CRUD `/api/characters` e `characters.json` (o arquivo antigo
    ainda existe em server/data/ mas não é mais lido).

- **Sistema 1 — gamificação (backend)**. `ACHIEVEMENT_DEFS` (19; o All_OS tem 20 — a
  removida é `neuro_complete`),
  `dayKey`, `computeStreak`, `computeDailyMissions` (3, sem daily_neuro),
  `computeEarnedAchievements` (polivalente = exercise+freeplay no mesmo dia),
  `GET /api/gamification/:userId`, `POST /api/me/title` (revalida posse; 403 se não
  desbloqueado). Log agora grava `difficulty` (resolvida server-side) p/ a conquista
  `all_difficulties`. VERIFICADO.
- **Sistema 2 — ranking + MMR (backend)**. `readMmr`, `titleOf`, `GET /api/ranking`
  (exclui visitante; calibrando vai pro fim), `GET /api/me/mmr`,
  `POST /api/admin/ranking/reset` (zera scores+progress, PRESERVA logs e mmr.json).
  VERIFICADO: 5 partidas → sai da calibração, mmr=65; ranking mostra título.
- **Sistema 5 — notificações (backend)**. `pushNotification` (pula visitante),
  `GET /api/notifications`, `POST /api/notifications/:id/read`, `.../read-all`.
- **Sistema 6 — supervisor (parcial)**. `GET /api/teacher/students`. VERIFICADO.

- **Sistema 3 — duelo (backend)**. `DUEL_TTL_MS` (30d) + `pruneExpiredDuels` (roda no
  boot, em `/api/duels/social` e em `/api/duel/:id/export`),
  `readDuels`, `sanitizeDuelMessages`, `duelIdentity`, `duelSideFor`,
  `isDuelParticipant`, `publicDuel` (cada lado só vê as próprias mensagens até o fim),
  `runComparativeEvaluation` (OpenAI + `avaliador-comparativo-v2.md`; sem key → demo
  50x50), `applyDuelMmr` (via `mmrEngine.processDuel`; training/visitante → unranked),
  `finalizeDuel` (avalia → grava result → MMR → notifica os 2 lados).
  Rotas: GET /api/duel/opponents, POST /api/duel, GET /api/duel/by-token/:token,
  POST /api/duel/by-token/:token/accept, POST /api/duel/:id/accept, GET /api/duel/:id,
  DELETE /api/duel/:id (só antes de aceito), POST /api/duel/:id/submit,
  GET /api/duel/:id/export (texto), GET /api/duels/social (agrupado por oponente).
  VERIFICADO ponta-a-ponta: criar→aceitar→2x submit→completed→notificação→social→export.
  MMR PvP verificado: 2 jogadores fora da calibração, empate → ranked=true, pvpDelta=0.
- **Sistema 4 — progressão (backend)**. GET /api/progression/available-patients
  (dedup por itemId, exige messages.length>0), POST /api/progression/evaluate
  (compara atendimento #1 vs #2, injeta gabarito + feedback anterior, OpenAI +
  `avaliador-progressao-v2.md`). 400 se não houver atendimento anterior. VERIFICADO.
- **Sistema 7 — visitante (backend)**. POST /api/login/visitor + `visitorLimiter`.
  `signToken` embute isVisitor/name; `requireAuth` reconstrói o visitante do token
  (NÃO grava em users.json). Excluído de ranking(403)/duelo(403)/mmr/notificações.
  `visitorEvaluationEnabled` em /api/settings e PUT /api/admin/settings.
  /api/evaluate barra visitante salvo se o admin ligar. VERIFICADO.
- **Sistema 8 — extras (backend)**. GET /api/entrevistador-prompt (lê
  server/entrevistador/promptentrevistador.md), GET /api/profile-photos + static
  `/profiles_icon` (pasta copiada do All_OS, 3 avatares).
- **/api/evaluate**: agora separa `[notas-supervisor]` do texto. Aluno recebe só
  `content` limpo + `score`; supervisor/admin também recebem `criteriaScores` e
  `reasoning` (texto bruto).
- **scoring.js**: adicionado `comparativeScores` (A1..A6/B1..B6 → duas notas + vencedor).
- **Helpers de avaliação**: `parseSupervisorPayload` (regex generalizado p/ aceitar
  chaves A1/B1 além de numéricas), `extractSupervisorNotes`, `transcriptFromMessages`,
  `loadPromptFile`.

## BACKEND COMPLETO ✅ (53 rotas, 0 neuro, 0 Anthropic)

- **Correção pós-porte em `POST /api/logs`**: a rota atualizava o `mmr.json` mas
  DESCARTAVA o resultado — a resposta não trazia o MMR. Agora devolve
  `mmr: { ...playerView(player), delta, characterDifficulty }` quando a partida é
  ranqueada (freeplay + competitive + score numérico + não-visitante); em treino o
  campo fica ausente. O EchoSession lê `saved.mmr` para o card de pós-partida.
  VERIFICADO: 6 partidas seguidas → mmr null durante a calibração (partidas 1-4),
  revelado na 5ª (mmr=66), delta +1/-1 depois; `/api/me/mmr` concorda; a dificuldade
  do personagem cai 50→47 conforme o jogador vence.

## FRONTEND COMPLETO ✅ (porte do All_OS, menos neuro)

`vite build` passa (85 módulos) e o servidor sobe servindo o front. Grep confirma:
0 referências a `/api/characters`, 0 neuro, 0 Anthropic, 0 streaming residual.
Os 53 métodos `api.*` usados existem em `api.js` **e** em `demo.js`.

### Feito
- **`api.js`**: +40 métodos (duelo, progressão, notificações, gamificação, ranking,
  MMR, exercícios, freeplay, progresso, título, visitante, entrevistador, fotos).
  `getCharacters/…/setCharacterPhoto` → `getFreeplay/…/setFreeplayPhoto`.
  ⚠ `evaluate` NÃO é stream aqui (o All_OS usava SSE): é
  `await api.evaluate(msgs, ctx)` → `{ role, content, score }` (+ `criteriaScores`
  e `reasoning` só para supervisor/admin). Não existe `adminEntrevistadorChat`.
- **`demo.js`**: sincronizado com a api real (modo demonstração mantido "essencial" —
  Simulação funciona; duelo/ranking/progressão devolvem vazio ou erro amigável).
- **`App.jsx`**: reescrito. Todas as rotas + menu completo por papel, `NotificationBell`
  + `SystemUpdates` na topbar, streak no avatar, `defaultRoute` (professor → /supervisor).
- **`icons.jsx`**: +9 ícones (skill, trophy, duel, progression, flame, social,
  supervisor, evaluate, admin).
- **Páginas criadas**: FreePlay, Competitive, SkillMap, EchoSession, Duelo, DuelSession,
  DuelAccept, LogsSociais, Progression, Missoes, Ranking, Avaliacao, AdminExercises,
  AdminFreeplay, AdminEntrevistador.
- **Páginas reescritas/adaptadas**: `ChatSession.jsx` (agora é a sessão de EXERCÍCIO,
  `/chat/exercise/:id`), `Logs.jsx` (estendida: selos e filtros de `type`/`mode`/
  `difficulty`; serve `/logs` e `/supervisor`), `Home.jsx` (CTA → `/freeplay`).
- **Páginas DELETADAS**: `Simulacao.jsx` (→ FreePlay), `AdminCharacters.jsx` (→ AdminFreeplay).
- **Componentes criados**: NotificationBell, SystemUpdates (+`changelog.js` reescrito
  para o Genus), PhotoCropper, CriteriaTable, ProgressionChat.
- **`utils/skills.js`**: `SKILL_NAMES` + `SKILL_COLORS` (5 competências: Hermenêutica,
  Estrutura, Empatia, Especificidade do caso, Eu — fiéis ao `prompts.js` do All_OS).
  **É a fonte única**: SkillMap, ChatSession e AdminExercises importam daqui.
  NÃO portamos o `prompts.js` do All_OS — era lógica de parsing de notas, que aqui vive
  no servidor (`server/prompts.js` → `SKILL_CRITERIA`).

### Convenções do frontend (IMPORTANTES)
- **CSS**: `index.css` só tem o tema base. Cada página/componente portado tem o seu
  `client/src/styles/<Nome>.css`, importado pelo `.jsx`. **Todas** as classes novas de
  nome genérico (`.active`, `.win`, `.assistant`, `.pending`…) estão **escopadas** sob um
  wrapper (`.duel-page`, `.session-page`, `.skill-map-page`, `.progression-page`,
  `.avaliacao-page`, `.ranking-page`, `.missoes-page`, `.admin-page`).
  Verificado: 0 seletores globais genéricos. Ao adicionar CSS, siga essa regra.
- **Modo competitivo** trafega por query string: `/chat/freeplay/:id?mode=competitive`.
  O EchoSession lê e manda `mode:'competitive'` no `saveLog`; sem a query → `training`.
- `saveLog` EXIGE `type` (`exercise`|`freeplay`); `difficulty` é resolvida server-side.
- Toda URL de foto vinda do backend passa por `assetUrl()`.

## ENTREVISTADOR + BLOCO 1/2 + CRIAÇÃO DE PERSONAGEM ✅

Portado com a extração **no servidor** (no All_OS era regex no cliente).

- **`server/entrevistador/blocos.js`** (novo): `extractBloco2` (seção `## [I. CONTENÇÃO]`
  em diante → a persona), `extractBloco1` (seções `[II]`..`[V]` → o gabarito),
  `extractMeta` (nome/idade/descrição) e `extractBlocos` → `{ ready, bloco1, bloco2, meta }`.
  Aceita o formato novo e o antigo (`BLOCO 2 — PROMPT PARA O SIMULADOR`).
- **`POST /api/chat`** agora aceita `mode:'entrevistador'` (admin-only, `ENTREVISTADOR_MODEL`,
  teto de 16k tokens). Rejeita `systemPrompt` no body com 400.
- **`POST /api/entrevistador/extract`** (admin): parsing puro, sem IA.
- **`POST /api/entrevistador/character`** (admin): cria o personagem de Simulação.
  **Bloco 2 → `specificInstruction`; Bloco 1 → `evaluationCriteria`** (o gabarito que o
  `/api/evaluate` já injeta). 422 se o prompt ainda não foi gerado.
- Client: `AdminEntrevistador.jsx` virou o chat completo (voz via Whisper, baixar conversa,
  baixar prompt, ver prompt do agente, modal de criação com os dois blocos editáveis).
  `api.js`: `entrevistadorChat`, `extractBlocos`, `createCharacterFromInterview`.
- VERIFICADO com OpenAI real: entrevista de 4 turnos → o agente recusou material raso
  3x (comportamento correto do prompt) e só então gerou o prompt de 10.868 chars →
  extract devolveu bloco2=10.673, bloco1=8.329, meta={Marta, 41} → personagem criado →
  o aluno conversou com ela e a Marta chegou "10 minutos adiantada", disse "não sei se
  isso aqui costuma funcionar" e usou os tiques "né?"/"mas enfim" definidos na entrevista.
  O aluno NÃO vê `specificInstruction` nem `evaluationCriteria`.

## AUDITORIA All_OS × Genus — BUGS ENCONTRADOS E CORRIGIDOS

Comparação sistemática dos dois backends/frontends. `mmr.js` é byte-idêntico ao
All_OS; `scoring.js`, `SKILL_CRITERIA`, `SKILL_NAMES` e os 4 prompts `.md` também.
Os 4 bugs abaixo foram REPRODUZIDOS antes de corrigir e VERIFICADOS depois.

1. **🔴 O avaliador nunca funcionou.** `loadEvaluatorPrompt` procurava
   `avaliacao/avaliador.md`, que não existe — o All_OS carrega `avaliador-v16-2.md`.
   Ligar o toggle na tela de Contas e finalizar uma sessão dava **500**.
   Corrigido: `EVALUATOR_PROMPT_FILES = ['avaliador.md', 'avaliador-v16-2.md']`
   (o 1º é override opcional). VERIFICADO: avaliação real rodou, score 53 derivado
   dos 6 critérios; o texto do modelo diz "Nota: 63/100" e é ignorado — a nota é
   calculada em código (`scoring.js`), como manda o design.

2. **🔴 O duelo nunca completava.** `parseSupervisorPayload` exigia UM par por linha
   (regex ancorado `^...$`), mas o avaliador comparativo emite os seis de uma vez
   (`A1: 4  A2: 4  A3: 4 …`) e às vezes envolve o bloco numa cerca ```` ``` ````.
   → `criteria` = null → `comp` = null → o duelo parava em `status:'pending'`
   **para sempre, sem erro no log**. (Bug HERDADO do All_OS — lá também quebra.)
   Corrigido: o parser varre pares em qualquer posição; `extractSupervisorNotes`
   agora também remove a cerca que abre ANTES do marcador (senão sobrava um ```
   órfão no fim do feedback do aluno). VERIFICADO com duelo real ponta a ponta:
   `status: completed`.

3. **🔴 Vazamento do gabarito de notas para o aluno.** `POST /api/logs` gravava
   `body.evaluation` cru; o All_OS chama `extractSupervisorNotes` como rede de
   segurança. Sem ela, o bloco `[notas-supervisor]` ficava salvo em texto puro e
   voltava ao próprio aluno em `GET /api/logs` (que só esconde o campo
   `criteriaScores`). Efeito colateral: `score` não era derivado → **o Competitivo
   não alimentava o MMR**. Corrigido e VERIFICADO: bloco removido, `score=75`
   derivado, MMR dispara, aluno não vê `criteriaScores`, admin vê.

4. **🟠 `applyDuelMmr` gravava o estado interno do engine.** Fazia
   `return { ranked: true, ...out }`, despejando `playerA/playerB/character/pvp/
   resultA/resultB` (com a janela `W` e o `history` do personagem) dentro de
   `duels.json`. O client lê `r.mmr.challenger.after` / `.delta` — que **não
   existiam** → o card pós-duelo renderizava `undefined`. Corrigido para o mesmo
   shape enxuto do All_OS (`{before, after, delta, pvpDelta}` + `characterDifficulty`).
   VERIFICADO em duelo real: `after=55, delta=-8.6, pvpDelta=-1.6`.

### Divergências que NÃO são bugs (o Genus é melhor)
`withFileLock` em toda escrita; `finalizeDuel` em background com retry; `difficulty`
do log resolvida server-side; `criteriaScores`/`reasoning` só p/ supervisor+admin;
`GET /api/logs` deny-by-default; ranking já ordenado no servidor; parser aceita
chaves `A1/B1`; `publicDuel` devolve `myMessages` sem vazar o oponente.

## CORREÇÕES DE SEGURANÇA — regressões DO PORTE, já corrigidas

⚠ As três proteções abaixo **existiam e funcionavam no All_OS**. Foram perdidas ao portar
e restauradas depois. Não são bugs do All_OS.

1. **Visitante lia os logs de todos os usuários.** `GET /api/logs` passou a filtrar só
   `role === 'therapist'`; o visitante caía no `else` e recebia `logs.json` inteiro.
   (O All_OS tratava `therapist || visitor`.) Agora é deny-by-default: quem não é
   `canSeeAllLogs` só vê os próprios.
2. **Professor via os logs de TODOS os alunos**, não só os vinculados a ele — e podia
   passar qualquer `?userId=`. (O All_OS já usava `canAccessUserResource`.) Agora
   respeita `canAccessUser`.
3. **`GET /api/entrevistador-prompt` ficou aberto** a qualquer usuário autenticado
   (aluno e visitante baixavam os 46KB de IP da Allos). No All_OS sempre foi
   `requireRole('admin')`. Restaurado.

### AS 3 FUNCIONALIDADES ÓRFÃS — LIGADAS ✅
Os 3 métodos que existiam em `api.js` com 0 chamadores agora têm UI e foram
verificados contra o servidor real:

1. **Login · "Entrar como visitante"** (`api.loginVisitor`). Botão abaixo do form,
   com divisor "ou" e nota explicativa. Escondido no modo demonstração (lá a rota
   não existe). VERIFICADO: id efêmero (`visitor-<hex>`), NÃO grava em users.json,
   403 em título/ranking, 200 em freeplay.
   - Bônus: `Profile.jsx` agora **barra o visitante** com um aviso. Antes a rota
     `/perfil` era alcançável e salvar dava um 404 "Usuário não encontrado" (o
     visitante não existe em users.json).
2. **Profile · seletor de título + galeria de avatares + conquistas + streak**
   (`api.setMyTitle`, `api.getProfilePhotos`, `api.getGamification`).
   `App.jsx` também ganhou o chip de título na sidebar.
   - ⚠ Armadilha: ao limpar o título o servidor **omite** a chave `activeTitle`
     (faz `delete`), então `onUpdate({...user, ...updated})` manteria o valor
     antigo e o selo ficaria preso. Por isso normalizamos: `activeTitle: updated.activeTitle || ''`.
   - O usuário guarda só o **id** do título; o rótulo e o tier são resolvidos a
     partir de `/api/gamification` (mesma chamada que já traz o streak).
   - `PUT /api/users/:id` não aceita `activeTitle` (allowlist `name/email/profilePhoto`),
     então só dá para mudar via `/api/me/title`, que revalida a posse. Seguro.
   - VERIFICADO: 5 títulos desbloqueados → seleciona "polivalente" → `/api/me` traz
     o id no boot → sidebar mostra "Versatilidade" (tier-gold) → ranking mostra o
     mesmo → limpar remove a chave.
3. **AdminUsers · toggle `visitorEvaluationEnabled`.** Segundo card de configuração,
   que avisa quando não tem efeito (avaliação automática desligada).
   VERIFICADO: com o toggle OFF o visitante recebe `{disabled:true}`; com ON recebe
   avaliação real da IA. `PUT /api/admin/settings` faz merge por chave — ligar um
   não desliga o outro.

### O que ainda falta do All_OS no client (menor)
Profile perdeu o `PhotoCropper` (usa crop central automático), o campo de gênero e
os opt-ins de e-mail; ChatSession perdeu o botão "Log" (.txt no cabeçalho);
Logs não renderiza o `CriteriaTable` nem inclui `criteriaScores` no .txt exportado;
NotificationBell não mostra o delta de MMR (o backend também não o envia).

## SUÍTE DE TESTES ✅ — 575 testes, 24 arquivos

`npm test` (vitest + supertest). `npm run test:watch` para desenvolver.

### Harness (`tests/helpers.js`) — leia antes de escrever teste
Deve ser o **primeiro require** de todo arquivo de teste: ele seta as envs ANTES do
`require('../server/index.js')` (que resolve `DATA_DIR` e valida `JWT_SECRET` no boot).
- `DATA_DIR` = tmpdir por processo → **nunca toca `server/data/`**.
- `OPENAI_API_KEY=''` → o servidor entra em modo demonstração. **Nenhum teste chama a
  OpenAI de verdade.** (dotenv não sobrescreve env já definida, então o `''` vence.)
- `NODE_ENV=test` → rate limiters desligados.
- `resetData()` no `beforeEach` repopula fixtures determinísticas (6 usuários cobrindo
  os 4 papéis + 2 professores distintos; 3 exercícios; 2 pacientes).
- `SECRETS` = marcadores de gabarito/prompt. **Regra de ouro**: nenhuma resposta a
  aluno/visitante pode conter qualquer valor de `SECRETS`.
- `tests/harness.test.js` testa o próprio harness (tmpdir isolado, sem chave de IA,
  limiters off, `require.main` guard). Se ele falhar, a suíte inteira está mentindo.

### Cobertura
`security` (76) · `gamification` (44) · `entrevistador` (42) · `mmr` (40) · `duel` (36)
`crud` (32) · `chat` (23) · `logs` (23) · `mmr-pvp` (23) · `auth` (22) · `scoring` (21)
`settings` (20) · `progression` (16) · `notifications` (14) · `ranking` (12)
`sessions` (12) · `evaluator-notes` (11) · `duel-notification` (11) · `custom-evaluator` (19)
`log-export` (24) · `skill-id` (19) · `crop-math` (20) · `prompt-files` (6) · `harness` (5)

### A suíte foi validada por MUTAÇÃO (não basta passar — tem que pegar bug)
Reintroduzi cada um dos 6 bugs reais no `server/index.js` e confirmei que a suíte falha:

| bug reintroduzido | pego por |
|---|---|
| `GET /api/logs` sem deny-by-default (visitante lê tudo) | security (3 falhas) |
| `PUT /api/users/:id` sem allowlist (aluno vira admin) | security (3 falhas) |
| `POST /api/logs` grava `[notas-supervisor]` cru | evaluator-notes (9 falhas) |
| `applyDuelMmr` vaza estado interno do engine | duel (1 falha) |
| parser exige 1 par por linha (duelo trava em `pending`) | evaluator-notes (1 falha) |
| `/api/chat` aceita `systemPrompt` (prompt injection) | chat + security (5 falhas) |
| `publicCharacter` vaza o gabarito | security (5 falhas) |
| `skillId` vem do cliente (All_OS) | skill-id (7 falhas) |
| `normalizeSkillId` ingênuo (`null` → competência 0) | skill-id (8 falhas) |
| notificação de duelo sem o guard `ranked` (quebra em treino) | duel-notification (3 falhas) |
| notificação manda `pvpDelta` (diverge do card) | duel-notification (2 falhas) |
| `rescaleForStage` vira no-op (recorte muda ao girar o celular) | crop-math (3 falhas) |
| `fitStage` fixo em 280px (estoura o celular) | crop-math (2 falhas) |
| `canReopenInCropper` aceita path da galeria (tinge o canvas) | crop-math (2 falhas) |
| gate do botão "Log" = `messages.length > 0` | log-export (2 falhas) |

### Como testar lógica do client sem jsdom
A suíte roda em `environment: 'node'` e não tem jsdom nem testing-library. Um `.jsx`
importa CSS e React, então não dá `require()` nele. A saída foi extrair a lógica pura
para módulos sem React/CSS, que os `.jsx` consomem:

- **`client/src/cropMath.js`** — `fitStage`, `baseScale`, `rescaleForStage`, `cropRect`,
  `canReopenInCropper`. O `<PhotoCropper>` virou só a casca de eventos e canvas.
- **`client/src/logFiles.js`** — ganhou `realMessages`/`hasTranscript`, o gate do botão
  "Log". Antes cada tela tinha seu predicado inline; podiam divergir (o EchoSession
  precisa filtrar também os marcadores `type: 'session-break'`). Agora é um só.

Regra: se a lógica merece teste, ela não deve morar no `.jsx`.

**Buraco encontrado e fechado**: o bug do `avaliador.md` (avaliador quebrado) NÃO era
pego por teste de HTTP — com `OPENAI_API_KEY=''` a rota `/api/evaluate` responde
`disabled`/503 **antes** de chamar `loadEvaluatorPrompt()`. Criei
`tests/prompt-files.test.js`, que verifica no código-fonte + no disco que todo
`loadPromptFile('x.md')` e todo candidato de `EVALUATOR_PROMPT_FILES` resolve para um
arquivo existente e não-vazio. Ele também trava `server/seed/` e a ausência de
Anthropic/neuro. Ao reintroduzir o bug, ele falha com a mensagem certa.

### Comportamentos reais documentados nos testes (contra-intuitivos, não são bugs)
- `/api/evaluate` **não tem fallback de demo**: sem `OPENAI_API_KEY` responde **503**
  (o texto de demonstração só existe em `/api/chat`, no duelo e na progressão).
- `resolveChatPrompt`: qualquer `type` != `'exercise'` cai no ramo freeplay.
- Em modo demo, a validação de "turnos válidos" roda DEPOIS do gate do OpenAI.
- `pruneExpiredDuels` roda no boot **e** em `GET /api/duels/social` e
  `GET /api/duel/:id/export` (como no All_OS). NÃO roda em `GET /api/duel/:id`: é a rota
  de polling do DuelSession, e o prune escreve sem `withFileLock` — atropelaria o
  `finalizeDuel`. Há teste travando isso nos dois sentidos.
- Visitante em partida competitiva: a chave `mmr` fica **ausente**, não `null`.

## RESPONSIVIDADE (celular / telas pequenas) — auditado e corrigido

Já estava bom: viewport correta (`viewport-fit=cover`, sem `user-scalable=no`),
sidebar→drawer, todos os grids `auto-fit/minmax`, as 4 tabelas com `overflow:auto`,
SVG do SkillMap com `viewBox`, `.main-content` com `max-width:1180px`.

Corrigido:
- **`100vh` → `100dvh`** (com `@supports` como fallback) em `.chat-container` (desktop
  e mobile), `.sidebar` (drawer) e `.entrevistador-chat`. Com `vh`, o campo de digitação
  do chat some atrás do teclado virtual no iOS/Android.
- **Drawer no mobile herdava `height:100vh`** sem `overflow-y` → o bloco de perfil/sair
  ficava inalcançável. Agora `100dvh` + `overflow-y:auto`.
- **`input/select/textarea` com `font-size:14.5px`** → o iOS dá zoom automático ao focar
  campo com fonte < 16px. Agora `16px` abaixo de 820px.
- **`.mono-area` (prompt do entrevistador) tinha `white-space:pre`** → empurrava a página
  inteira para fora da tela. Agora `pre-wrap` + `word-break`.
- **`.topbar-actions` (sino/updates) recuava só abaixo de 640px**, mas a `.mobile-topbar`
  entra em **820px** — entre 641 e 820px o sino ficava por cima do avatar. Breakpoints
  alinhados em 820px, nos dois arquivos.
- **Alvos de toque < 44px** (WCAG/Apple HIG): hamburger (~28px), sino e updates (38px)
  → todos em 44px.
- `img { max-width: 100% }` global como rede de segurança.
- `.duel-scoreline` ganhou `flex-wrap` e o nome do jogador, truncamento.

Pendente (baixo): `.title-chip` (~34px) e `.btn-sm` (~30px) seguem abaixo de 44px;
`Admin/Duelo/Missoes/Ranking/Session/Profile/...` não têm media query própria (na
prática o flex-wrap resolve, mas não foi testado em device real).

## AVALIADOR CUSTOMIZADO POR EXERCÍCIO ✅ (religado)

**Era uma regressão de funcionalidade.** No All_OS, um exercício com `evaluatorPrompt`
usa aquele prompt como avaliador. No porte isso ficou desligado: `/api/evaluate` sempre
usava o avaliador global e o `evaluatorPrompt` era silenciosamente reaproveitado como
*gabarito* injetado na mensagem — enquanto a tela AdminExercises exibia a coluna
"Avaliador: **customizado**". Os 3 exercícios reais começam com "Você é um avaliador
especializado…": são system prompts, não gabaritos.

- `resolveEvaluatorPrompt(context)` → `{systemPrompt, custom}`. Exercício com
  `evaluatorPrompt` usa `wrapCustomEvaluatorPrompt(...)`; o resto usa o global.
- `resolveEvaluationCriteria('exercise')` agora devolve `''` — exercício não tem gabarito.
- `buildDirectEvaluationPrompt` foi **removido** (código morto: quem monta o
  `[LOG DO ATENDIMENTO]` é o cliente, em `buildEvaluationMessage`).

### ⚠ A escala da nota: por que `[NOTA:X]` e não o bloco de critérios
Cada avaliador customizado traz a PRÓPRIA escala — os 3 reais usam **"5 eixos de 0 a 2
pontos (máx. 10)"**. Mas `finalScoreFromCriteria` assume `base = nº critérios × 10`.
Forçar o bloco `[notas-supervisor]` distorcia tudo: testei ao vivo e **a mesma sessão
valia 7 numa escala e 40 na outra**.
Solução (a do All_OS): o wrapper pede `[NOTA:X]` — a IA devolve a nota final já na escala
que o próprio prompt definiu. `extractFinalScore()` remove o marcador do texto do aluno e
usa o valor. Avaliador customizado **não** produz `criteriaScores` (não há critérios).
`POST /api/logs` também remove um `[NOTA:X]` que sobre no texto (rede de segurança).

VERIFICADO ao vivo com o avaliador real do exercício "A boca fala uma coisa, o corpo
outra": nota 3–5 (o prompt diz "a média é 5"), marcador não vaza, sem `criteriaScores`,
`reasoning` só para admin. Freeplay segue no avaliador global + gabarito, nota 0–100.

**Consequência conhecida (igual no All_OS)**: as escalas convivem — exercício 0–10,
freeplay 0–100. O `ScoreBadge` clampa em 0–100, então um 7 de exercício aparece como
nota baixa (vermelha); e a conquista `high_score` (`score >= 25`) é inalcançável por
exercício. O All_OS tem exatamente o mesmo problema (trilha era −9..+9) e o comentário
do `ScoreBadge` dele assume: "a coloração fica aproximada, mas o badge não quebra".
O MMR não é afetado (só olha freeplay).

## DECISÕES FECHADAS (não reabrir sem motivo)
- `loginLimiter` fica em **20/15min** e `visitorLimiter` em **30/60min** (mais frouxos
  que o All_OS). Motivo: uma turma inteira atrás do mesmo NAT compartilha o IP, e o
  visitante não gasta IA por padrão. Decidido pelo usuário.
- `ADMIN_INITIAL_PASSWORD` fica com mínimo **8** e com fallback para as contas de
  demonstração quando ausente. Decidido pelo usuário.

### Pendências conhecidas (nada bloqueia o build)
1. **Nada foi testado em navegador real.** A verificação é `npm test` (575),
   `vite build`, boot do servidor e curl (incluindo chamadas reais à OpenAI). As
   correções de responsividade foram feitas por leitura de CSS — **precisam de
   validação num celular de verdade** (o usuário vai testar).
2. **A casca React não é testada.** Os testes cobrem a lógica pura (`cropMath`,
   `logFiles`) e o backend. O que NÃO é exercitado: renderização, o `useEffect` de
   `resize` do cropper, o `ctx.drawImage`/`toDataURL` do canvas, e o clique nos botões.
   Precisaria de jsdom + testing-library.
3. Os testes NÃO cobrem rate limiters (desligados em `NODE_ENV=test`).
4. `demo.js` cobre só a Simulação; as abas sociais aparecem vazias.
5. Do All_OS ainda falta no client: campo de gênero e opt-ins de e-mail no Profile
   (são decisões de produto, não porte).

### Botão "Log" no cabeçalho ✅ (feito)
Baixa o `.txt` da sessão sem precisar finalizar. Adicionado ao `ChatSession` (como no
All_OS) **e ao `EchoSession`** — o All_OS só tem no ChatSession, o que parece esquecimento:
a Simulação é justamente onde a sessão é longa (multi-sessão, time-skip).

Reusa os builders que já existiam (`bothText`) e o `downloadText` do `logFiles.js`.
Meio da sessão não tem avaliação, e `evalSection('')` devolve `''` — então o `.txt` sai só
com o log, sem seção "AVALIAÇÃO" vazia.

Gate `hasTranscript`: a mensagem de kickoff é `isSystem`, e no EchoSession os marcadores de
troca de sessão têm `type`. Nenhum dos dois habilita o botão (verificado nos 5 casos).
VERIFICADO: o `.txt` gerado exclui o kickoff, preserva os destaques ★ e os comentários.

## CAPACIDADE — medido, não estimado (2026-07-09)

Teste de carga real, 30 alunos simultâneos, OpenAI de verdade:

| cenário | resultado |
|---|---|
| 30 logins simultâneos (mesmo IP) | **10 de 30 recebem 429** ❌ |
| 30 alunos já logados × 3 turnos (90 chats) | 90/90 OK, 0 erros ✅ |
| latência do chat | p50 **2,5 s** · p90 3,4 s · p99 6,8 s |
| erros no servidor | 0 |

**O gargalo NÃO é o app.** É o `loginLimiter`: 20 req/15 min **por IP**, sem
`keyGenerator`. Uma turma atrás de um NAT compartilha o IP — o 21º aluno a logar leva
`429 "Muitas tentativas"`. O `aiLimiter` e o `writeLimiter` usam `userKey` (por usuário) e
não têm esse problema; o `visitorLimiter` (30/60min por IP) tem o mesmo risco em escala menor.
Correção: `keyGenerator` por `username` (ou subir o `max`). Ver "Antes de subir".

**Escrita de arquivo é síncrona** (`readFileSync`/`writeFileSync`) e reescreve o JSON
inteiro. Medido: `logs.json` de 14 MB → ~147 ms de event loop BLOQUEADO por
`POST /api/logs`. Com o TTL de 30 dias, 30 alunos × 5 sessões/semana ≈ 14 MB. Aguenta,
mas é o próximo teto (≈100 alunos ou logs longos). O autosave de `active-sessions.json`
custa só 5–17 ms — não é problema.

**⚠ NUNCA escalar para 2+ réplicas no Railway.** O `withFileLock` é um mutex em memória
(`new Map()`), por processo. Provado com 2 processos escrevendo em paralelo:
**194 de 400 escritas perdidas**. Migrar para SQLite/Postgres antes de escalar horizontalmente.

## ⚠ `all_os` É SOMENTE LEITURA
`/home/paulo/Documentos/projetos/allos/all_os` é a **referência**. Nunca editar nada lá —
só ler para comparar. Toda mudança vai em `genus_praxis/`.

### Cropper de foto no Profile ✅ (feito)
O `<PhotoCropper>` **não era usado em lugar nenhum** — foi portado e nunca ligado
(o AdminFreeplay usa o `<PhotoPicker>`, recorte central). Agora serve a foto de perfil:
botão "Trocar foto" → modal com arrastar + zoom → `onCrop(dataUrl)` → JPEG 320×320.
A foto só vai ao servidor no "Salvar perfil".

Como nada consumia o `{iconDataUrl, fullDataUrl}` antigo, voltei o `onCrop(dataUrl)` do
All_OS e removi o `buildFullCanvas` (código morto). O `<PhotoPicker>` do AdminFreeplay
segue intocado — ele precisa do `full` para `api.setFreeplayPhoto`.

⚠ Duas armadilhas resolvidas (ambas ausentes no All_OS):
- **`STAGE_SIZE` fixo em 280px estoura um celular de 320px** (o modal come 92px de
  padding). Virou `stageSize` em estado, calculado no mount e no `resize`. Ao mudar,
  `scale` e `offset` são reescalados pelo mesmo fator — senão o recorte salvo sairia
  diferente do enquadrado. O tamanho anterior vive num `useRef`, não no updater do
  `setState` (o StrictMode chama o updater duas vezes e dobraria o fator).
- **`initialImage` só recebe data URL.** O avatar da galeria vem de `/profiles_icon`
  sem `Access-Control-Allow-Origin`; com `VITE_API_BASE` ele tingiria o canvas e o
  `toDataURL()` lançaria `SecurityError`. Nesse caso o cropper abre vazio.

VERIFICADO: geometria do recorte (paisagem e retrato preenchem o quadrado, centralizados),
rescale no resize preserva o recorte exato, e o round-trip dataURL → `PUT /api/users/:id`
→ `users.json` → `/api/me`.

### Delta de MMR na notificação ✅ (feito)
`finalizeDuel` agora envia `mmrDelta` na notificação `duel_result`, e o sino o exibe
(`.notif-mmr`, verde/vermelho). `mmrInfo` já estava em escopo — só faltava passar.

Usa o **`delta`** (solo + PvP), não o `pvpDelta`: é o mesmo número que o card pós-duelo
(`DuelSession`) mostra, senão o sino e a tela exibiriam valores diferentes para a mesma
partida. Guarda `rankedMmr = mmrInfo.ranked ? mmrInfo : null` — quando não é ranqueado
(`training`/`visitor`/`calibrating`) não existem as chaves `challenger`/`opponent`,
e `mmrDelta` vai `null` (o sino não renderiza a linha).

VERIFICADO ao vivo nos 3 casos: ranqueado (`-5.5` no sino == `-5.5` no card),
`training` → null, `calibrating` → null. Também corrigi o `demo.js`, que devolvia `[]`
em vez de `{items, unread}`.

### `skillId` no log ✅ (feito)
`POST /api/logs` grava a competência do exercício, **resolvida server-side** a partir do
`exercises.json` (mesma leitura que já resolvia `difficulty`). O cliente não decide: um
`body.skillId: 99` é ignorado — o All_OS gravaria o 99.

`normalizeSkillId()` rejeita `null`/`''`/`[]`/`0`/decimais, que um
`Number.isFinite(Number(v))` ingênuo viraria a **competência 0** (não existe; são 1..5).
Freeplay sempre grava `null`.

Client: selo de competência nos Logs (`<SkillBadge>`, `.log-skill-badge`) e a linha
`Competência: <nome>` no cabeçalho do `.txt` exportado. VERIFICADO ao vivo nos 3
exercícios reais (skillId 2, 1, 4) e com exercícios de `skillId` nulo/vazio.

### `CriteriaTable` nos Logs ✅ (feito)
Professor/admin agora veem as notas por critério ao abrir um log, e o bloco
"NOTAS POR CRITÉRIO" entra no `.txt` exportado. A aba "Avaliação" abre quando há texto
**ou** critérios (antes exigia texto).

Rótulos, ordenação e o bloco do `.txt` moram em `client/src/logFiles.js` — módulo puro,
sem React/CSS, por isso testável no ambiente node da suíte (`tests/log-export.test.js`).
A `<CriteriaTable>` consome de lá; fonte única.

⚠ Bug corrigido no caminho (o All_OS ainda tem): o filtro era
`Number.isFinite(Number(v))`, mas `Number(null)`/`Number('')`/`Number([])` valem **0** —
um critério ausente virava um **"0/10" inventado**. Agora só passa número real ou string
numérica. Há teste travando os dois lados: `null` é descartado, `0` legítimo é preservado.

### Decidido: NÃO corrigir o ScoreBadge
Exercício dá nota 0–10; freeplay/duelo/progressão, 0–100. O badge clampa em 0–100, então
**toda nota de exercício aparece vermelha ("Erro"), até um 10/10**. O All_OS tem o mesmo
defeito e a regra do projeto é não divergir dele. Decidido pelo usuário — não "conserte"
sem nova decisão. Detalhes em `DIFERENCAS.md` §5.

## DEPLOY — Railway (GitHub Pages aposentado)

O front NÃO é mais publicado separado. Um serviço Node roda o Express, que serve a API
**e** o `client/dist`. `.github/workflows/pages.yml` foi REMOVIDO.

- **`railway.json`** (novo): build `npm run build`, start `npm start`,
  healthcheck `/api/health`.
- **`GET /api/health`** (novo, sem auth): `{ ok, uptime, dataDir, dataWritable, openai,
  evaluator }`. Responde **503 se o volume não estiver gravável** — assim um deploy sem
  volume falha no healthcheck em vez de subir com dados efêmeros.
- **`server/seed/`** (novo, VERSIONADO): `freeplay-characters.json` + `exercises.json`.
  `server/data/*.json` está no `.gitignore` (hashes de senha), então sem esse diretório
  um deploy limpo subiria **sem pacientes e sem exercícios**. No primeiro boot o servidor
  copia `server/seed/` → `DATA_DIR`, **sem nunca sobrescrever** arquivo existente.
- **`npm run build` agora usa `npm install --include=dev`**. O Railway define
  `NODE_ENV=production`, e o `vite` é devDependency do client — sem a flag o build
  quebrava com `ERR_MODULE_NOT_FOUND`. O `postinstall` duplicado foi removido.

### Armadilha corrigida (grave)
O seeding inicial copiava `server/data/` inteiro para o volume, **incluindo o
`users.json` de desenvolvimento**. Como o bootstrap só cria o admin
`if (!existsSync(DATA_DIR/users.json))`, a presença do arquivo fazia o
`ADMIN_INITIAL_PASSWORD` ser ignorado — o deploy subiria com `admin/admin123`.
Agora **só `server/seed/` é semeado**. VERIFICADO num volume vazio: cria só o admin
seguro, `admin123` dá 401 e a senha real dá 200.

### Setup no Railway
1. Deploy from GitHub repo (usa o `railway.json`).
2. **Volume** com mount path `/data` + variável `DATA_DIR=/data` (obrigatório).
3. Variáveis: `JWT_SECRET`, `ADMIN_INITIAL_PASSWORD`, `OPENAI_API_KEY`.
   **Não** defina `PORT` (o Railway injeta).
4. **Commite os prompts**: `server/entrevistador/promptentrevistador.md` e
   `server/avaliacao/*.md` estão untracked. Sem eles o entrevistador e os avaliadores
   de duelo/progressão falham em produção.

## Como rodar
`npm install` → `cp .env.example .env` (gerar JWT_SECRET) → `npm run dev`
(server :3001 + vite :5173). Contas dev: admin/admin123, supervisor/supervisor123,
aluno/aluno123.
