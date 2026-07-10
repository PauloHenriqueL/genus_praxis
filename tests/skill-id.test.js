// `skillId` no log: qual competência da trilha a sessão treinou.
//
// Diferente do All_OS, que confia no `body.skillId` enviado pelo cliente, aqui o
// servidor resolve o valor a partir do `exercises.json` — a mesma leitura que já
// resolvia o `difficulty`. Um cliente pode mentir; o log não.
//
// `normalizeSkillId` é interno ao server; exercitamos pela rota POST /api/logs.

const {
  app, request, resetData, readData, writeData, loginAs, loginVisitor, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

// Fixtures: ex-test-1 → skillId 1, ex-test-2 → 2, ex-test-3 → 3.
async function logExercise(itemId, extra = {}) {
  const token = await loginAs('aluno');
  return request(app).post('/api/logs').set(authHeader(token)).send({
    type: 'exercise', itemId, itemTitle: 'X',
    durationSeconds: 60, messages: [{ role: 'user', content: 'oi' }],
    ...extra,
  });
}

describe('skillId resolvido pelo servidor', () => {
  it('grava a competência do exercício, lida do exercises.json', async () => {
    for (const [itemId, expected] of [['ex-test-1', 1], ['ex-test-2', 2], ['ex-test-3', 3]]) {
      const res = await logExercise(itemId);
      expect(res.status).toBe(200);
      expect(res.body.skillId).toBe(expected);
    }
  });

  it('IGNORA o skillId enviado pelo cliente (o All_OS gravaria o 99)', async () => {
    const res = await logExercise('ex-test-1', { skillId: 99 });
    expect(res.body.skillId).toBe(1);
    // E persiste o valor correto no disco, não o do cliente.
    const saved = readData('logs.json').find((l) => l.id === res.body.id);
    expect(saved.skillId).toBe(1);
  });

  it('freeplay nunca tem skillId, mesmo se o cliente mandar', async () => {
    const token = await loginAs('aluno');
    const res = await request(app).post('/api/logs').set(authHeader(token)).send({
      type: 'freeplay', itemId: 'fp-test-1', itemTitle: 'Sofia', skillId: 3,
      durationSeconds: 60, messages: [{ role: 'user', content: 'oi' }],
    });
    expect(res.body.skillId).toBeNull();
  });

  it('exercício inexistente → skillId null (não quebra)', async () => {
    const res = await logExercise('ex-nao-existe');
    expect(res.status).toBe(200);
    expect(res.body.skillId).toBeNull();
  });

  it('resolve junto com o difficulty, na mesma leitura', async () => {
    const res = await logExercise('ex-test-3', { difficulty: 'iniciante' });
    expect(res.body.skillId).toBe(3);
    // difficulty também vem do servidor, não do body.
    expect(res.body.difficulty).toBe('avancado');
  });
});

// `Number(null)`, `Number('')` e `Number([])` valem 0. Um filtro ingênuo
// (`Number.isFinite(Number(v))`) gravaria a competência 0, que não existe — são 1..5.
describe('normalizeSkillId: valores inválidos no exercises.json', () => {
  function withSkillId(v) {
    const list = readData('exercises.json');
    list.push({
      id: 'ex-borda', title: 'Borda', description: 'x',
      skillId: v, difficulty: 'iniciante', specificInstruction: 'x',
    });
    writeData('exercises.json', list);
  }

  const INVALIDOS = [
    ['null', null],
    ['string vazia', ''],
    ['só espaços', '   '],
    ['array vazio', []],
    ['texto', 'abc'],
    ['zero', 0],
    ['negativo', -1],
    ['decimal', 1.5],
    ['objeto', {}],
    ['booleano', true],
  ];

  for (const [nome, valor] of INVALIDOS) {
    it(`${nome} → skillId null (nunca competência 0)`, async () => {
      withSkillId(valor);
      const res = await logExercise('ex-borda');
      expect(res.status).toBe(200);
      expect(res.body.skillId).toBeNull();
      expect(res.body.skillId).not.toBe(0);
    });
  }

  it('string numérica é aceita e vira número', async () => {
    withSkillId('4');
    const res = await logExercise('ex-borda');
    expect(res.body.skillId).toBe(4);
  });

  it('inteiro positivo acima de 5 é aceito (admin pode criar competência nova)', async () => {
    withSkillId(7);
    const res = await logExercise('ex-borda');
    expect(res.body.skillId).toBe(7);
  });
});

describe('skillId não vaza nem quebra os outros papéis', () => {
  it('visitante também tem o skillId resolvido no próprio log', async () => {
    const token = await loginVisitor();
    const res = await request(app).post('/api/logs').set(authHeader(token)).send({
      type: 'exercise', itemId: 'ex-test-2', itemTitle: 'X',
      durationSeconds: 60, messages: [{ role: 'user', content: 'oi' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.skillId).toBe(2);
  });

  it('o log servido em GET /api/logs carrega o skillId', async () => {
    await logExercise('ex-test-1');
    const token = await loginAs('aluno');
    const res = await request(app).get('/api/logs').set(authHeader(token));
    expect(res.body[0].skillId).toBe(1);
  });
});
