// Contrato de POST / GET / DELETE /api/logs.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, authHeader, makeLog,
} = require('./helpers');

beforeEach(() => resetData());

function post(token, body) {
  return request(app).post('/api/logs').set(authHeader(token)).send(body);
}

describe('POST /api/logs — validação de type', () => {
  it('type ausente -> 400', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { itemId: 'fp-test-1', messages: [] });
    expect(res.status).toBe(400);
  });

  it('type "neuro" (não portado) -> 400', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'neuro', itemId: 'x', messages: [] });
    expect(res.status).toBe(400);
  });

  it('type "x" inválido -> 400', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'x', itemId: 'x', messages: [] });
    expect(res.status).toBe(400);
  });

  it('type "exercise" -> 200', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'exercise', itemId: 'ex-test-1', messages: [] });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('exercise');
  });

  it('type "freeplay" -> 200', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [] });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('freeplay');
  });
});

describe('POST /api/logs — mode', () => {
  it('default é "training" quando ausente', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [] });
    expect(res.body.mode).toBe('training');
  });

  it('"competitive" é aceito', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [], mode: 'competitive' });
    expect(res.body.mode).toBe('competitive');
  });

  it('valor inválido cai em "training"', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [], mode: 'ranked' });
    expect(res.body.mode).toBe('training');
  });
});

describe('POST /api/logs — difficulty resolvida server-side', () => {
  it('exercício: difficulty vem do exercício, ignora o body', async () => {
    const aluno = await loginAs('aluno');
    // ex-test-1 é 'iniciante'; mandamos 'avancado' e deve ser sobrescrito.
    const res = await post(aluno, { type: 'exercise', itemId: 'ex-test-1', messages: [], difficulty: 'avancado' });
    expect(res.body.difficulty).toBe('iniciante');
  });

  it('freeplay: difficulty é null', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [], difficulty: 'avancado' });
    expect(res.body.difficulty).toBe(null);
  });
});

describe('POST /api/logs — mensagens', () => {
  it('acima de LOG_MAX_MESSAGES (500) -> 400', async () => {
    const aluno = await loginAs('aluno');
    const messages = Array.from({ length: 501 }, () => ({ role: 'user', content: 'x' }));
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages });
    expect(res.status).toBe(400);
  });

  it('exatamente 500 mensagens -> 200', async () => {
    const aluno = await loginAs('aluno');
    const messages = Array.from({ length: 500 }, () => ({ role: 'user', content: 'x' }));
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages });
    expect(res.status).toBe(200);
  });

  it('conteúdo é clampado em LOG_MAX_MESSAGE_LEN (20000)', async () => {
    const aluno = await loginAs('aluno');
    const long = 'a'.repeat(25000);
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [{ role: 'user', content: long }] });
    expect(res.status).toBe(200);
    expect(res.body.messages[0].content.length).toBe(20000);
  });

  it('roles inválidos viram "user"', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, {
      type: 'freeplay', itemId: 'fp-test-1',
      messages: [{ role: 'system', content: 'x' }, { role: 'assistant', content: 'y' }],
    });
    expect(res.body.messages[0].role).toBe('user');
    expect(res.body.messages[1].role).toBe('assistant');
  });
});

describe('POST /api/logs — MMR', () => {
  it('freeplay + competitive + score numérico + não-visitante -> resposta traz mmr', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [], mode: 'competitive', score: 70 });
    expect(res.status).toBe(200);
    expect(res.body.mmr).toBeDefined();
    expect(res.body.mmr).toHaveProperty('mmr');
    expect(res.body.mmr).toHaveProperty('calibrating');
  });

  it('training -> SEM campo mmr', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [], mode: 'training', score: 70 });
    expect(res.body.mmr).toBeUndefined();
  });

  it('score null -> SEM mmr (não alimenta)', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'freeplay', itemId: 'fp-test-1', messages: [], mode: 'competitive' });
    expect(res.body.score).toBe(null);
    expect(res.body.mmr).toBeUndefined();
  });

  it('exercise competitivo -> SEM mmr', async () => {
    const aluno = await loginAs('aluno');
    const res = await post(aluno, { type: 'exercise', itemId: 'ex-test-1', messages: [], mode: 'competitive', score: 70 });
    expect(res.body.mmr).toBeUndefined();
  });

  // Demanda #2 — inversão consciente: o visitante COM mmr. Antes a chave vinha ausente
  // (ele era excluído do rating); agora ele pontua igual ao aluno, e o que o separa é a
  // arena do ranking (D3), não o direito de pontuar.
  it('visitante competitivo -> COM mmr (demanda #2)', async () => {
    const visitor = await loginVisitor();
    const res = await post(visitor, { type: 'freeplay', itemId: 'fp-test-1', messages: [], mode: 'competitive', score: 70 });
    expect(res.status).toBe(200);
    expect(res.body.mmr).toBeTruthy();
    expect(res.body.mmr.n).toBe(1);
  });
});

describe('GET /api/logs — TTL / prune', () => {
  it('log com 40 dias é removido pelo prune; recente sobrevive; expiresAt presente', async () => {
    const admin = await loginAs('admin');
    const antigo = makeLog({ id: 'log-old', daysAgo: 40, userId: '3' });
    const recente = makeLog({ id: 'log-new', daysAgo: 1, userId: '3' });
    writeData('logs.json', [antigo, recente]);

    const res = await request(app).get('/api/logs').set(authHeader(admin));
    expect(res.status).toBe(200);
    const ids = res.body.map((l) => l.id);
    expect(ids).toContain('log-new');
    expect(ids).not.toContain('log-old');
    // o prune persistiu no disco
    expect(readData('logs.json').map((l) => l.id)).toEqual(['log-new']);
    // expiresAt vem no GET
    const novo = res.body.find((l) => l.id === 'log-new');
    expect(novo.expiresAt).toBeTruthy();
  });

  it('GET /api/logs/policy retorna { ttlDays: 30 }', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/logs/policy').set(authHeader(aluno));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ttlDays: 30 });
  });
});

describe('DELETE /api/logs/:id', () => {
  it('admin apaga', async () => {
    const admin = await loginAs('admin');
    writeData('logs.json', [makeLog({ id: 'log-del', userId: '3' })]);
    const res = await request(app).delete('/api/logs/log-del').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(readData('logs.json')).toEqual([]);
  });

  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    writeData('logs.json', [makeLog({ id: 'log-del', userId: '3' })]);
    const res = await request(app).delete('/api/logs/log-del').set(authHeader(aluno));
    expect(res.status).toBe(403);
    // não apagou
    expect(readData('logs.json').length).toBe(1);
  });
});
