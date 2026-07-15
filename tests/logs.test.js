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

// Decisão do usuário (2026-07-14): os logs NÃO expiram mais por padrão. O TTL fica
// desligado (`LOG_TTL_DAYS=0`); os logs ficam no volume até o admin apagar na mão. A
// infraestrutura do prune continua viva atrás da env, então dá para religar sem redeploy.
// O harness roda sem `LOG_TTL_DAYS`, ou seja, com o TTL DESLIGADO — o estado de produção.
describe('GET /api/logs — TTL desligado por padrão', () => {
  it('log de 400 dias NÃO é apagado (o prune não roda com TTL off)', async () => {
    const admin = await loginAs('admin');
    const antigo = makeLog({ id: 'log-old', daysAgo: 400, userId: '3' });
    const recente = makeLog({ id: 'log-new', daysAgo: 1, userId: '3' });
    writeData('logs.json', [antigo, recente]);

    const res = await request(app).get('/api/logs').set(authHeader(admin));
    expect(res.status).toBe(200);
    // Os DOIS sobrevivem — nada é apagado.
    expect(res.body.map((l) => l.id).sort()).toEqual(['log-new', 'log-old']);
    expect(readData('logs.json').length).toBe(2);
  });

  it('com o TTL desligado, o log não tem expiresAt (não mente sobre expiração)', async () => {
    const admin = await loginAs('admin');
    writeData('logs.json', [makeLog({ id: 'log-x', daysAgo: 1, userId: '3' })]);
    const res = await request(app).get('/api/logs').set(authHeader(admin));
    expect(res.body[0].expiresAt).toBeNull();
  });

  it('GET /api/logs/policy retorna { ttlDays: 0 } (o client esconde o aviso)', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/logs/policy').set(authHeader(aluno));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ttlDays: 0 });
  });
});

// A env religa o TTL. Ela é lida no boot, então precisa de um processo NOVO — mesmo
// harness de `features.test.js`. Aqui basta provar que o VALOR é lido; o efeito do prune
// (apagar de fato) é HTTP e já está coberto acima no modo desligado.
describe('LOG_TTL_DAYS religa o TTL (via env, no boot)', () => {
  const { execFileSync } = require('child_process');
  const path = require('path');

  const bootPolicy = (ttl) => {
    const out = execFileSync(process.execPath, ['-e', `
      const app = require('./server/index.js');
      const layer = app._router.stack.find((l) => l.route && l.route.path === '/api/logs/policy');
      const res = { json: (x) => console.log(JSON.stringify(x)) };
      layer.route.stack[layer.route.stack.length - 1].handle({}, res);
    `], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, LOG_TTL_DAYS: ttl, JWT_SECRET: 'x'.repeat(48), OPENAI_API_KEY: '', NODE_ENV: 'test' },
      encoding: 'utf8',
    });
    return JSON.parse(out.trim().split('\n').pop());
  };

  it('LOG_TTL_DAYS=30 → policy { ttlDays: 30 }', () => {
    expect(bootPolicy('30')).toEqual({ ttlDays: 30 });
  });

  it('LOG_TTL_DAYS=0 e valores inválidos → desligado (ttlDays: 0)', () => {
    expect(bootPolicy('0')).toEqual({ ttlDays: 0 });
    expect(bootPolicy('abc')).toEqual({ ttlDays: 0 });
    expect(bootPolicy('-5')).toEqual({ ttlDays: 0 });
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
