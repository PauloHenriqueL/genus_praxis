// IMPORTANTE: helpers seta as envs antes de importar o app — manter como 1º require.
const {
  app, request, resetData, writeData, readData,
  loginAs, loginVisitor, authHeader, makeLog, DATA_DIR,
} = require('./helpers');
const fs = require('fs');
const path = require('path');

function seedMmr(players) {
  fs.writeFileSync(path.join(DATA_DIR, 'mmr.json'), JSON.stringify({ players, characters: {} }, null, 2));
}

// No modo demonstração (OPENAI_API_KEY=''), runComparativeEvaluation devolve um
// empate determinístico 50x50, o que torna o duelo testável ponta a ponta.
// finalizeDuel roda em BACKGROUND após o 2º submit — a resposta ao 2º submit já
// costuma vir com status 'completed', mas onde há dúvida fazemos polling.
async function waitCompleted(token, duelId, { tries = 40, delay = 15 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await request(app).get(`/api/duel/${duelId}`).set(authHeader(token));
    if (r.body && r.body.status === 'completed') return r;
    await new Promise((res) => setTimeout(res, delay));
  }
  return request(app).get(`/api/duel/${duelId}`).set(authHeader(token));
}

const CHAR = 'fp-test-1';
const msgsA = [
  { role: 'user', content: 'MENSAGEM_SECRETA_DO_A_1234' },
  { role: 'assistant', content: 'Resposta do paciente para A' },
];
const msgsB = [
  { role: 'user', content: 'MENSAGEM_SECRETA_DO_B_5678' },
  { role: 'assistant', content: 'Resposta do paciente para B' },
];

async function fullDuel({ mode } = {}) {
  const aluno = await loginAs('aluno');
  const aluno2 = await loginAs('aluno2');
  const create = await request(app).post('/api/duel').set(authHeader(aluno))
    .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system', mode });
  const duelId = create.body.id;
  await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));
  await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgsA, durationSeconds: 120 });
  const sub2 = await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno2)).send({ messages: msgsB, durationSeconds: 90 });
  return { aluno, aluno2, duelId, sub2 };
}

describe('duelos', () => {
  beforeEach(() => resetData());

  // -------------------------------------------------------------------
  describe('criação', () => {
    it('cria duelo por convite in-app com status pending e campos esperados', async () => {
      const aluno = await loginAs('aluno');
      const res = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBeTruthy();
      expect(res.body.token).toBeTruthy();
      expect(res.body.status).toBe('pending');
      expect(res.body.mode).toBe('training');
      expect(res.body.side).toBe('challenger');
      expect(res.body.character).toEqual({ id: CHAR, name: 'Sofia Test' });
      expect(res.body.opponent.userId).toBe('5');
      expect(res.body.opponent.accepted).toBe(false);
      expect(res.body.challenger.userId).toBe('3');
      // duelo gravado no disco
      expect(readData('duels.json').length).toBe(1);
    });

    it('modo competitive é preservado', async () => {
      const aluno = await loginAs('aluno');
      const res = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system', mode: 'competitive' });
      expect(res.body.mode).toBe('competitive');
    });

    it('duelo aberto (link/whatsapp) não tem oponente e vem taken=false pelo token', async () => {
      const aluno = await loginAs('aluno');
      const res = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, inviteMethod: 'whatsapp' });
      expect(res.status).toBe(200);
      expect(res.body.opponent).toBe(null);
      const byTok = await request(app).get(`/api/duel/by-token/${res.body.token}`).set(authHeader(aluno));
      expect(byTok.body.taken).toBe(false);
      expect(byTok.body.challengerName).toBe('Aluno A');
    });

    it('visitante não pode criar duelo → 403', async () => {
      const visitor = await loginVisitor();
      const res = await request(app).post('/api/duel').set(authHeader(visitor))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      expect(res.status).toBe(403);
    });

    it('characterId inexistente → 404', async () => {
      const aluno = await loginAs('aluno');
      const res = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: 'nao-existe', opponentUserId: '5', inviteMethod: 'system' });
      expect(res.status).toBe(404);
    });

    it('convidar a si mesmo → 400', async () => {
      const aluno = await loginAs('aluno');
      const res = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '3', inviteMethod: 'system' });
      expect(res.status).toBe(400);
    });

    it('oponente inexistente (system) → 404', async () => {
      const aluno = await loginAs('aluno');
      const res = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '999', inviteMethod: 'system' });
      expect(res.status).toBe(404);
    });

    it('lista de oponentes traz terapeutas exceto você; nega visitante', async () => {
      const aluno = await loginAs('aluno');
      const res = await request(app).get('/api/duel/opponents').set(authHeader(aluno));
      expect(res.status).toBe(200);
      const ids = res.body.map((o) => o.userId);
      expect(ids).toContain('5');
      expect(ids).toContain('6');
      expect(ids).not.toContain('3');
      expect(ids).not.toContain('2'); // supervisor não entra
      const visitor = await loginVisitor();
      expect((await request(app).get('/api/duel/opponents').set(authHeader(visitor))).status).toBe(403);
    });
  });

  // -------------------------------------------------------------------
  describe('aceite', () => {
    it('oponente convidado aceita e o convite fica marcado como lido', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const duelId = create.body.id;

      // aluno2 recebe convite não lido
      const notif = await request(app).get('/api/notifications').set(authHeader(aluno2));
      expect(notif.body.unread).toBe(1);
      expect(notif.body.items.some((n) => n.type === 'duel_invite' && n.duelId === duelId)).toBe(true);

      const accept = await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));
      expect(accept.status).toBe(200);
      expect(accept.body.side).toBe('opponent');
      expect(accept.body.opponent.accepted).toBe(true);
    });

    it('terceiro não-participante não aceita convite in-app → 403', async () => {
      const aluno = await loginAs('aluno');
      const solo = await loginAs('solo');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const res = await request(app).post(`/api/duel/${create.body.id}/accept`).set(authHeader(solo));
      expect(res.status).toBe(403);
    });

    it('aceitar duas vezes pelo mesmo oponente é idempotente (ok)', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const duelId = create.body.id;
      expect((await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2))).status).toBe(200);
      const again = await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));
      expect(again.status).toBe(200);
      expect(again.body.opponent.accepted).toBe(true);
    });

    it('challenger não pode aceitar o próprio duelo → 400', async () => {
      const aluno = await loginAs('aluno');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const res = await request(app).post(`/api/duel/${create.body.id}/accept`).set(authHeader(aluno));
      expect(res.status).toBe(400);
    });

    it('aceite por token válido; token inválido → 404', async () => {
      const aluno = await loginAs('aluno');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, inviteMethod: 'whatsapp' });
      const token = create.body.token;

      const view = await request(app).get(`/api/duel/by-token/${token}`).set(authHeader(aluno));
      expect(view.status).toBe(200);

      const aluno2 = await loginAs('aluno2');
      const accept = await request(app).post(`/api/duel/by-token/${token}/accept`).set(authHeader(aluno2));
      expect(accept.status).toBe(200);
      expect(accept.body.opponent.userId).toBe('5');

      expect((await request(app).get('/api/duel/by-token/tokeninvalido').set(authHeader(aluno))).status).toBe(404);
      expect((await request(app).post('/api/duel/by-token/tokeninvalido/accept').set(authHeader(aluno2))).status).toBe(404);
    });

    it('segundo a aceitar um link já tomado → 409', async () => {
      const aluno = await loginAs('aluno');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, inviteMethod: 'whatsapp' });
      const token = create.body.token;
      const aluno2 = await loginAs('aluno2');
      const solo = await loginAs('solo');
      await request(app).post(`/api/duel/by-token/${token}/accept`).set(authHeader(aluno2));
      const res = await request(app).post(`/api/duel/by-token/${token}/accept`).set(authHeader(solo));
      expect(res.status).toBe(409);
    });
  });

  // -------------------------------------------------------------------
  describe('sigilo das mensagens', () => {
    it('B NÃO vê as mensagens de A antes do fim; depois de completo ambos veem tudo', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const duelId = create.body.id;
      await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));

      // A submete; B ainda não
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgsA, durationSeconds: 120 });

      // B consulta ANTES de submeter: não pode conter a mensagem secreta de A
      const asB = await request(app).get(`/api/duel/${duelId}`).set(authHeader(aluno2));
      expect(asB.status).toBe(200);
      expect(asB.body.status).not.toBe('completed');
      const serializedB = JSON.stringify(asB.body);
      expect(serializedB).not.toContain('MENSAGEM_SECRETA_DO_A_1234');
      expect(asB.body.challengerMessages).toBeUndefined();
      expect(asB.body.opponentMessages).toBeUndefined();

      // B submete → completa
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno2)).send({ messages: msgsB, durationSeconds: 90 });
      const done = await waitCompleted(aluno2, duelId);
      expect(done.body.status).toBe('completed');
      const serializedDone = JSON.stringify(done.body);
      // agora B vê as mensagens de A e as próprias
      expect(serializedDone).toContain('MENSAGEM_SECRETA_DO_A_1234');
      expect(serializedDone).toContain('MENSAGEM_SECRETA_DO_B_5678');
      expect(done.body.challengerMessages).toBeTruthy();
      expect(done.body.opponentMessages).toBeTruthy();
    });

    it('admin vê as mensagens dos dois lados mesmo antes de completar', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      const admin = await loginAs('admin');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const duelId = create.body.id;
      await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgsA, durationSeconds: 120 });

      const asAdmin = await request(app).get(`/api/duel/${duelId}`).set(authHeader(admin));
      expect(asAdmin.status).toBe(200);
      expect(JSON.stringify(asAdmin.body)).toContain('MENSAGEM_SECRETA_DO_A_1234');
      expect(asAdmin.body.challengerMessages).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------
  describe('submit', () => {
    it('não-participante não pode submeter → 403', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      const solo = await loginAs('solo');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const duelId = create.body.id;
      await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));
      const res = await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(solo)).send({ messages: msgsA, durationSeconds: 1 });
      expect(res.status).toBe(403);
    });

    it('após 1º submit fica pending; após 2º submit vira completed com result', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const duelId = create.body.id;
      await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));

      const sub1 = await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgsA, durationSeconds: 120 });
      expect(sub1.status).toBe(200);
      expect(sub1.body.status).toBe('pending');

      const sub2 = await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno2)).send({ messages: msgsB, durationSeconds: 90 });
      expect(sub2.status).toBe(200);
      const done = await waitCompleted(aluno, duelId);
      expect(done.body.status).toBe('completed');
      expect(done.body.result).toBeTruthy();
    });

    it('submeter em duelo já completo → 400', async () => {
      const { aluno, duelId } = await fullDuel();
      await waitCompleted(aluno, duelId);
      const res = await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgsA, durationSeconds: 1 });
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  describe('resultado (empate demo 50x50)', () => {
    it('result tem o shape completo e é empate com notas iguais', async () => {
      const { aluno, duelId } = await fullDuel();
      const done = await waitCompleted(aluno, duelId);
      const r = done.body.result;
      expect(r).toBeTruthy();
      expect(r.winner).toBe('draw');
      expect(r.scoreChallenger).toBe(50);
      expect(r.scoreOpponent).toBe(50);
      expect(r.criteriaChallenger).toBeTruthy();
      expect(r.criteriaOpponent).toBeTruthy();
      expect(typeof r.evaluation).toBe('string');
      expect(r.completedAt).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------
  describe('MMR do duelo', () => {
    it('modo training → ranked:false, reason:training', async () => {
      const { aluno, duelId } = await fullDuel(); // sem mode → training
      const done = await waitCompleted(aluno, duelId);
      expect(done.body.result.mmr).toEqual({ ranked: false, reason: 'training' });
    });

    it('competitivo em calibração → ranked:false, reason:calibrating', async () => {
      const { aluno, duelId } = await fullDuel({ mode: 'competitive' });
      const done = await waitCompleted(aluno, duelId);
      expect(done.body.result.mmr.ranked).toBe(false);
      expect(done.body.result.mmr.reason).toBe('calibrating');
    });

    it('competitivo entre 2 reais fora da calibração → ranked:true com shape limpo (sem estado interno do engine)', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      seedMmr({ '3': { P: 50, n: 10, W: [] }, '5': { P: 70, n: 10, W: [] } });
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system', mode: 'competitive' });
      const duelId = create.body.id;
      await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgsA, durationSeconds: 60 });
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno2)).send({ messages: msgsB, durationSeconds: 60 });

      const done = await waitCompleted(aluno, duelId);
      const m = done.body.result.mmr;
      expect(m.ranked).toBe(true);
      // shape EXATO exigido pelo front — trava o bug de vazar estado do engine
      expect(Object.keys(m).sort()).toEqual(['challenger', 'characterDifficulty', 'opponent', 'ranked']);
      for (const side of ['challenger', 'opponent']) {
        expect(Object.keys(m[side]).sort()).toEqual(['after', 'before', 'delta', 'pvpDelta']);
      }
      // NÃO pode vazar estado interno do engine
      expect(m.playerA).toBeUndefined();
      expect(m.playerB).toBeUndefined();
      expect(m.resultA).toBeUndefined();
      expect(m.resultB).toBeUndefined();
      expect(m.pvp).toBeUndefined();
      expect(m.character).toBeUndefined();

      // empate 50x50: quem tinha MMR menor (challenger) ganha pool, maior perde
      expect(m.challenger.delta).toBeGreaterThan(0);
      expect(m.opponent.delta).toBeLessThan(0);

      // mmr.json foi de fato atualizado e n incrementou
      const mmrFile = readData('mmr.json');
      expect(mmrFile.players['3'].P).not.toBe(50);
      expect(mmrFile.players['5'].P).not.toBe(70);
      expect(mmrFile.players['3'].n).toBe(11);
    });

    it('competitivo contra visitante → ranked:false, reason:visitor', async () => {
      const aluno = await loginAs('aluno');
      seedMmr({ '3': { P: 60, n: 10, W: [] } });
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, inviteMethod: 'whatsapp', mode: 'competitive' });
      const { id: duelId, token } = create.body;
      const visitor = await loginVisitor();
      await request(app).post(`/api/duel/by-token/${token}/accept`).set(authHeader(visitor));
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(visitor)).send({ messages: msgsB, durationSeconds: 60 });
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgsA, durationSeconds: 60 });
      const done = await waitCompleted(aluno, duelId);
      expect(done.body.result.mmr.ranked).toBe(false);
      expect(done.body.result.mmr.reason).toBe('visitor');
    });
  });

  // -------------------------------------------------------------------
  describe('cancelamento', () => {
    it('challenger cancela duelo pendente e ele some para os dois; convite é removido', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const duelId = create.body.id;

      const socBefore = await request(app).get('/api/duels/social').set(authHeader(aluno));
      expect(socBefore.body[0].duels[0].canCancel).toBe(true);
      expect(socBefore.body[0].duels[0].canExport).toBe(false);

      const cancel = await request(app).delete(`/api/duel/${duelId}`).set(authHeader(aluno));
      expect(cancel.status).toBe(200);

      expect((await request(app).get(`/api/duel/${duelId}`).set(authHeader(aluno))).status).toBe(404);
      expect((await request(app).get('/api/duels/social').set(authHeader(aluno))).body).toEqual([]);
    });

    it('terceiro não cancela → 403', async () => {
      const aluno = await loginAs('aluno');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const solo = await loginAs('solo');
      const res = await request(app).delete(`/api/duel/${create.body.id}`).set(authHeader(solo));
      expect(res.status).toBe(403);
    });

    it('não cancela duelo já aceito → 400', async () => {
      const aluno = await loginAs('aluno');
      const aluno2 = await loginAs('aluno2');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const duelId = create.body.id;
      await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));
      const res = await request(app).delete(`/api/duel/${duelId}`).set(authHeader(aluno));
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  describe('TTL / prune', () => {
    const { execFileSync } = require('child_process');
    const os = require('os');

    // Além do boot, as rotas de leitura de duelo disparam a limpeza — como no
    // All_OS. Sem isso, um duelo expirado só sumiria ao reiniciar o servidor.
    const EXPIRED = () => new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const FRESH = () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

    function seedDuels() {
      writeData('duels.json', [
        {
          id: 'duel-velho', token: 'tok-velho', createdAt: EXPIRED(), status: 'completed', mode: 'training',
          character: { id: 'fp-test-1', name: 'Sofia Test' },
          challenger: { userId: '3', name: 'Aluno A', state: 'submitted', accepted: true, messages: [] },
          opponent: { userId: '5', name: 'Aluno B', state: 'submitted', accepted: true, messages: [] },
        },
        {
          id: 'duel-novo', token: 'tok-novo', createdAt: FRESH(), status: 'completed', mode: 'training',
          character: { id: 'fp-test-1', name: 'Sofia Test' },
          challenger: { userId: '3', name: 'Aluno A', state: 'submitted', accepted: true, messages: [] },
          opponent: { userId: '5', name: 'Aluno B', state: 'submitted', accepted: true, messages: [] },
        },
      ]);
    }

    it('GET /api/duels/social limpa os duelos expirados', async () => {
      seedDuels();
      const token = await loginAs('aluno');
      await request(app).get('/api/duels/social').set(authHeader(token)).expect(200);
      const ids = readData('duels.json').map((d) => d.id);
      expect(ids).toContain('duel-novo');
      expect(ids).not.toContain('duel-velho');
    });

    it('GET /api/duel/:id/export limpa os duelos expirados', async () => {
      seedDuels();
      const token = await loginAs('aluno');
      await request(app).get('/api/duel/duel-novo/export').set(authHeader(token));
      const ids = readData('duels.json').map((d) => d.id);
      expect(ids).not.toContain('duel-velho');
    });

    it('depois de limpo, o duelo expirado dá 404 (o recente segue acessível)', async () => {
      seedDuels();
      const token = await loginAs('aluno');
      // O prune roda dentro do /social; depois dele o duelo velho não existe mais.
      await request(app).get('/api/duels/social').set(authHeader(token));
      const velho = await request(app).get('/api/duel/duel-velho').set(authHeader(token));
      expect(velho.status).toBe(404);
      const novo = await request(app).get('/api/duel/duel-novo').set(authHeader(token));
      expect(novo.status).toBe(200);
    });

    // `GET /api/duel/:id` NÃO prune de propósito: o DuelSession faz polling nessa
    // rota enquanto espera o `finalizeDuel`, e `pruneExpiredDuels` escreve em
    // duels.json sem `withFileLock` — prunar aqui poderia atropelar a escrita do
    // resultado. O All_OS também só prune em /social e /export.
    it('GET /api/duel/:id não dispara o prune (rota de polling)', async () => {
      seedDuels();
      const token = await loginAs('aluno');
      await request(app).get('/api/duel/duel-novo').set(authHeader(token)).expect(200);
      expect(readData('duels.json').map((d) => d.id)).toContain('duel-velho');
    });

    // O prune também roda no boot. Como o app aqui é REQUERIDO (não é o main), esse
    // caminho só dá para exercitar num processo separado, com DATA_DIR próprio.

    it('remove duelo mais antigo que DUEL_TTL_MS (30d) no boot; preserva os recentes', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genus-ttl-'));
      const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40d > 30d
      const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5d < 30d
      const mkDuel = (id, createdAt) => ({
        id, token: 't-' + id, createdAt, mode: 'training', status: 'completed',
        inviteMethod: 'link', character: { id: CHAR, name: 'Sofia Test' },
        challenger: { userId: '3', name: 'Aluno A', accepted: true, state: 'submitted', messages: [] },
        opponent: { userId: '5', name: 'Aluno B', accepted: true, state: 'submitted', messages: [] },
        result: { winner: 'draw', scoreChallenger: 50, scoreOpponent: 50 },
      });
      // fixtures mínimas exigidas pelo boot
      fs.writeFileSync(path.join(dir, 'users.json'), JSON.stringify([]));
      fs.writeFileSync(path.join(dir, 'duels.json'), JSON.stringify([
        mkDuel('duel-antigo', old),
        mkDuel('duel-recente', recent),
      ], null, 2));

      const appPath = path.join(__dirname, '..', 'server', 'index.js');
      // Executa server/index.js como MAIN (require.main === module → dispara
      // pruneExpiredDuels no boot). Roda em background e matamos logo após o prune.
      const child = require('child_process').spawn(
        process.execPath, [appPath],
        {
          stdio: 'ignore',
          env: {
            ...process.env,
            NODE_ENV: 'test',
            JWT_SECRET: 'a'.repeat(48),
            DATA_DIR: dir,
            OPENAI_API_KEY: '',
            PORT: '0',
          },
        },
      );
      // dá tempo do boot rodar o prune (síncrono) e sobe o listen; então mata.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const cur = JSON.parse(fs.readFileSync(path.join(dir, 'duels.json'), 'utf-8'));
        if (cur.length < 2) break; // prune já rodou
        execFileSync('sleep', ['0.05']);
      }
      child.kill('SIGKILL');

      const ids = JSON.parse(fs.readFileSync(path.join(dir, 'duels.json'), 'utf-8')).map((d) => d.id);
      expect(ids).not.toContain('duel-antigo');
      expect(ids).toContain('duel-recente');
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  // -------------------------------------------------------------------
  describe('notificações', () => {
    it('convite gera notificação para o oponente; resultado notifica os dois lados', async () => {
      const { aluno, aluno2, duelId } = await fullDuel();
      await waitCompleted(aluno, duelId);

      const rn1 = await request(app).get('/api/notifications').set(authHeader(aluno));
      expect(rn1.body.items.some((n) => n.type === 'duel_result' && n.duelId === duelId)).toBe(true);
      const rn2 = await request(app).get('/api/notifications').set(authHeader(aluno2));
      expect(rn2.body.items.some((n) => n.type === 'duel_result' && n.duelId === duelId)).toBe(true);
      // aluno2 também tinha recebido o convite
      expect(rn2.body.items.some((n) => n.type === 'duel_invite' && n.duelId === duelId)).toBe(true);
    });

    it('visitante não recebe notificação de resultado (id efêmero)', async () => {
      const aluno = await loginAs('aluno');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, inviteMethod: 'whatsapp' });
      const { id: duelId, token } = create.body;
      const visitor = await loginVisitor();
      await request(app).post(`/api/duel/by-token/${token}/accept`).set(authHeader(visitor));
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(visitor)).send({ messages: msgsB, durationSeconds: 60 });
      await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgsA, durationSeconds: 60 });
      await waitCompleted(aluno, duelId);
      const vnotif = await request(app).get('/api/notifications').set(authHeader(visitor));
      expect(vnotif.body).toEqual({ items: [], unread: 0 });
    });
  });

  // -------------------------------------------------------------------
  describe('GET /api/duels/social', () => {
    it('agrupa por oponente com shape achatado wins/losses/draws e duels[]', async () => {
      const { aluno, aluno2, duelId } = await fullDuel();
      await waitCompleted(aluno, duelId);

      const soc = await request(app).get('/api/duels/social').set(authHeader(aluno));
      expect(soc.body.length).toBe(1);
      const g = soc.body[0];
      expect(g.userId).toBe('5');
      expect(g.name).toBe('Aluno B');
      expect(g).toHaveProperty('profilePhoto');
      expect(g.wins).toBe(0);
      expect(g.losses).toBe(0);
      expect(g.draws).toBe(1);
      expect(g.duels.length).toBe(1);
      const d = g.duels[0];
      expect(d.id).toBe(duelId);
      expect(d.status).toBe('completed');
      expect(d.mode).toBe('training');
      expect(d.characterName).toBe('Sofia Test');
      expect(d.outcome).toBe('draw');
      expect(d.scoreMine).toBe(50);
      expect(d.scoreTheirs).toBe(50);
      expect(d.canCancel).toBe(false);
      expect(d.canExport).toBe(true);
      // o shape all_os (opponent aninhado / count) NÃO existe aqui
      expect(g.opponent).toBeUndefined();
      expect(g.count).toBeUndefined();

      // do lado do aluno2, o oponente é o Aluno A
      const soc2 = await request(app).get('/api/duels/social').set(authHeader(aluno2));
      expect(soc2.body[0].name).toBe('Aluno A');
      expect(soc2.body[0].draws).toBe(1);
    });

    it('visitante recebe lista vazia', async () => {
      const visitor = await loginVisitor();
      const res = await request(app).get('/api/duels/social').set(authHeader(visitor));
      expect(res.body).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  describe('GET /api/duel/:id/export', () => {
    it('participante baixa o texto do duelo concluído; não-participante → 403', async () => {
      const { aluno, duelId } = await fullDuel();
      await waitCompleted(aluno, duelId);

      const exp = await request(app).get(`/api/duel/${duelId}/export`).set(authHeader(aluno));
      expect(exp.status).toBe(200);
      expect(exp.headers['content-disposition']).toMatch(/attachment; filename="duelo-.*\.txt"/);
      expect(exp.text).toContain('AVALIAÇÃO COMPARATIVA');
      expect(exp.text).toContain('Sofia Test');
      expect(exp.text).toContain('Aluno A');
      expect(exp.text).toContain('Aluno B');

      const solo = await loginAs('solo');
      expect((await request(app).get(`/api/duel/${duelId}/export`).set(authHeader(solo))).status).toBe(403);
    });

    it('export de duelo não concluído → 400', async () => {
      const aluno = await loginAs('aluno');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system' });
      const res = await request(app).get(`/api/duel/${create.body.id}/export`).set(authHeader(aluno));
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------
  describe('GET /api/duel/:id acesso', () => {
    it('não-participante não vê o duelo → 403', async () => {
      const aluno = await loginAs('aluno');
      const create = await request(app).post('/api/duel').set(authHeader(aluno))
        .send({ characterId: CHAR, inviteMethod: 'whatsapp' });
      const solo = await loginAs('solo');
      expect((await request(app).get(`/api/duel/${create.body.id}`).set(authHeader(solo))).status).toBe(403);
    });

    it('duelo inexistente → 404', async () => {
      const aluno = await loginAs('aluno');
      expect((await request(app).get('/api/duel/nao-existe').set(authHeader(aluno))).status).toBe(404);
    });
  });
});
