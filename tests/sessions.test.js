// Sessões ativas: GET/PUT/DELETE /api/active-sessions/:type/:itemId + lista.
// Chaveadas por usuário (isolamento) e restritas a VALID_SESSION_TYPES.
const {
  app, request, resetData, loginAs, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

const base = '/api/active-sessions';

describe('GET/PUT/DELETE /api/active-sessions/:type/:itemId — tipos válidos', () => {
  it('tipo inválido ("neuro") no GET -> 400', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).get(`${base}/neuro/fp-test-1`).set(authHeader(aluno));
    expect(res.status).toBe(400);
  });

  it('tipo inválido no PUT -> 400', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).put(`${base}/x/fp-test-1`).set(authHeader(aluno)).send({ messages: [] });
    expect(res.status).toBe(400);
  });

  it('tipo inválido no DELETE -> 400', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).delete(`${base}/x/fp-test-1`).set(authHeader(aluno));
    expect(res.status).toBe(400);
  });

  it('exercise e freeplay são aceitos', async () => {
    const aluno = await loginAs('aluno');
    const ex = await request(app).put(`${base}/exercise/ex-test-1`).set(authHeader(aluno)).send({ messages: [] });
    const fp = await request(app).put(`${base}/freeplay/fp-test-1`).set(authHeader(aluno)).send({ messages: [] });
    expect(ex.status).toBe(200);
    expect(fp.status).toBe(200);
  });
});

describe('PUT + GET — salvar e recuperar a própria sessão', () => {
  it('salva e recupera com messages e elapsedSeconds', async () => {
    const aluno = await loginAs('aluno');
    const payload = {
      messages: [{ role: 'user', content: 'oi' }, { role: 'assistant', content: 'olá' }],
      elapsedSeconds: 42, itemTitle: 'Sofia Test', sessionNumber: 2,
    };
    const put = await request(app).put(`${base}/freeplay/fp-test-1`).set(authHeader(aluno)).send(payload);
    expect(put.status).toBe(200);
    expect(put.body.userId).toBe('3');
    expect(put.body.type).toBe('freeplay');
    expect(put.body.itemId).toBe('fp-test-1');
    expect(put.body.elapsedSeconds).toBe(42);

    const get = await request(app).get(`${base}/freeplay/fp-test-1`).set(authHeader(aluno));
    expect(get.status).toBe(200);
    expect(get.body.messages.length).toBe(2);
    expect(get.body.sessionNumber).toBe(2);
  });

  it('GET de sessão inexistente -> 200 com null', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).get(`${base}/freeplay/fp-test-1`).set(authHeader(aluno));
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe('Isolamento por usuário', () => {
  it('sessão do aluno 3 NÃO é vista pelo aluno 5', async () => {
    const aluno3 = await loginAs('aluno');   // id 3
    const aluno5 = await loginAs('aluno2');  // id 5

    await request(app).put(`${base}/freeplay/fp-test-1`).set(authHeader(aluno3))
      .send({ messages: [{ role: 'user', content: 'segredo do 3' }] });

    const get5 = await request(app).get(`${base}/freeplay/fp-test-1`).set(authHeader(aluno5));
    expect(get5.status).toBe(200);
    expect(get5.body).toBeNull(); // 5 não vê a sessão do 3, mesma chave type/itemId

    // O 3 continua vendo a sua.
    const get3 = await request(app).get(`${base}/freeplay/fp-test-1`).set(authHeader(aluno3));
    expect(get3.body).not.toBeNull();
    expect(get3.body.messages[0].content).toBe('segredo do 3');
  });

  it('GET /api/active-sessions lista só as do próprio usuário', async () => {
    const aluno3 = await loginAs('aluno');
    const aluno5 = await loginAs('aluno2');

    await request(app).put(`${base}/freeplay/fp-test-1`).set(authHeader(aluno3)).send({ messages: [] });
    await request(app).put(`${base}/exercise/ex-test-1`).set(authHeader(aluno3)).send({ messages: [] });
    await request(app).put(`${base}/freeplay/fp-test-2`).set(authHeader(aluno5)).send({ messages: [] });

    const list3 = await request(app).get(base).set(authHeader(aluno3));
    expect(list3.status).toBe(200);
    expect(list3.body.length).toBe(2);
    expect(list3.body.every((s) => s.userId === '3')).toBe(true);

    const list5 = await request(app).get(base).set(authHeader(aluno5));
    expect(list5.body.length).toBe(1);
    expect(list5.body[0].userId).toBe('5');
  });
});

describe('DELETE remove a sessão', () => {
  it('DELETE apaga e GET seguinte devolve null', async () => {
    const aluno = await loginAs('aluno');
    await request(app).put(`${base}/freeplay/fp-test-1`).set(authHeader(aluno)).send({ messages: [{ role: 'user', content: 'x' }] });

    const del = await request(app).delete(`${base}/freeplay/fp-test-1`).set(authHeader(aluno));
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);

    const get = await request(app).get(`${base}/freeplay/fp-test-1`).set(authHeader(aluno));
    expect(get.status).toBe(200);
    expect(get.body).toBeNull();
  });

  it('DELETE de sessão inexistente -> 200 (idempotente)', async () => {
    const aluno = await loginAs('aluno');
    const del = await request(app).delete(`${base}/freeplay/fp-test-1`).set(authHeader(aluno));
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
  });

  it('um aluno não apaga a sessão de outro (isolamento no DELETE)', async () => {
    const aluno3 = await loginAs('aluno');
    const aluno5 = await loginAs('aluno2');
    await request(app).put(`${base}/freeplay/fp-test-1`).set(authHeader(aluno3)).send({ messages: [{ role: 'user', content: 'do 3' }] });

    // 5 tenta apagar a MESMA chave type/itemId (mas é chaveada por userId).
    await request(app).delete(`${base}/freeplay/fp-test-1`).set(authHeader(aluno5));

    const get3 = await request(app).get(`${base}/freeplay/fp-test-1`).set(authHeader(aluno3));
    expect(get3.body).not.toBeNull();
    expect(get3.body.messages[0].content).toBe('do 3');
  });
});

describe('Autenticação', () => {
  it('sem token -> 401', async () => {
    const res = await request(app).get(base);
    expect(res.status).toBe(401);
  });
});
