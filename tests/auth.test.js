// tests/auth.test.js — autenticação: login, visitante, /api/me, troca de senha, tokens.
const {
  app, request,
  resetData,
  readData,
  loginAs, loginVisitor,
  authHeader,
  TEST_PASSWORD,
} = require('./helpers');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'a'.repeat(48); // mesmo segredo que o helper injeta no boot

beforeEach(() => resetData());

describe('POST /api/login', () => {
  it('faz login com credenciais válidas e devolve token + user', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(10);
    expect(res.body.user).toBeTruthy();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('admin');
  });

  it('NÃO expõe passwordHash nem password no corpo de sucesso', async () => {
    const res = await request(app).post('/api/login').send({ username: 'aluno', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password');
    // rede extra: nada de hash na serialização inteira
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  it('senha errada → 401', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin', password: 'senhaerrada' });
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('token');
  });

  it('usuário inexistente → 401 (sem revelar que o usuário não existe)', async () => {
    const res = await request(app).post('/api/login').send({ username: 'naoexiste', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('token');
  });

  it('body vazio → 400', async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.status).toBe(400);
  });

  it('só username, sem password → 400', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/login/visitor', () => {
  it('cria id efêmero visitor-<hex>, role visitor', async () => {
    const res = await request(app).post('/api/login/visitor').send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.role).toBe('visitor');
    expect(res.body.user.id).toMatch(/^visitor-[0-9a-f]+$/);
  });

  it('NÃO grava o visitante em users.json', async () => {
    const before = readData('users.json').length;
    await request(app).post('/api/login/visitor').send({});
    await request(app).post('/api/login/visitor').send({});
    const after = readData('users.json').length;
    expect(after).toBe(before);
  });

  it('dois logins de visitante geram ids diferentes', async () => {
    const a = await request(app).post('/api/login/visitor').send({});
    const b = await request(app).post('/api/login/visitor').send({});
    expect(a.body.user.id).not.toBe(b.body.user.id);
  });
});

describe('GET /api/me', () => {
  it('com token válido devolve o usuário sem passwordHash', async () => {
    const token = await loginAs('aluno');
    const res = await request(app).get('/api/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('aluno');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('sem token → 401', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('token malformado → 401', async () => {
    const res = await request(app).get('/api/me').set(authHeader('lixo.nao.jwt'));
    expect(res.status).toBe(401);
  });

  it('token assinado com OUTRO segredo → 401', async () => {
    const forged = jwt.sign({ sub: '1', role: 'admin', username: 'admin' }, 'segredo-diferente-com-32-chars-xx', { expiresIn: '7d' });
    const res = await request(app).get('/api/me').set(authHeader(forged));
    expect(res.status).toBe(401);
  });

  it('token expirado (exp no passado, mesmo segredo) → 401', async () => {
    const expired = jwt.sign(
      { sub: '1', role: 'admin', username: 'admin', iat: Math.floor(Date.now() / 1000) - 100000, exp: Math.floor(Date.now() / 1000) - 10 },
      JWT_SECRET,
    );
    const res = await request(app).get('/api/me').set(authHeader(expired));
    expect(res.status).toBe(401);
  });

  it('visitante é reconstruído do token (não existe em users.json)', async () => {
    const token = await loginVisitor();
    const res = await request(app).get('/api/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('visitor');
    expect(res.body.user.id).toMatch(/^visitor-/);
  });

  it('token cujo sub aponta para usuário removido → 401', async () => {
    const forged = jwt.sign({ sub: '999', role: 'admin', username: 'fantasma' }, JWT_SECRET, { expiresIn: '7d' });
    const res = await request(app).get('/api/me').set(authHeader(forged));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/me/password', () => {
  it('troca a senha; login novo funciona e o antigo falha', async () => {
    const token = await loginAs('solo');
    const nova = 'novasenha123';
    const res = await request(app).post('/api/me/password').set(authHeader(token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: nova });
    expect(res.status).toBe(200);

    const login = await request(app).post('/api/login').send({ username: 'solo', password: nova });
    expect(login.status).toBe(200);

    const antigo = await request(app).post('/api/login').send({ username: 'solo', password: TEST_PASSWORD });
    expect(antigo.status).toBe(401);
  });

  it('senha atual errada → 401', async () => {
    const token = await loginAs('solo');
    const res = await request(app).post('/api/me/password').set(authHeader(token))
      .send({ currentPassword: 'errada', newPassword: 'novasenha123' });
    expect(res.status).toBe(401);
  });

  it('campos faltando → 400', async () => {
    const token = await loginAs('solo');
    const res = await request(app).post('/api/me/password').set(authHeader(token))
      .send({ currentPassword: TEST_PASSWORD });
    expect(res.status).toBe(400);
  });

  it('nova senha curta demais (<6) → 400', async () => {
    const token = await loginAs('solo');
    const res = await request(app).post('/api/me/password').set(authHeader(token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'abc' });
    expect(res.status).toBe(400);
  });

  it('visitante NÃO consegue trocar senha (não existe em users.json → 401)', async () => {
    const token = await loginVisitor();
    const res = await request(app).post('/api/me/password').set(authHeader(token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'novasenha123' });
    // O visitante não tem passwordHash → bcrypt.compare contra '' falha → 401.
    expect(res.status).toBe(401);
    // E nenhum usuário deve ganhar/perder senha por causa disso.
    expect(readData('users.json').every((u) => typeof u.passwordHash === 'string')).toBe(true);
  });

  it('sem token → 401', async () => {
    const res = await request(app).post('/api/me/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'novasenha123' });
    expect(res.status).toBe(401);
  });
});
