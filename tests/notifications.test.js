// Notificações in-app: leitura por usuário, exclusão do visitante, marcar-como-lida
// (só a própria) e read-all. Notificações são chaveadas por userId em notifications.json.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

// Formato real (ver pushNotification no server): notifications.json é um objeto
// { userId: [ { id, createdAt, read, ...notif } ] }.
function seedNotif(userId, list) {
  const all = readData('notifications.json');
  all[userId] = list;
  writeData('notifications.json', all);
}
function notif(id, over = {}) {
  return { id, createdAt: new Date().toISOString(), read: false, type: 'duel_result', title: 'x', ...over };
}

describe('GET /api/notifications', () => {
  it('devolve as notificações do próprio usuário com contagem de não lidas', async () => {
    seedNotif('3', [notif('n1'), notif('n2', { read: true }), notif('n3')]);
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/notifications').set(authHeader(aluno));
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
    expect(res.body.unread).toBe(2);
  });

  it('usuário sem notificações -> lista vazia', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/notifications').set(authHeader(aluno));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.unread).toBe(0);
  });

  it('não vaza notificações de outro usuário', async () => {
    seedNotif('5', [notif('n-do-5', { title: 'privado do 5' })]);
    const aluno3 = await loginAs('aluno'); // id 3
    const res = await request(app).get('/api/notifications').set(authHeader(aluno3));
    expect(res.body.items).toEqual([]);
  });

  it('visitante -> sempre vazio', async () => {
    const visit = await loginVisitor();
    const res = await request(app).get('/api/notifications').set(authHeader(visit));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.unread).toBe(0);
  });
});

describe('pushNotification pula o visitante (via fluxo de duelo)', () => {
  it('convite de duelo por sistema gera notificação para o oponente real', async () => {
    // 3 e 5 são ambos therapist; 3 desafia 5.
    const aluno3 = await loginAs('aluno');
    const create = await request(app).post('/api/duel').set(authHeader(aluno3)).send({
      characterId: 'fp-test-1', opponentUserId: '5', inviteMethod: 'system', mode: 'training',
    });
    expect(create.status).toBe(200);

    const all = readData('notifications.json');
    expect(Array.isArray(all['5'])).toBe(true);
    expect(all['5'].length).toBe(1);
    expect(all['5'][0].type).toBe('duel_invite');

    // E o oponente enxerga via GET.
    const aluno5 = await loginAs('aluno2');
    const res = await request(app).get('/api/notifications').set(authHeader(aluno5));
    expect(res.body.items.length).toBe(1);
    expect(res.body.unread).toBe(1);
  });

  it('visitante não é gravado em notifications.json (chave visitor-* pulada)', async () => {
    // pushNotification descarta qualquer userId que comece com "visitor-".
    // Confirmamos que nenhuma chave desse tipo aparece após um convite normal.
    const aluno3 = await loginAs('aluno');
    await request(app).post('/api/duel').set(authHeader(aluno3)).send({
      characterId: 'fp-test-1', opponentUserId: '5', inviteMethod: 'system', mode: 'training',
    });
    const all = readData('notifications.json');
    expect(Object.keys(all).some((k) => k.startsWith('visitor-'))).toBe(false);
  });
});

describe('POST /api/notifications/:id/read', () => {
  it('marca só a notificação do próprio usuário', async () => {
    seedNotif('3', [notif('n1'), notif('n2')]);
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/notifications/n1/read').set(authHeader(aluno));
    expect(res.status).toBe(200);

    const all = readData('notifications.json');
    expect(all['3'].find((n) => n.id === 'n1').read).toBe(true);
    expect(all['3'].find((n) => n.id === 'n2').read).toBe(false);
  });

  it('marcar a notificação de OUTRO usuário não a afeta', async () => {
    seedNotif('3', []);
    seedNotif('5', [notif('n-do-5')]);
    const aluno3 = await loginAs('aluno');
    // 3 tenta marcar n-do-5 (que está sob a chave do 5): opera só na lista do 3.
    const res = await request(app).post('/api/notifications/n-do-5/read').set(authHeader(aluno3));
    expect(res.status).toBe(200);

    const all = readData('notifications.json');
    expect(all['5'][0].read).toBe(false); // intocada
  });

  it('id inexistente -> 200 (no-op)', async () => {
    seedNotif('3', [notif('n1')]);
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/notifications/nao-existe/read').set(authHeader(aluno));
    expect(res.status).toBe(200);
    const all = readData('notifications.json');
    expect(all['3'][0].read).toBe(false);
  });

  it('visitante -> 200 sem efeito', async () => {
    const visit = await loginVisitor();
    const res = await request(app).post('/api/notifications/qualquer/read').set(authHeader(visit));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/notifications/read-all', () => {
  it('marca todas as do próprio usuário como lidas', async () => {
    seedNotif('3', [notif('n1'), notif('n2'), notif('n3')]);
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/notifications/read-all').set(authHeader(aluno));
    expect(res.status).toBe(200);

    const all = readData('notifications.json');
    expect(all['3'].every((n) => n.read)).toBe(true);
  });

  it('não afeta as de outro usuário', async () => {
    seedNotif('3', [notif('n1')]);
    seedNotif('5', [notif('n-do-5')]);
    const aluno3 = await loginAs('aluno');
    await request(app).post('/api/notifications/read-all').set(authHeader(aluno3));

    const all = readData('notifications.json');
    expect(all['5'][0].read).toBe(false);
  });

  it('read-all seguido de GET zera o unread', async () => {
    seedNotif('3', [notif('n1'), notif('n2')]);
    const aluno = await loginAs('aluno');
    await request(app).post('/api/notifications/read-all').set(authHeader(aluno));
    const res = await request(app).get('/api/notifications').set(authHeader(aluno));
    expect(res.body.unread).toBe(0);
  });
});

describe('Autenticação', () => {
  it('sem token -> 401', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });
});
