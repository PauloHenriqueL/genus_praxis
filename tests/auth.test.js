// tests/auth.test.js — autenticação: login, visitante, /api/me, troca de senha, tokens.
const {
  app, request,
  resetData,
  readData, writeData,
  loginAs, loginVisitor, visitorPayload,
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

// Demanda #1: o visitante deixou de ser efêmero. Agora é um usuário REAL em
// users.json, com nome/e-mail/telefone obrigatórios e únicos — e SEM senha (D1).
describe('POST /api/login/visitor — cadastro', () => {
  const post = (body) => request(app).post('/api/login/visitor').send(body);

  it('cadastra o visitante e GRAVA em users.json', async () => {
    const before = readData('users.json').length;
    const res = await post(visitorPayload());
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.role).toBe('visitor');
    expect(readData('users.json').length).toBe(before + 1);
  });

  it('guarda nome, e-mail e telefone', async () => {
    const p = visitorPayload({ name: 'Maria Lead', email: 'Maria@Lead.COM', phone: '(11) 91234-5678' });
    const res = await post(p);
    expect(res.status).toBe(200);
    const saved = readData('users.json').find((u) => u.id === res.body.user.id);
    expect(saved.name).toBe('Maria Lead');
    expect(saved.email).toBe('maria@lead.com');   // normalizado
    expect(saved.phone).toBe('11912345678');      // só dígitos
  });

  it('NUNCA grava senha para o visitante (D1: não tem senha)', async () => {
    const res = await post(visitorPayload());
    const saved = readData('users.json').find((u) => u.id === res.body.user.id);
    expect(saved.passwordHash).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('os três campos são obrigatórios', async () => {
    for (const faltando of ['name', 'email', 'phone']) {
      const p = visitorPayload();
      delete p[faltando];
      const res = await post(p);
      expect(res.status).toBe(400);
      expect(res.body.fields.some((f) => f.field === faltando)).toBe(true);
    }
  });

  // D2: o telefone aceita o que o lead digitar — o objetivo é ele conseguir entrar.
  it('aceita telefone com máscara, com DDD e com +55', async () => {
    for (const phone of ['(11) 91234-0001', '11 91234-0002', '+55 11 91234-0003', '5511912340004']) {
      const res = await post(visitorPayload({ phone }));
      expect(res.status, `falhou para ${phone}`).toBe(200);
    }
  });

  it('recusa telefone que não parece brasileiro', async () => {
    for (const phone of ['123', '912345678', 'abc']) {
      const res = await post(visitorPayload({ phone }));
      expect(res.status).toBe(400);
    }
  });

  it('recusa e-mail inválido', async () => {
    for (const email of ['semarroba.com', 'a@b', '']) {
      const res = await post(visitorPayload({ email }));
      expect(res.status).toBe(400);
    }
  });

  // Sem senha, informar os dados JÁ é o login (D1).
  it('mesmo e-mail + telefone → volta para a MESMA conta (não duplica)', async () => {
    const p = visitorPayload();
    const a = await post(p);
    const before = readData('users.json').length;
    const b = await post(p);
    expect(b.status).toBe(200);
    expect(b.body.user.id).toBe(a.body.user.id);
    expect(readData('users.json').length).toBe(before); // não criou outro
  });

  it('e-mail já usado por OUTRO cadastro → 409', async () => {
    const p1 = visitorPayload();
    await post(p1);
    const p2 = visitorPayload({ email: p1.email }); // mesmo e-mail, telefone/nome novos
    const res = await post(p2);
    expect(res.status).toBe(409);
    expect(res.body.field).toBe('email');
  });

  it('telefone já usado → 409', async () => {
    const p1 = visitorPayload();
    await post(p1);
    const res = await post(visitorPayload({ phone: p1.phone }));
    expect(res.status).toBe(409);
    expect(res.body.field).toBe('phone');
  });

  it('nome já usado → 409', async () => {
    const p1 = visitorPayload();
    await post(p1);
    const res = await post(visitorPayload({ name: p1.name }));
    expect(res.status).toBe(409);
    expect(res.body.field).toBe('name');
  });

  // Um visitante não pode "assumir" o e-mail de um aluno existente.
  it('não deixa o visitante roubar o e-mail de um aluno', async () => {
    const users = readData('users.json');
    const aluno = users.find((u) => u.username === 'aluno');
    aluno.email = 'aluno@escola.com';
    writeData('users.json', users);

    const res = await post(visitorPayload({ email: 'aluno@escola.com' }));
    expect(res.status).toBe(409);
    expect(res.body.field).toBe('email');
  });

  it('dois visitantes distintos têm ids distintos', async () => {
    const a = await post(visitorPayload());
    const b = await post(visitorPayload());
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

  // Demanda #1: o visitante agora é lido do users.json como qualquer outro papel —
  // não é mais reconstruído do token. É isso que vai permitir barrar um visitante
  // expirado (demanda #8) mesmo com o JWT ainda válido.
  it('visitante é lido do users.json (não do token)', async () => {
    const token = await loginVisitor();
    const res = await request(app).get('/api/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('visitor');

    // Existe mesmo no disco, e com os dados do cadastro.
    const saved = readData('users.json').find((u) => u.id === res.body.user.id);
    expect(saved).toBeTruthy();
    expect(saved.email).toBeTruthy();
    expect(saved.phone).toBeTruthy();
  });

  it('visitante removido do users.json → 401 (o token sozinho não basta)', async () => {
    const token = await loginVisitor();
    const me = await request(app).get('/api/me').set(authHeader(token));
    const id = me.body.user.id;

    writeData('users.json', readData('users.json').filter((u) => u.id !== id));

    const res = await request(app).get('/api/me').set(authHeader(token));
    expect(res.status).toBe(401);
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

  // O visitante existe em users.json (demanda #1), mas NÃO tem senha (D1) — então
  // continua sem conseguir trocar senha: bcrypt.compare contra '' falha → 401.
  it('visitante NÃO consegue trocar senha (não tem senha → 401)', async () => {
    const token = await loginVisitor();
    const res = await request(app).post('/api/me/password').set(authHeader(token))
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'novasenha123' });
    expect(res.status).toBe(401);

    // A tentativa não pode ter CRIADO uma senha para o visitante.
    const visitante = readData('users.json').find((u) => u.role === 'visitor');
    expect(visitante.passwordHash).toBeUndefined();

    // E nenhum usuário com senha pode tê-la perdido.
    const comSenha = readData('users.json').filter((u) => u.role !== 'visitor');
    expect(comSenha.every((u) => typeof u.passwordHash === 'string')).toBe(true);
  });

  it('sem token → 401', async () => {
    const res = await request(app).post('/api/me/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'novasenha123' });
    expect(res.status).toBe(401);
  });
});
