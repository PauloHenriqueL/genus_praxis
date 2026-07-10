// Gamificação: streak, missões diárias, conquistas, títulos.
// GET /api/gamification/:userId e POST /api/me/title.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, authHeader, makeLog,
} = require('./helpers');

beforeEach(() => resetData());

// Log de exercício (o makeLog do helper é freeplay por padrão).
function exLog(over = {}) {
  return makeLog({ type: 'exercise', itemId: 'ex-test-1', itemTitle: 'Exercício 1', ...over });
}

function gami(token, userId) {
  return request(app).get(`/api/gamification/${userId}`).set(authHeader(token));
}

describe('GET /api/gamification/:userId — estrutura e ausência de neuro', () => {
  it('retorna as chaves streak, dailyMissions, achievements, stats', async () => {
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('streak');
    expect(res.body).toHaveProperty('dailyMissions');
    expect(res.body).toHaveProperty('achievements');
    expect(res.body).toHaveProperty('stats');
  });

  it('a chave é dailyMissions (não "missions")', async () => {
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.body.missions).toBeUndefined();
    expect(Array.isArray(res.body.dailyMissions)).toBe(true);
  });

  it('achievements tem exatamente 19 itens, nenhum de neuro', async () => {
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.body.achievements).toHaveLength(19);
    for (const a of res.body.achievements) {
      expect(String(a.id)).not.toContain('neuro');
    }
  });

  it('dailyMissions tem exatamente 3, nenhum daily_neuro', async () => {
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.body.dailyMissions).toHaveLength(3);
    for (const m of res.body.dailyMissions) {
      expect(String(m.id)).not.toContain('neuro');
    }
  });

  it('stats não tem totalNeuro; tem as chaves esperadas', async () => {
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.body.stats).not.toHaveProperty('totalNeuro');
    expect(res.body.stats).toHaveProperty('totalSessions');
    expect(res.body.stats).toHaveProperty('totalExercise');
    expect(res.body.stats).toHaveProperty('totalFreeplay');
    expect(res.body.stats).toHaveProperty('averageScore');
    expect(res.body.stats).toHaveProperty('bestScore');
  });

  it('IDOR: aluno 3 pedindo /api/gamification/5 -> 403', async () => {
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '5');
    expect(res.status).toBe(403);
  });

  it('aluno pode ver a própria gamificação (3 -> 3)', async () => {
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.status).toBe(200);
  });

  it('professor vê a gamificação de aluno vinculado (2 -> 3)', async () => {
    const prof = await loginAs('prof');
    const res = await gami(prof, '3');
    expect(res.status).toBe(200);
  });

  it('professor NÃO vê aluno de outro professor (2 -> 5) -> 403', async () => {
    const prof = await loginAs('prof');
    const res = await gami(prof, '5');
    expect(res.status).toBe(403);
  });

  it('admin vê qualquer aluno', async () => {
    const admin = await loginAs('admin');
    const res = await gami(admin, '5');
    expect(res.status).toBe(200);
  });
});

describe('stats derivados dos logs', () => {
  it('conta sessões, exercício e freeplay separadamente', async () => {
    writeData('logs.json', [
      exLog(), exLog({ itemId: 'ex-test-2' }),
      makeLog(), // freeplay
    ]);
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.body.stats.totalSessions).toBe(3);
    expect(res.body.stats.totalExercise).toBe(2);
    expect(res.body.stats.totalFreeplay).toBe(1);
  });

  it('averageScore e bestScore ignoram scores não numéricos', async () => {
    writeData('logs.json', [
      makeLog({ score: 10 }), makeLog({ score: 20 }), makeLog({ score: null }),
    ]);
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.body.stats.averageScore).toBe(15);
    expect(res.body.stats.bestScore).toBe(20);
  });

  it('sem scores válidos -> averageScore e bestScore null', async () => {
    writeData('logs.json', [makeLog({ score: null })]);
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    expect(res.body.stats.averageScore).toBeNull();
    expect(res.body.stats.bestScore).toBeNull();
  });
});

describe('streak', () => {
  const streakOf = async (logs) => {
    writeData('logs.json', logs);
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    return res.body.streak;
  };

  it('sem logs -> current 0, isAlive false, status none', async () => {
    const s = await streakOf([]);
    expect(s.current).toBe(0);
    expect(s.isAlive).toBe(false);
    expect(s.status).toBe('none');
  });

  it('log de hoje -> current 1, isAlive true, status active', async () => {
    const s = await streakOf([makeLog({ daysAgo: 0 })]);
    expect(s.current).toBe(1);
    expect(s.isAlive).toBe(true);
    expect(s.status).toBe('active');
  });

  it('hoje + ontem + anteontem -> current 3', async () => {
    const s = await streakOf([
      makeLog({ daysAgo: 0 }), makeLog({ daysAgo: 1 }), makeLog({ daysAgo: 2 }),
    ]);
    expect(s.current).toBe(3);
  });

  it('log só de ontem (não hoje) -> isAlive true, current 1 (a streak sobrevive um dia)', async () => {
    const s = await streakOf([makeLog({ daysAgo: 1 })]);
    expect(s.isAlive).toBe(true);
    expect(s.current).toBe(1);
  });

  it('gap de 2 dias quebra a streak (hoje + há 3 dias -> current 1)', async () => {
    const s = await streakOf([makeLog({ daysAgo: 0 }), makeLog({ daysAgo: 3 })]);
    expect(s.current).toBe(1);
  });

  it('dois logs no MESMO dia contam como 1 dia', async () => {
    const s = await streakOf([makeLog({ daysAgo: 0 }), makeLog({ daysAgo: 0 })]);
    expect(s.current).toBe(1);
  });

  it('longest guarda o recorde mesmo quando a atual é menor', async () => {
    // Bloco antigo de 4 dias (5..8 atrás), depois quebra, depois só hoje.
    const s = await streakOf([
      makeLog({ daysAgo: 8 }), makeLog({ daysAgo: 7 }),
      makeLog({ daysAgo: 6 }), makeLog({ daysAgo: 5 }),
      makeLog({ daysAgo: 0 }),
    ]);
    expect(s.current).toBe(1);
    expect(s.longest).toBe(4);
  });

  it('status weekly a partir de 7 dias consecutivos', async () => {
    const logs = [];
    for (let d = 0; d < 7; d++) logs.push(makeLog({ daysAgo: d }));
    const s = await streakOf(logs);
    expect(s.current).toBe(7);
    expect(s.status).toBe('weekly');
  });

  it('status monthly a partir de 30 dias consecutivos', async () => {
    const logs = [];
    for (let d = 0; d < 30; d++) logs.push(makeLog({ daysAgo: d }));
    const s = await streakOf(logs);
    expect(s.current).toBe(30);
    expect(s.status).toBe('monthly');
  });
});

describe('conquistas (achievements)', () => {
  const earnedIds = async (logs, userId = '3', username = 'aluno') => {
    writeData('logs.json', logs);
    const token = await loginAs(username);
    const res = await gami(token, userId);
    return new Set(res.body.achievements.filter((a) => a.earned).map((a) => a.id));
  };

  it('nenhum log -> nenhuma conquista', async () => {
    const e = await earnedIds([]);
    expect(e.size).toBe(0);
  });

  it('first_session com 1 log', async () => {
    const e = await earnedIds([makeLog()]);
    expect(e.has('first_session')).toBe(true);
  });

  it('polivalente: exercício E simulação no MESMO dia', async () => {
    const e = await earnedIds([
      exLog({ daysAgo: 0 }), makeLog({ daysAgo: 0 }),
    ]);
    expect(e.has('polivalente')).toBe(true);
  });

  it('polivalente NÃO conta se em dias diferentes', async () => {
    const e = await earnedIds([
      exLog({ daysAgo: 0 }), makeLog({ daysAgo: 1 }),
    ]);
    expect(e.has('polivalente')).toBe(false);
  });

  it('all_difficulties: exige exercício iniciante + intermediario + avancado', async () => {
    const e = await earnedIds([
      exLog({ difficulty: 'iniciante' }),
      exLog({ itemId: 'ex-test-2', difficulty: 'intermediario' }),
      exLog({ itemId: 'ex-test-3', difficulty: 'avancado' }),
    ]);
    expect(e.has('all_difficulties')).toBe(true);
  });

  it('all_difficulties NÃO com só duas dificuldades', async () => {
    const e = await earnedIds([
      exLog({ difficulty: 'iniciante' }),
      exLog({ itemId: 'ex-test-2', difficulty: 'intermediario' }),
    ]);
    expect(e.has('all_difficulties')).toBe(false);
  });

  it('high_score: score >= 25 desbloqueia', async () => {
    const e = await earnedIds([makeLog({ score: 25 })]);
    expect(e.has('high_score')).toBe(true);
  });

  it('high_score: score 24 NÃO desbloqueia (threshold é 25)', async () => {
    const e = await earnedIds([makeLog({ score: 24 })]);
    expect(e.has('high_score')).toBe(false);
  });

  it('speed_demon: < 300s e score > 0', async () => {
    const e = await earnedIds([makeLog({ durationSeconds: 200, score: 5 })]);
    expect(e.has('speed_demon')).toBe(true);
  });

  it('streak_7_ever com 7 dias consecutivos', async () => {
    const logs = [];
    for (let d = 0; d < 7; d++) logs.push(makeLog({ daysAgo: d }));
    const e = await earnedIds(logs);
    expect(e.has('streak_7_ever')).toBe(true);
    expect(e.has('streak_30_ever')).toBe(false);
  });

  it('streak_30_ever com 30 dias consecutivos', async () => {
    const logs = [];
    for (let d = 0; d < 30; d++) logs.push(makeLog({ daysAgo: d }));
    const e = await earnedIds(logs);
    expect(e.has('streak_30_ever')).toBe(true);
  });

  it('highlights_10: 10 mensagens destacadas', async () => {
    const msgs = [];
    for (let i = 0; i < 10; i++) msgs.push({ role: 'user', content: 'x', highlighted: true });
    const e = await earnedIds([makeLog({ messages: msgs })]);
    expect(e.has('highlights_10')).toBe(true);
  });

  it('simulacao_complete: todos os freeplay concluídos', async () => {
    const e = await earnedIds([
      makeLog({ itemId: 'fp-test-1' }),
      makeLog({ itemId: 'fp-test-2' }),
    ]);
    expect(e.has('simulacao_complete')).toBe(true);
  });

  it('trilha_skill_1: todos os exercícios da skill 1 (ex-test-1 é skill 1)', async () => {
    const e = await earnedIds([exLog({ itemId: 'ex-test-1' })]);
    expect(e.has('trilha_skill_1')).toBe(true);
  });

  it('centena: 100 sessões', async () => {
    const logs = [];
    for (let i = 0; i < 100; i++) logs.push(makeLog({ id: 'log-' + i }));
    const e = await earnedIds(logs);
    expect(e.has('centena')).toBe(true);
  });
});

describe('earnedAt e persistência', () => {
  it('earnedAt presente só nas desbloqueadas', async () => {
    writeData('logs.json', [makeLog()]);
    const aluno = await loginAs('aluno');
    const res = await gami(aluno, '3');
    const first = res.body.achievements.find((a) => a.id === 'first_session');
    const centena = res.body.achievements.find((a) => a.id === 'centena');
    expect(first.earned).toBe(true);
    expect(first.earnedAt).toBeTruthy();
    expect(centena.earned).toBe(false);
    expect(centena.earnedAt).toBeNull();
  });

  it('persiste a data em achievements.json', async () => {
    writeData('logs.json', [makeLog()]);
    const aluno = await loginAs('aluno');
    await gami(aluno, '3');
    const ach = readData('achievements.json');
    expect(ach['3']).toBeTruthy();
    expect(ach['3'].first_session).toBeTruthy();
  });
});

describe('POST /api/me/title', () => {
  const setTitle = (token, titleId) =>
    request(app).post('/api/me/title').set(authHeader(token)).send({ titleId });

  it('título não desbloqueado -> 403', async () => {
    const aluno = await loginAs('aluno');
    const res = await setTitle(aluno, 'centena');
    expect(res.status).toBe(403);
  });

  it('título desbloqueado -> 200 e grava activeTitle', async () => {
    writeData('logs.json', [makeLog()]);
    const aluno = await loginAs('aluno');
    const res = await setTitle(aluno, 'first_session');
    expect(res.status).toBe(200);
    const users = readData('users.json');
    expect(users.find((u) => u.id === '3').activeTitle).toBe('first_session');
  });

  it("titleId '' remove a chave activeTitle", async () => {
    writeData('logs.json', [makeLog()]);
    const aluno = await loginAs('aluno');
    await setTitle(aluno, 'first_session');
    const res = await setTitle(aluno, '');
    expect(res.status).toBe(200);
    const users = readData('users.json');
    expect('activeTitle' in users.find((u) => u.id === '3')).toBe(false);
  });

  it('visitante -> 403', async () => {
    const v = await loginVisitor();
    const res = await setTitle(v, 'first_session');
    expect(res.status).toBe(403);
  });

  it('depois de setar, GET /api/me traz activeTitle', async () => {
    writeData('logs.json', [makeLog()]);
    const aluno = await loginAs('aluno');
    await setTitle(aluno, 'first_session');
    const me = await request(app).get('/api/me').set(authHeader(aluno));
    expect(me.body.user.activeTitle).toBe('first_session');
  });
});
