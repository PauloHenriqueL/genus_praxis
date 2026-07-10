// `mmrDelta` na notificação de resultado do duelo.
//
// O sino mostra a variação de MMR. Duas armadilhas travadas aqui:
//
//  1. Quando o duelo NÃO é ranqueado (`training`, `visitor`, `calibrating`), o
//     `applyDuelMmr` devolve `{ranked: false, reason}` — SEM as chaves
//     `challenger`/`opponent`. Um acesso direto quebraria o finalizeDuel.
//  2. O valor enviado é o `delta` (solo + PvP), o MESMO que o card pós-duelo
//     (`DuelSession`) exibe. Mandar `pvpDelta` faria o sino e a tela mostrarem
//     números diferentes para a mesma partida.

const {
  app, request, resetData, readData, loginAs, authHeader, DATA_DIR,
} = require('./helpers');
const fs = require('fs');
const path = require('path');

const CHAR = 'fp-test-1';
const CALIBRATION_MATCHES = require('../server/mmr').CALIBRATION_MATCHES;

function seedMmr(players) {
  fs.writeFileSync(path.join(DATA_DIR, 'mmr.json'), JSON.stringify({ players, characters: {} }, null, 2));
}

/** Coloca os dois alunos fora da calibração, com MMRs distintos. */
function seedCalibrated() {
  seedMmr({
    3: { P: 62, n: CALIBRATION_MATCHES + 3, W: [] },
    5: { P: 58, n: CALIBRATION_MATCHES + 3, W: [] },
  });
}

async function waitCompleted(token, duelId, { tries = 40, delay = 15 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await request(app).get(`/api/duel/${duelId}`).set(authHeader(token));
    if (r.body && r.body.status === 'completed') return r;
    await new Promise((res) => setTimeout(res, delay));
  }
  return request(app).get(`/api/duel/${duelId}`).set(authHeader(token));
}

const msgs = [
  { role: 'user', content: 'Olá, como você está?' },
  { role: 'assistant', content: 'Cansado.' },
];

/** Duelo completo entre aluno(3) e aluno2(5). Sem OPENAI_API_KEY → empate 50x50. */
async function fullDuel({ mode } = {}) {
  const aluno = await loginAs('aluno');
  const aluno2 = await loginAs('aluno2');
  const create = await request(app).post('/api/duel').set(authHeader(aluno))
    .send({ characterId: CHAR, opponentUserId: '5', inviteMethod: 'system', mode });
  const duelId = create.body.id;
  await request(app).post(`/api/duel/${duelId}/accept`).set(authHeader(aluno2));
  await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno)).send({ messages: msgs, durationSeconds: 120 });
  await request(app).post(`/api/duel/${duelId}/submit`).set(authHeader(aluno2)).send({ messages: msgs, durationSeconds: 90 });
  const done = await waitCompleted(aluno, duelId);
  return { aluno, aluno2, duelId, duel: done.body };
}

/** A notificação `duel_result` daquele duelo, do ponto de vista do usuário. */
async function resultNotif(token, duelId) {
  const res = await request(app).get('/api/notifications').set(authHeader(token));
  return res.body.items.find((n) => n.type === 'duel_result' && n.duelId === duelId);
}

beforeEach(() => resetData());

describe('duelo ranqueado: mmrDelta na notificação', () => {
  it('envia mmrDelta para os dois lados', async () => {
    seedCalibrated();
    const { aluno, aluno2, duelId, duel } = await fullDuel({ mode: 'competitive' });
    expect(duel.result.mmr.ranked).toBe(true);

    const nA = await resultNotif(aluno, duelId);
    const nB = await resultNotif(aluno2, duelId);
    expect(Number.isFinite(nA.mmrDelta)).toBe(true);
    expect(Number.isFinite(nB.mmrDelta)).toBe(true);
  });

  // O ponto central: o sino e a tela do duelo não podem discordar.
  it('mmrDelta é EXATAMENTE o delta que o card pós-duelo mostra', async () => {
    seedCalibrated();
    const { aluno, aluno2, duelId, duel } = await fullDuel({ mode: 'competitive' });
    const { challenger, opponent } = duel.result.mmr;

    expect((await resultNotif(aluno, duelId)).mmrDelta).toBe(challenger.delta);
    expect((await resultNotif(aluno2, duelId)).mmrDelta).toBe(opponent.delta);
  });

  it('NÃO envia o pvpDelta (que é outro número)', async () => {
    seedCalibrated();
    const { aluno, duelId, duel } = await fullDuel({ mode: 'competitive' });
    const { challenger } = duel.result.mmr;

    // O cenário só prova algo se os dois valores divergirem de fato. Se um dia
    // convergirem, este teste falha aqui em vez de virar um no-op silencioso.
    expect(challenger.delta).not.toBe(challenger.pvpDelta);

    const n = await resultNotif(aluno, duelId);
    expect(n.mmrDelta).toBe(challenger.delta);
    expect(n.mmrDelta).not.toBe(challenger.pvpDelta);
  });

  it('não vaza o estado interno do engine na notificação', async () => {
    seedCalibrated();
    const { aluno, duelId } = await fullDuel({ mode: 'competitive' });
    const n = await resultNotif(aluno, duelId);
    for (const k of ['playerA', 'playerB', 'resultA', 'resultB', 'pvp', 'character', 'mmr']) {
      expect(n[k]).toBeUndefined();
    }
  });

  it('a notificação mantém o placar e o desfecho', async () => {
    seedCalibrated();
    const { aluno, duelId } = await fullDuel({ mode: 'competitive' });
    const n = await resultNotif(aluno, duelId);
    // Empate determinístico 50x50 no modo demonstração.
    expect(n.outcome).toBe('draw');
    expect(n.scoreMine).toBe(50);
    expect(n.scoreTheirs).toBe(50);
  });
});

// Aqui mora o guard: sem `ranked`, o objeto não tem `challenger`/`opponent`.
describe('duelo NÃO ranqueado: mmrDelta é null (e nada quebra)', () => {
  it('training → ranked:false, reason "training", mmrDelta null', async () => {
    seedCalibrated(); // mesmo calibrados, treino não pontua
    const { aluno, aluno2, duelId, duel } = await fullDuel({ mode: 'training' });

    expect(duel.status).toBe('completed');
    expect(duel.result.mmr.ranked).toBe(false);
    expect(duel.result.mmr.reason).toBe('training');
    expect(duel.result.mmr.challenger).toBeUndefined();

    expect((await resultNotif(aluno, duelId)).mmrDelta).toBeNull();
    expect((await resultNotif(aluno2, duelId)).mmrDelta).toBeNull();
  });

  it('competitivo mas em calibração → mmrDelta null', async () => {
    // mmr.json zerado pelo resetData: ambos com n=0, dentro da calibração.
    const { aluno, duelId, duel } = await fullDuel({ mode: 'competitive' });
    expect(duel.result.mmr.ranked).toBe(false);
    expect(duel.result.mmr.reason).toBe('calibrating');
    expect((await resultNotif(aluno, duelId)).mmrDelta).toBeNull();
  });

  it('só um dos dois calibrado → ainda não ranqueia', async () => {
    seedMmr({ 3: { P: 62, n: CALIBRATION_MATCHES + 1, W: [] } }); // aluno2 sem partidas
    const { aluno, duelId, duel } = await fullDuel({ mode: 'competitive' });
    expect(duel.result.mmr.ranked).toBe(false);
    expect((await resultNotif(aluno, duelId)).mmrDelta).toBeNull();
  });

  it('o duelo completa normalmente mesmo sem MMR', async () => {
    const { duel } = await fullDuel({ mode: 'training' });
    expect(duel.status).toBe('completed');
    expect(duel.result.winner).toBe('draw');
    expect(duel.result.evaluation).toBeTruthy();
  });
});

describe('quem recebe a notificação', () => {
  it('os dois participantes, e ninguém mais', async () => {
    seedCalibrated();
    const { duelId } = await fullDuel({ mode: 'competitive' });

    // aluno(3) e aluno2(5) participaram; 'solo'(6) não.
    const solo = await loginAs('solo');
    const res = await request(app).get('/api/notifications').set(authHeader(solo));
    expect(res.body.items.filter((n) => n.duelId === duelId)).toHaveLength(0);
  });

  it('a notificação é persistida em notifications.json', async () => {
    seedCalibrated();
    const { duelId } = await fullDuel({ mode: 'competitive' });
    const all = readData('notifications.json');
    for (const userId of ['3', '5']) {
      const n = (all[userId] || []).find((x) => x.type === 'duel_result' && x.duelId === duelId);
      expect(n).toBeTruthy();
      expect(Number.isFinite(n.mmrDelta)).toBe(true);
    }
  });
});
