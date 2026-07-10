// CRUD de personagens (freeplay) e exercícios via mountCharacterCrud,
// fotos de paciente, e progresso da trilha.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

const post = (path, token, body) => request(app).post(path).set(authHeader(token)).send(body);
const put = (path, token, body) => request(app).put(path).set(authHeader(token)).send(body);
const del = (path, token) => request(app).delete(path).set(authHeader(token));
const get = (path, token) => request(app).get(path).set(authHeader(token));

// Um data URL de imagem JPEG minúsculo, mas válido para o regex do server.
const tinyJpeg = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');

describe('POST /api/freeplay — autorização e allowlist', () => {
  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    const res = await post('/api/freeplay', aluno, { name: 'X' });
    expect(res.status).toBe(403);
  });

  it('professor -> 403', async () => {
    const prof = await loginAs('prof');
    const res = await post('/api/freeplay', prof, { name: 'X' });
    expect(res.status).toBe(403);
  });

  it('admin cria e o id é gerado no servidor com prefixo fp', async () => {
    const admin = await loginAs('admin');
    const res = await post('/api/freeplay', admin, { name: 'Novo', age: 30 });
    expect(res.status).toBe(200);
    expect(res.body.id.startsWith('fp')).toBe(true);
    expect(res.body.name).toBe('Novo');
  });

  it('campos fora da allowlist (id, foo) NÃO são gravados', async () => {
    const admin = await loginAs('admin');
    const res = await post('/api/freeplay', admin, { name: 'Novo', id: 'hack', foo: 1 });
    expect(res.body.id).not.toBe('hack');
    expect(res.body.foo).toBeUndefined();
    const stored = readData('freeplay-characters.json').find((c) => c.id === res.body.id);
    expect(stored.foo).toBeUndefined();
  });

  it('grava apenas os FREEPLAY_FIELDS conhecidos', async () => {
    const admin = await loginAs('admin');
    const res = await post('/api/freeplay', admin, {
      name: 'N', age: 40, description: 'd', assistantId: 'a',
      specificInstruction: 'si', evaluationCriteria: 'ec',
    });
    const stored = readData('freeplay-characters.json').find((c) => c.id === res.body.id);
    expect(stored.name).toBe('N');
    expect(stored.evaluationCriteria).toBe('ec');
    expect(stored.specificInstruction).toBe('si');
  });
});

describe('POST /api/exercises — autorização e allowlist', () => {
  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    expect((await post('/api/exercises', aluno, { title: 'X' })).status).toBe(403);
  });

  it('admin cria com prefixo ex e grava só EXERCISE_FIELDS', async () => {
    const admin = await loginAs('admin');
    const res = await post('/api/exercises', admin, {
      skillId: 2, title: 'T', description: 'd', difficulty: 'iniciante',
      specificInstruction: 'si', evaluatorPrompt: 'ep', name: 'IGNORADO',
    });
    expect(res.status).toBe(200);
    expect(res.body.id.startsWith('ex')).toBe(true);
    const stored = readData('exercises.json').find((c) => c.id === res.body.id);
    expect(stored.title).toBe('T');
    expect(stored.evaluatorPrompt).toBe('ep');
    // 'name' não pertence a EXERCISE_FIELDS.
    expect(stored.name).toBeUndefined();
  });
});

describe('PUT /api/freeplay/:id — atualização', () => {
  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    expect((await put('/api/freeplay/fp-test-1', aluno, { name: 'X' })).status).toBe(403);
  });

  it('admin atualiza campo permitido', async () => {
    const admin = await loginAs('admin');
    const res = await put('/api/freeplay/fp-test-1', admin, { name: 'Renomeado' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renomeado');
    expect(readData('freeplay-characters.json').find((c) => c.id === 'fp-test-1').name).toBe('Renomeado');
  });

  it('PUT ignora campos fora da allowlist', async () => {
    const admin = await loginAs('admin');
    await put('/api/freeplay/fp-test-1', admin, { hacked: true, role: 'admin' });
    const stored = readData('freeplay-characters.json').find((c) => c.id === 'fp-test-1');
    expect(stored.hacked).toBeUndefined();
    expect(stored.role).toBeUndefined();
  });

  it('PUT em id inexistente -> 404', async () => {
    const admin = await loginAs('admin');
    expect((await put('/api/freeplay/nao-existe', admin, { name: 'X' })).status).toBe(404);
  });
});

describe('DELETE /api/freeplay/:id', () => {
  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    expect((await del('/api/freeplay/fp-test-1', aluno)).status).toBe(403);
  });

  it('admin remove', async () => {
    const admin = await loginAs('admin');
    const res = await del('/api/freeplay/fp-test-1', admin);
    expect(res.status).toBe(200);
    expect(readData('freeplay-characters.json').find((c) => c.id === 'fp-test-1')).toBeUndefined();
  });

  it('DELETE é idempotente (id inexistente -> 200 ok)', async () => {
    const admin = await loginAs('admin');
    expect((await del('/api/freeplay/nao-existe', admin)).status).toBe(200);
  });
});

describe('GET /api/freeplay — decoração com MMR', () => {
  it('injeta difficulty e competitiveMatches', async () => {
    const admin = await loginAs('admin');
    const res = await get('/api/freeplay', admin);
    expect(res.status).toBe(200);
    for (const c of res.body) {
      expect(c).toHaveProperty('difficulty');
      expect(c).toHaveProperty('competitiveMatches');
    }
  });

  it('competitiveMatches reflete o mmr.json', async () => {
    writeData('mmr.json', { players: {}, characters: { 'fp-test-1': { n: 4 } } });
    const admin = await loginAs('admin');
    const res = await get('/api/freeplay', admin);
    const sofia = res.body.find((c) => c.id === 'fp-test-1');
    expect(sofia.competitiveMatches).toBe(4);
  });

  it('sem dados de MMR, competitiveMatches é 0', async () => {
    const admin = await loginAs('admin');
    const res = await get('/api/freeplay', admin);
    expect(res.body.find((c) => c.id === 'fp-test-2').competitiveMatches).toBe(0);
  });

  it('exercícios NÃO ganham decoração de MMR', async () => {
    const admin = await loginAs('admin');
    const res = await get('/api/exercises', admin);
    expect(res.body[0].competitiveMatches).toBeUndefined();
  });
});

describe('PUT /api/freeplay/:id/photo', () => {
  const photo = (token, id, body) =>
    request(app).put(`/api/freeplay/${id}/photo`).set(authHeader(token)).send(body);

  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    expect((await photo(aluno, 'fp-test-1', { icon: tinyJpeg, full: tinyJpeg })).status).toBe(403);
  });

  it('admin com data URL válido -> 200 e grava referências', async () => {
    const admin = await loginAs('admin');
    const res = await photo(admin, 'fp-test-1', { icon: tinyJpeg, full: tinyJpeg });
    expect(res.status).toBe(200);
    const stored = readData('freeplay-characters.json').find((c) => c.id === 'fp-test-1');
    expect(stored.photoIcon).toBeTruthy();
    expect(stored.photoFull).toBeTruthy();
  });

  it('base64 inválido (não é data URL de imagem) -> 400', async () => {
    const admin = await loginAs('admin');
    const res = await photo(admin, 'fp-test-1', { icon: 'lixo', full: 'lixo' });
    expect(res.status).toBe(400);
  });

  it('MIME não-imagem -> 400', async () => {
    const admin = await loginAs('admin');
    const bad = 'data:text/plain;base64,' + Buffer.from('x').toString('base64');
    const res = await photo(admin, 'fp-test-1', { icon: bad, full: bad });
    expect(res.status).toBe(400);
  });

  it('imagem > 6MB -> 413', async () => {
    const admin = await loginAs('admin');
    const big = 'data:image/jpeg;base64,' + Buffer.alloc(7 * 1024 * 1024, 0x41).toString('base64');
    const res = await photo(admin, 'fp-test-1', { icon: big, full: big });
    expect(res.status).toBe(413);
  });

  it('{clear:true} remove as fotos', async () => {
    const admin = await loginAs('admin');
    await photo(admin, 'fp-test-1', { icon: tinyJpeg, full: tinyJpeg });
    const res = await photo(admin, 'fp-test-1', { clear: true });
    expect(res.status).toBe(200);
    const stored = readData('freeplay-characters.json').find((c) => c.id === 'fp-test-1');
    expect(stored.photoIcon).toBeUndefined();
    expect(stored.photoFull).toBeUndefined();
  });

  it('path traversal no :id não escreve fora (id inexistente -> 404, nada gravado)', async () => {
    const admin = await loginAs('admin');
    const res = await photo(admin, encodeURIComponent('../../etc/passwd'), { icon: tinyJpeg, full: tinyJpeg });
    // O findIndex não encontra o personagem -> 404 antes de qualquer write.
    expect(res.status).toBe(404);
  });

  it('id com barra/percurso não casa uma rota de foto válida', async () => {
    const admin = await loginAs('admin');
    // Um id com '/' bruto vira outro path; garante que não há 200.
    const res = await request(app).put('/api/freeplay/..%2Ffoo/photo')
      .set(authHeader(admin)).send({ icon: tinyJpeg, full: tinyJpeg });
    expect(res.status).not.toBe(200);
  });

  it('exercício NÃO tem rota de foto', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).put('/api/exercises/ex-test-1/photo')
      .set(authHeader(admin)).send({ icon: tinyJpeg, full: tinyJpeg });
    expect(res.status).toBe(404);
  });
});

describe('GET/POST /api/progress/:userId', () => {
  it('dono lê o próprio progresso', async () => {
    writeData('progress.json', { '3': { 'ex-test-1': true } });
    const aluno = await loginAs('aluno');
    const res = await get('/api/progress/3', aluno);
    expect(res.status).toBe(200);
    expect(res.body['ex-test-1']).toBe(true);
  });

  it('outro aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    expect((await get('/api/progress/5', aluno)).status).toBe(403);
  });

  it('admin lê qualquer progresso', async () => {
    const admin = await loginAs('admin');
    expect((await get('/api/progress/5', admin)).status).toBe(200);
  });

  it('POST faz merge (não apaga chaves anteriores)', async () => {
    writeData('progress.json', { '3': { a: 1 } });
    const aluno = await loginAs('aluno');
    const res = await post('/api/progress/3', aluno, { b: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ a: 1, b: 2 });
    expect(readData('progress.json')['3']).toEqual({ a: 1, b: 2 });
  });

  it('POST em outro aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    expect((await post('/api/progress/5', aluno, { x: 1 })).status).toBe(403);
  });
});
