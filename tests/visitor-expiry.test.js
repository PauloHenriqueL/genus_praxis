// Validade do acesso do visitante (demanda #8).
//
// A regra central: o JWT vale 7 DIAS, mas o acesso pode valer 1 HORA. Confiar no token
// daria 7 dias a todo mundo — por isso a checagem lê o `users.json` a cada request. Se
// estes testes caírem, o prazo virou decoração.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, loginVisitorFull, visitorPayload, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

/** Vence o acesso de um visitante mexendo no disco (simula a passagem do tempo). */
function expirarNoDisco(id) {
  const users = readData('users.json');
  users.find((u) => u.id === id).accessExpiresAt = '2020-01-01T00:00:00.000Z';
  writeData('users.json', users);
}

const setDuration = (token, key) =>
  request(app).put('/api/admin/settings').set(authHeader(token)).send({ visitorAccessDuration: key });

const visitorAccess = (token, id, action) =>
  request(app).post(`/api/admin/users/${id}/visitor-access`).set(authHeader(token)).send({ action });

describe('o prazo é carimbado no cadastro', () => {
  it('visitante novo ganha accessExpiresAt com a duração VIGENTE', async () => {
    const admin = await loginAs('admin');
    await setDuration(admin, '1h');

    const v = await loginVisitorFull();
    const gravado = readData('users.json').find((u) => u.id === v.id);

    expect(gravado.accessExpiresAt).toBeTruthy();
    expect(gravado.blocked).toBe(false);

    // ~1 hora à frente (tolerância de 1 min para a execução do teste).
    const faltam = Date.parse(gravado.accessExpiresAt) - Date.now();
    expect(faltam).toBeGreaterThan(59 * 60 * 1000);
    expect(faltam).toBeLessThan(61 * 60 * 1000);
  });

  it('duração "sem prazo" → accessExpiresAt null (o escape hatch)', async () => {
    const admin = await loginAs('admin');
    await setDuration(admin, 'unlimited');

    const v = await loginVisitorFull();
    expect(readData('users.json').find((u) => u.id === v.id).accessExpiresAt).toBeNull();

    // E ele entra normalmente, sem prazo para vencer.
    expect((await request(app).get('/api/freeplay').set(authHeader(v.token))).status).toBe(200);
  });

  // D8: mudar o padrão NÃO recalcula quem já entrou — o prazo dele foi combinado no cadastro.
  it('D8: mudar a duração padrão não mexe em quem já se cadastrou', async () => {
    const admin = await loginAs('admin');
    await setDuration(admin, '1h');
    const v = await loginVisitorFull();
    const antes = readData('users.json').find((u) => u.id === v.id).accessExpiresAt;

    await setDuration(admin, '1w');

    const depois = readData('users.json').find((u) => u.id === v.id).accessExpiresAt;
    expect(depois).toBe(antes);
  });

  it('duração inválida é ignorada (fica o padrão)', async () => {
    const admin = await loginAs('admin');
    const res = await setDuration(admin, 'ano-que-vem');
    expect(res.status).toBe(200);
    expect(res.body.visitorAccessDuration).toBe('3d'); // o default
  });
});

// ⚠ O CORAÇÃO DA DEMANDA. O token continua CRIPTOGRAFICAMENTE VÁLIDO (o JWT dura 7 dias);
// o que venceu é o direito de acesso. Se a checagem confiasse no token, todo visitante
// teria 7 dias, e a duração escolhida pelo admin não valeria nada.
describe('o acesso expirado é barrado — com o token ainda válido', () => {
  it('403 + VISITOR_EXPIRED em qualquer rota', async () => {
    const v = await loginVisitorFull();
    expirarNoDisco(v.id);

    for (const url of ['/api/freeplay', '/api/me', '/api/exercises', '/api/ranking']) {
      const res = await request(app).get(url).set(authHeader(v.token));
      expect(res.status, url).toBe(403);
      expect(res.body.code, url).toBe('VISITOR_EXPIRED');
    }
  });

  // 403, e NÃO 401. Um 401 dispara o `onSessionExpired` do client, que faz logout e joga o
  // lead na tela de login — onde ele tentaria se cadastrar de novo e levaria outro erro.
  it('é 403, não 401 (senão o client faz logout e o lead se perde)', async () => {
    const v = await loginVisitorFull();
    expirarNoDisco(v.id);
    const res = await request(app).get('/api/freeplay').set(authHeader(v.token));
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(403);
  });

  it('o bloqueio manual do admin também barra (mesmo sem prazo vencido)', async () => {
    const admin = await loginAs('admin');
    const v = await loginVisitorFull();

    await visitorAccess(admin, v.id, 'block');

    const res = await request(app).get('/api/freeplay').set(authHeader(v.token));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('VISITOR_EXPIRED');
  });

  it('ALUNO e ADMIN nunca são afetados (só visitante tem prazo)', async () => {
    // Mesmo com um accessExpiresAt vencido pendurado no aluno — o campo não é dele.
    const users = readData('users.json');
    users.find((u) => u.id === '3').accessExpiresAt = '2020-01-01T00:00:00.000Z';
    writeData('users.json', users);

    const aluno = await loginAs('aluno');
    expect((await request(app).get('/api/freeplay').set(authHeader(aluno))).status).toBe(200);
  });

  it('visitante sem accessExpiresAt (base antiga) NÃO é barrado', async () => {
    const v = await loginVisitorFull();
    const users = readData('users.json');
    delete users.find((u) => u.id === v.id).accessExpiresAt;
    writeData('users.json', users);

    expect((await request(app).get('/api/freeplay').set(authHeader(v.token))).status).toBe(200);
  });

  it('data corrompida não tranca ninguém (falha aberta)', async () => {
    const v = await loginVisitorFull();
    const users = readData('users.json');
    users.find((u) => u.id === v.id).accessExpiresAt = 'nao-e-uma-data';
    writeData('users.json', users);

    expect((await request(app).get('/api/freeplay').set(authHeader(v.token))).status).toBe(200);
  });
});

// ⚠ O FURO QUE A SPEC NÃO PREVIU. Sem este guard, o visitante expirado simplesmente
// refazia o cadastro com os mesmos dados, caía no ramo "já existe → volta para a mesma
// conta" e RECEBIA UM TOKEN NOVO. O prazo seria contornável por qualquer um, sem esforço.
describe('o visitante expirado não renova a si mesmo', () => {
  it('recadastrar com os mesmos dados → 403 (não um token novo)', async () => {
    const payload = visitorPayload();
    const primeiro = await request(app).post('/api/login/visitor').send(payload);
    expect(primeiro.status).toBe(200);

    expirarNoDisco(primeiro.body.user.id);

    const segundo = await request(app).post('/api/login/visitor').send(payload);
    expect(segundo.status).toBe(403);
    expect(segundo.body.code).toBe('VISITOR_EXPIRED');
    expect(segundo.body.token).toBeUndefined();   // nenhum token novo saiu daqui
  });

  it('bloqueado pelo admin também não se recadastra', async () => {
    const admin = await loginAs('admin');
    const payload = visitorPayload();
    const primeiro = await request(app).post('/api/login/visitor').send(payload);
    await visitorAccess(admin, primeiro.body.user.id, 'block');

    const segundo = await request(app).post('/api/login/visitor').send(payload);
    expect(segundo.status).toBe(403);
  });

  it('visitante ATIVO reentrando continua voltando para a mesma conta', async () => {
    const payload = visitorPayload();
    const a = await request(app).post('/api/login/visitor').send(payload);
    const b = await request(app).post('/api/login/visitor').send(payload);
    expect(b.status).toBe(200);
    expect(b.body.user.id).toBe(a.body.user.id);
  });
});

describe('POST /api/admin/users/:id/visitor-access', () => {
  // D8: quem renova recebe a duração VIGENTE, não a que valia quando se cadastrou.
  it('D8: renovar dá a duração vigente AGORA, não a do cadastro', async () => {
    const admin = await loginAs('admin');
    await setDuration(admin, '1h');
    const v = await loginVisitorFull();
    expirarNoDisco(v.id);

    // O admin mudou a política no meio do caminho.
    await setDuration(admin, '1w');

    const res = await visitorAccess(admin, v.id, 'renew');
    expect(res.status).toBe(200);
    expect(res.body.blocked).toBe(false);

    // Ganhou 1 SEMANA (a regra atual), não 1 hora (a do cadastro dele).
    const faltam = Date.parse(res.body.accessExpiresAt) - Date.now();
    expect(faltam).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);

    // E volta a entrar.
    expect((await request(app).get('/api/freeplay').set(authHeader(v.token))).status).toBe(200);
  });

  it('renovar desbloqueia quem o admin tinha bloqueado na mão', async () => {
    const admin = await loginAs('admin');
    const v = await loginVisitorFull();

    await visitorAccess(admin, v.id, 'block');
    expect((await request(app).get('/api/freeplay').set(authHeader(v.token))).status).toBe(403);

    await visitorAccess(admin, v.id, 'renew');
    expect((await request(app).get('/api/freeplay').set(authHeader(v.token))).status).toBe(200);
    expect(readData('users.json').find((u) => u.id === v.id).blocked).toBe(false);
  });

  it('renovar com "sem prazo" → accessExpiresAt null', async () => {
    const admin = await loginAs('admin');
    const v = await loginVisitorFull();
    expirarNoDisco(v.id);

    await setDuration(admin, 'unlimited');
    const res = await visitorAccess(admin, v.id, 'renew');
    expect(res.body.accessExpiresAt).toBeNull();
    expect((await request(app).get('/api/freeplay').set(authHeader(v.token))).status).toBe(200);
  });

  it('só ADMIN mexe no acesso (aluno e o próprio visitante → 403)', async () => {
    const v = await loginVisitorFull();
    const aluno = await loginAs('aluno');

    expect((await visitorAccess(aluno, v.id, 'renew')).status).toBe(403);
    // O visitante renovando a si mesmo seria o furo pela porta da frente.
    expect((await visitorAccess(v.token, v.id, 'renew')).status).toBe(403);
  });

  it('action inválida → 400; usuário que não é visitante → 400', async () => {
    const admin = await loginAs('admin');
    const v = await loginVisitorFull();

    expect((await visitorAccess(admin, v.id, 'destruir')).status).toBe(400);
    expect((await visitorAccess(admin, '3', 'renew')).status).toBe(400); // '3' é aluno
  });

  it('usuário inexistente → 404', async () => {
    const admin = await loginAs('admin');
    expect((await visitorAccess(admin, '9999', 'renew')).status).toBe(404);
  });
});

describe('GET /api/settings expõe o catálogo de durações', () => {
  it('traz visitorDurations + o padrão vigente', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).get('/api/settings').set(authHeader(admin));

    expect(res.body.visitorAccessDuration).toBe('3d');
    const keys = res.body.visitorDurations.map((d) => d.key);
    expect(keys).toContain('1h');
    expect(keys).toContain('unlimited');
    // O client escolhe DAQUI — não inventa valores.
    for (const d of res.body.visitorDurations) {
      expect(typeof d.label).toBe('string');
    }
  });
});
