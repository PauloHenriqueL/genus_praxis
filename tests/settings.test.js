// Configurações do sistema, efeito no /api/evaluate, health e export.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

const get = (path, token) => request(app).get(path).set(authHeader(token));
const putAdminSettings = (token, body) =>
  request(app).put('/api/admin/settings').set(authHeader(token)).send(body);

const evalReq = (token, extra = {}) =>
  request(app).post('/api/evaluate').set(authHeader(token))
    .send({ messages: [{ role: 'user', content: 'oi' }], ...extra });

describe('GET /api/settings', () => {
  it('qualquer autenticado lê -> {evaluatorEnabled, visitorEvaluationEnabled}', async () => {
    const aluno = await loginAs('aluno');
    const res = await get('/api/settings', aluno);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ evaluatorEnabled: false, visitorEvaluationEnabled: false });
  });

  it('exige autenticação', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('reflete os valores do disco', async () => {
    writeData('settings.json', { evaluatorEnabled: true, visitorEvaluationEnabled: true });
    const aluno = await loginAs('aluno');
    const res = await get('/api/settings', aluno);
    expect(res.body).toEqual({ evaluatorEnabled: true, visitorEvaluationEnabled: true });
  });
});

describe('PUT /api/admin/settings', () => {
  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    expect((await putAdminSettings(aluno, { evaluatorEnabled: true })).status).toBe(403);
  });

  it('professor -> 403', async () => {
    const prof = await loginAs('prof');
    expect((await putAdminSettings(prof, { evaluatorEnabled: true })).status).toBe(403);
  });

  it('admin liga o avaliador', async () => {
    const admin = await loginAs('admin');
    const res = await putAdminSettings(admin, { evaluatorEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body.evaluatorEnabled).toBe(true);
    expect(readData('settings.json').evaluatorEnabled).toBe(true);
  });

  it('merge por chave: setar só evaluatorEnabled NÃO zera visitorEvaluationEnabled', async () => {
    writeData('settings.json', { evaluatorEnabled: false, visitorEvaluationEnabled: true });
    const admin = await loginAs('admin');
    const res = await putAdminSettings(admin, { evaluatorEnabled: true });
    expect(res.body.evaluatorEnabled).toBe(true);
    expect(res.body.visitorEvaluationEnabled).toBe(true);
  });

  it('merge por chave: setar só visitorEvaluationEnabled NÃO zera evaluatorEnabled', async () => {
    writeData('settings.json', { evaluatorEnabled: true, visitorEvaluationEnabled: false });
    const admin = await loginAs('admin');
    const res = await putAdminSettings(admin, { visitorEvaluationEnabled: true });
    expect(res.body.evaluatorEnabled).toBe(true);
    expect(res.body.visitorEvaluationEnabled).toBe(true);
  });

  it('valores não-booleanos são coeridos com !!', async () => {
    const admin = await loginAs('admin');
    const res = await putAdminSettings(admin, { evaluatorEnabled: 'sim', visitorEvaluationEnabled: 0 });
    expect(res.body.evaluatorEnabled).toBe(true);
    expect(res.body.visitorEvaluationEnabled).toBe(false);
  });
});

describe('efeito das settings em POST /api/evaluate', () => {
  it('evaluatorEnabled=false -> {content:"", disabled:true} para aluno', async () => {
    const aluno = await loginAs('aluno');
    const res = await evalReq(aluno);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ content: '', disabled: true });
  });

  it('evaluatorEnabled=false -> disabled também para admin', async () => {
    const admin = await loginAs('admin');
    const res = await evalReq(admin);
    expect(res.body.disabled).toBe(true);
  });

  it('ligado + visitante + visitorEvaluationEnabled=false -> disabled', async () => {
    writeData('settings.json', { evaluatorEnabled: true, visitorEvaluationEnabled: false });
    const v = await loginVisitor();
    const res = await evalReq(v);
    expect(res.body.disabled).toBe(true);
  });

  it('ligado + visitante + visitorEvaluationEnabled=true -> NÃO disabled (503 sem OpenAI key)', async () => {
    // No harness OPENAI_API_KEY='' => getOpenAI() é null => 503, mas NÃO disabled.
    writeData('settings.json', { evaluatorEnabled: true, visitorEvaluationEnabled: true });
    const v = await loginVisitor();
    const res = await evalReq(v);
    expect(res.body.disabled).toBeUndefined();
    expect(res.status).toBe(503);
  });

  it('ligado + aluno -> passa da barreira de disabled (503 sem OpenAI key)', async () => {
    writeData('settings.json', { evaluatorEnabled: true });
    const aluno = await loginAs('aluno');
    const res = await evalReq(aluno);
    // Comportamento REAL no modo de teste: sem chave da OpenAI, retorna 503.
    expect(res.status).toBe(503);
    expect(res.body.disabled).toBeUndefined();
  });

  it('messages ausente -> 400', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/evaluate').set(authHeader(aluno)).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/health (público)', () => {
  it('não exige auth e traz as chaves do contrato', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('dataDir');
    expect(res.body).toHaveProperty('dataWritable');
    expect(res.body).toHaveProperty('openai');
    expect(res.body).toHaveProperty('evaluator');
  });

  it('openai=false no modo de teste; evaluator reflete a config', async () => {
    writeData('settings.json', { evaluatorEnabled: true });
    const res = await request(app).get('/api/health');
    expect(res.body.openai).toBe(false);
    expect(res.body.evaluator).toBe(true);
  });
});

describe('GET /api/admin/export', () => {
  it('só admin -> aluno 403', async () => {
    const aluno = await loginAs('aluno');
    expect((await get('/api/admin/export', aluno)).status).toBe(403);
  });

  it('professor -> 403', async () => {
    const prof = await loginAs('prof');
    expect((await get('/api/admin/export', prof)).status).toBe(403);
  });

  it('admin -> 200 com content-disposition attachment', async () => {
    const admin = await loginAs('admin');
    const res = await get('/api/admin/export', admin);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.settings).toBeTruthy();
  });
});
