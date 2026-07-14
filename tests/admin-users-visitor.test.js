// O admin gerenciando VISITANTES (demanda #6) — e a conversão de lead em aluno.
//
// A #6 é "trivial" no papel (a lista já existia; a #1 passou a persistir o visitante com
// e-mail e telefone). Mas ao ligar a tela apareceram dois bugs REAIS, ambos travados aqui:
//
//   1. Editar um visitante devolvia 400 "Função inválida" — `visitor` não está em
//      VALID_ROLES, e o PUT validava o papel do merge sem considerar quem já era visitante.
//   2. Promover um visitante a aluno criava uma CONTA MORTA: ele entra sem senha (D1), e
//      sem `passwordHash` o login por senha nunca autentica — mas ele também deixava de
//      ser `role: 'visitor'`, então o login de visitante não o recuperava mais. A pessoa
//      perdia as DUAS portas de entrada, em silêncio.
const {
  app, request, resetData, readData,
  loginAs, loginVisitorFull, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

const putUser = (token, id, body) =>
  request(app).put(`/api/admin/users/${id}`).set(authHeader(token)).send(body);

describe('GET /api/admin/users — o admin enxerga os leads', () => {
  it('o visitante aparece na lista, com e-mail e telefone', async () => {
    const v = await loginVisitorFull({ name: 'Lead Um', email: 'lead@x.com', phone: '11912345678' });
    const admin = await loginAs('admin');

    const res = await request(app).get('/api/admin/users').set(authHeader(admin));
    expect(res.status).toBe(200);

    const lead = res.body.find((u) => u.id === v.id);
    expect(lead).toBeTruthy();
    expect(lead.role).toBe('visitor');
    expect(lead.email).toBe('lead@x.com');
    expect(lead.phone).toBe('11912345678'); // guardado só com os dígitos
  });

  it('o hash de senha NUNCA sai na lista (nem o dos que têm)', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).get('/api/admin/users').set(authHeader(admin));
    for (const u of res.body) {
      expect(u.passwordHash, u.username).toBeUndefined();
      expect(u.password, u.username).toBeUndefined();
    }
  });

  // O telefone é dado pessoal: só quem já podia ver o usuário deve vê-lo. O ranking e a
  // lista de oponentes montam objetos próprios (userId/name/foto) e não passam por
  // `publicUser` — este teste trava isso, porque um `...u` distraído vazaria o telefone
  // para os colegas de turma.
  it('o telefone NÃO vaza no ranking nem na lista de oponentes', async () => {
    const v = await loginVisitorFull({ phone: '11987654321' });
    const aluno = await loginAs('aluno');

    const ranking = await request(app).get('/api/ranking').set(authHeader(aluno));
    const oponentes = await request(app).get('/api/duel/opponents').set(authHeader(aluno));

    expect(JSON.stringify(ranking.body)).not.toContain('11987654321');
    expect(JSON.stringify(oponentes.body)).not.toContain('11987654321');
    expect(v.user.phone).toBe('11987654321'); // (existe mesmo — o teste não é vazio)
  });

  it('aluno não lista usuários (rota é de admin)', async () => {
    const aluno = await loginAs('aluno');
    expect((await request(app).get('/api/admin/users').set(authHeader(aluno))).status).toBe(403);
  });
});

describe('PUT /api/admin/users/:id — editar um visitante', () => {
  it('editar mantendo `visitor` funciona (antes: 400 "Função inválida")', async () => {
    const v = await loginVisitorFull({ name: 'Lead Um', email: 'lead@x.com', phone: '11912345678' });
    const admin = await loginAs('admin');

    const res = await putUser(admin, v.id, {
      name: 'Lead Renomeado', username: v.user.username, role: 'visitor', email: 'lead@x.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Lead Renomeado');
    // O client não manda `phone`, e o PUT faz merge — o telefone tem que sobreviver.
    expect(res.body.phone).toBe('11912345678');
  });

  // Ninguém é PROMOVIDO a visitante: essa conta só nasce do cadastro público (demanda #1).
  it('promover um ALUNO a visitante → 400 (visitor não é um papel atribuível)', async () => {
    const admin = await loginAs('admin');
    const res = await putUser(admin, '3', { role: 'visitor' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/função inválida/i);
    expect(readData('users.json').find((u) => u.id === '3').role).toBe('therapist');
  });
});

describe('converter um lead em conta com login', () => {
  it('promover SEM senha → 400 (senão vira conta morta, sem porta de entrada)', async () => {
    const v = await loginVisitorFull();
    const admin = await loginAs('admin');

    const res = await putUser(admin, v.id, { username: 'lead1', role: 'therapist' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('password'); // o form destaca o campo certo
    expect(res.body.error).toMatch(/senha/i);

    // E nada foi gravado pela metade.
    const gravado = readData('users.json').find((u) => u.id === v.id);
    expect(gravado.role).toBe('visitor');
  });

  it('promover COM senha → converte, preserva o telefone e a pessoa CONSEGUE logar', async () => {
    const v = await loginVisitorFull({ phone: '11912345678' });
    const admin = await loginAs('admin');

    const res = await putUser(admin, v.id, {
      username: 'lead1', name: 'Lead', role: 'therapist', password: 'lead123456',
    });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('therapist');
    expect(res.body.phone).toBe('11912345678'); // o dado do lead não se perde

    // A prova real: a porta de entrada nova funciona.
    const login = await request(app).post('/api/login').send({ username: 'lead1', password: 'lead123456' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('therapist');
  });

  it('convertido deixa de ser recuperável pelo cadastro de visitante', async () => {
    // Antes da conversão, reentrar com os mesmos dados devolve a MESMA conta (demanda #1).
    const payload = { name: 'Lead Dois', email: 'lead2@x.com', phone: '11955554444' };
    const v = await loginVisitorFull(payload);
    const admin = await loginAs('admin');

    await putUser(admin, v.id, { username: 'lead2', role: 'therapist', password: 'lead123456' });

    // Depois: o e-mail agora pertence a um ALUNO, então o cadastro de visitante colide (409)
    // em vez de "recuperar" a conta e rebaixá-la de volta.
    const res = await request(app).post('/api/login/visitor').send(payload);
    expect(res.status).toBe(409);
    expect(readData('users.json').find((u) => u.id === v.id).role).toBe('therapist');
  });
});
