// Bloqueio de paciente por papel (demanda #7).
//
// A spec avisava: **filtrar o GET não é bloqueio**. Se as rotas que recebem um `itemId`
// não checarem, dá para conversar com um paciente bloqueado direto pela API — o card some
// da tela, o acesso continua aberto. É o risco de segurança desta demanda, e é o que a
// maior parte destes testes cobre.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

const CHAR = 'fp-test-1';

/** Reescreve o paciente do fixture com o acesso pedido. */
function setAccess({ allowStudent, allowVisitor }) {
  const chars = readData('freeplay-characters.json');
  const c = chars.find((x) => x.id === CHAR);
  c.allowStudent = allowStudent;
  c.allowVisitor = allowVisitor;
  writeData('freeplay-characters.json', chars);
}

const chat = (token, itemId = CHAR) =>
  request(app).post('/api/chat').set(authHeader(token))
    .send({ messages: [{ role: 'user', content: 'oi' }], context: { type: 'freeplay', itemId } });

describe('GET /api/freeplay — a listagem esconde o bloqueado', () => {
  it('bloqueado para os dois: aluno e visitante não veem; ADMIN vê', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });

    const aluno = await loginAs('aluno');
    const v = await loginVisitor();
    const admin = await loginAs('admin');

    const doAluno = (await request(app).get('/api/freeplay').set(authHeader(aluno))).body;
    const doVisitante = (await request(app).get('/api/freeplay').set(authHeader(v))).body;
    const doAdmin = (await request(app).get('/api/freeplay').set(authHeader(admin))).body;

    expect(doAluno.find((c) => c.id === CHAR)).toBeUndefined();
    expect(doVisitante.find((c) => c.id === CHAR)).toBeUndefined();
    // O admin PRECISA continuar vendo — é ele quem libera.
    expect(doAdmin.find((c) => c.id === CHAR)).toBeTruthy();
  });

  it('o bloqueio é POR PAPEL: liberado só para aluno', async () => {
    setAccess({ allowStudent: true, allowVisitor: false });
    const aluno = await loginAs('aluno');
    const v = await loginVisitor();

    expect((await request(app).get('/api/freeplay').set(authHeader(aluno))).body
      .find((c) => c.id === CHAR)).toBeTruthy();
    expect((await request(app).get('/api/freeplay').set(authHeader(v))).body
      .find((c) => c.id === CHAR)).toBeUndefined();
  });

  it('professor vê todos (precisa revisar o material)', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });
    const prof = await loginAs('prof');
    expect((await request(app).get('/api/freeplay').set(authHeader(prof))).body
      .find((c) => c.id === CHAR)).toBeTruthy();
  });

  // Base antiga, antes da migração: sem os campos, o paciente é tratado como LIBERADO.
  // (A migração D7 é que bloqueia os existentes — mas o helper não pode explodir antes.)
  it('paciente SEM os campos é tratado como liberado', async () => {
    const chars = readData('freeplay-characters.json');
    const c = chars.find((x) => x.id === CHAR);
    delete c.allowStudent;
    delete c.allowVisitor;
    writeData('freeplay-characters.json', chars);

    const aluno = await loginAs('aluno');
    expect((await request(app).get('/api/freeplay').set(authHeader(aluno))).body
      .find((c2) => c2.id === CHAR)).toBeTruthy();
  });

  // Exercícios não têm o gate — a #7 é só sobre pacientes de Simulação.
  it('a trilha de exercícios NÃO é afetada', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/exercises').set(authHeader(aluno));
    expect(res.body.length).toBeGreaterThan(0);
  });
});

// ⚠ O CORAÇÃO DA DEMANDA. Esconder o card não impede nada: o `itemId` é conhecido (basta
// ter atendido antes, ou ler o JS do bundle). Se estes testes caírem, o bloqueio é fake.
describe('as rotas com itemId barram o paciente bloqueado', () => {
  it('POST /api/chat com o id na mão → 403 (não 200, não 404)', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });
    const aluno = await loginAs('aluno');

    const res = await chat(aluno);
    expect(res.status).toBe(403);
    expect(res.body.patientLocked).toBe(true);
  });

  it('POST /api/chat → 403 também para o visitante (bloqueio por papel)', async () => {
    setAccess({ allowStudent: true, allowVisitor: false });
    const v = await loginVisitor();
    const aluno = await loginAs('aluno');

    expect((await chat(v)).status).toBe(403);
    // …e o aluno, liberado, NÃO leva 403 (o gate não bloqueia geral).
    expect((await chat(aluno)).status).not.toBe(403);
  });

  it('POST /api/duel num paciente bloqueado → 403', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/duel').set(authHeader(aluno))
      .send({ characterId: CHAR, inviteMethod: 'link' });
    expect(res.status).toBe(403);
    expect(res.body.patientLocked).toBe(true);
    expect(readData('duels.json').length).toBe(0); // nada foi criado
  });

  it('POST /api/progression/evaluate num paciente bloqueado → 403', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/progression/evaluate').set(authHeader(aluno))
      .send({ characterId: CHAR, messages: [{ role: 'user', content: 'oi' }] });
    expect(res.status).toBe(403);
  });

  it('o paciente bloqueado some da lista de progressão, mesmo já atendido', async () => {
    // O aluno atendeu antes; depois o admin bloqueou.
    writeData('logs.json', [{
      id: 'log1', userId: '3', type: 'freeplay', mode: 'training', itemId: CHAR,
      timestamp: new Date().toISOString(),
      messages: [{ role: 'user', content: 'oi' }],
    }]);
    const aluno = await loginAs('aluno');

    const antes = await request(app).get('/api/progression/available-patients').set(authHeader(aluno));
    expect(antes.body.find((p) => p.id === CHAR)).toBeTruthy();

    setAccess({ allowStudent: false, allowVisitor: false });
    const depois = await request(app).get('/api/progression/available-patients').set(authHeader(aluno));
    expect(depois.body.find((p) => p.id === CHAR)).toBeUndefined();
  });

  it('admin e professor NÃO são barrados pelo gate', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });
    for (const who of ['admin', 'prof']) {
      const token = await loginAs(who);
      expect((await chat(token)).status, who).not.toBe(403);
    }
  });
});

describe('POST /api/logs — o log é salvo, mas não pontua', () => {
  // Decisão consciente: se o admin bloquear NO MEIO de uma sessão em andamento, o aluno
  // não pode perder o que já escreveu. O log entra; o que ele não leva é o MMR de um
  // paciente que não deveria estar atendendo. (O /api/chat já barra qualquer sessão nova.)
  it('paciente bloqueado: log SALVO, mas sem MMR', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });
    const aluno = await loginAs('aluno');

    const res = await request(app).post('/api/logs').set(authHeader(aluno)).send({
      type: 'freeplay', itemId: CHAR, mode: 'competitive', score: 80,
      messages: [{ role: 'user', content: 'oi' }],
    });

    expect(res.status).toBe(200);
    expect(readData('logs.json').length).toBe(1);   // o trabalho dele não some
    expect(res.body.mmr == null).toBe(true);        // mas não pontua
    expect(readData('mmr.json').players['3']).toBeUndefined();
  });

  it('paciente liberado: log salvo E pontua (o controle não quebrou nada)', async () => {
    setAccess({ allowStudent: true, allowVisitor: true });
    const aluno = await loginAs('aluno');

    const res = await request(app).post('/api/logs').set(authHeader(aluno)).send({
      type: 'freeplay', itemId: CHAR, mode: 'competitive', score: 80,
      messages: [{ role: 'user', content: 'oi' }],
    });
    expect(res.body.mmr).toBeTruthy();
    expect(readData('mmr.json').players['3'].n).toBe(1);
  });
});

describe('PUT /api/freeplay/:id — quem libera', () => {
  it('admin liga o acesso do aluno', async () => {
    setAccess({ allowStudent: false, allowVisitor: false });
    const admin = await loginAs('admin');

    const res = await request(app).put(`/api/freeplay/${CHAR}`).set(authHeader(admin))
      .send({ allowStudent: true });
    expect(res.status).toBe(200);
    expect(readData('freeplay-characters.json').find((c) => c.id === CHAR).allowStudent).toBe(true);

    const aluno = await loginAs('aluno');
    expect((await chat(aluno)).status).not.toBe(403);
  });

  it('aluno não altera o próprio acesso (rota é de admin)', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).put(`/api/freeplay/${CHAR}`).set(authHeader(aluno))
      .send({ allowStudent: true });
    expect(res.status).toBe(403);
  });
});
