// Ranking + MMR via HTTP.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, loginVisitorFull, authHeader, makeLog,
} = require('./helpers');

beforeEach(() => resetData());

// Monta um mmr.json com um jogador maduro (n>=5) e MMR conhecido.
function maturedPlayer(P, n = 8) {
  return { P, n, W: Array.from({ length: Math.min(n, 20) }, () => ({ S_aj: P, D: 50, P })) };
}

describe('GET /api/ranking — listagem e filtros', () => {
  it('só lista jogadores com n > 0 no mmr.json', async () => {
    writeData('mmr.json', {
      players: {
        3: maturedPlayer(70),          // aluno, aparece
        6: { P: 55, n: 0, W: [] },     // solo, n=0 → fora
      },
      characters: {},
    });
    const aluno = await loginAs('aluno');
    const rank = (await request(app).get('/api/ranking').set(authHeader(aluno))).body;
    expect(rank.find((r) => r.userId === '3')).toBeTruthy();
    expect(rank.find((r) => r.userId === '6')).toBeUndefined();
  });

  it('ordena: calibrando vai pro FIM; entre maduros, MMR desc', async () => {
    // Só ALUNOS aqui. O ranking é segmentado por arena (D3), e professor/admin não
    // competem — ver o teste "só lista quem é da arena" abaixo.
    writeData('mmr.json', {
      players: {
        3: maturedPlayer(60, 8),       // aluno maduro, mmr 60
        5: maturedPlayer(90, 8),       // aluno maduro, mmr 90 (líder)
        6: { P: 80, n: 3, W: [] },     // aluno calibrando (n<5)
      },
      characters: {},
    });
    const admin = await loginAs('admin');
    const rank = (await request(app).get('/api/ranking').set(authHeader(admin))).body;
    const ids = rank.map((r) => r.userId);
    // maduros primeiro em MMR desc: 5(90) > 3(60); calibrando (6) por último.
    expect(ids).toEqual(['5', '3', '6']);
    expect(rank[rank.length - 1].calibrating).toBe(true);
  });

  // Regressão que a demanda #2 introduziu e a spec não previu: antes, o ranking
  // listava QUALQUER usuário com partidas — inclusive um professor que tivesse
  // jogado. Agora o filtro é por arena, e supervisor/admin não pertencem a nenhuma.
  it('só lista quem é da arena: professor com MMR NÃO aparece', async () => {
    writeData('mmr.json', {
      players: {
        2: maturedPlayer(99, 8),  // Professor A — não compete
        3: maturedPlayer(60, 8),  // Aluno A
      },
      characters: {},
    });
    const admin = await loginAs('admin');
    const rank = (await request(app).get('/api/ranking').set(authHeader(admin))).body;
    expect(rank.map((r) => r.userId)).toEqual(['3']);
  });

  it('cada linha tem o shape esperado; title é OBJETO ou null; mmr null na calibração', async () => {
    writeData('mmr.json', {
      players: {
        3: maturedPlayer(64, 8),       // maduro → mmr número
        6: { P: 80, n: 2, W: [] },     // calibrando → mmr null
      },
      characters: {},
    });
    const admin = await loginAs('admin');
    const rank = (await request(app).get('/api/ranking').set(authHeader(admin))).body;
    const aluno = rank.find((r) => r.userId === '3');
    const solo = rank.find((r) => r.userId === '6');

    for (const row of [aluno, solo]) {
      expect(Object.keys(row).sort()).toEqual(
        ['calibrating', 'matches', 'matchesRemaining', 'mmr', 'name', 'profilePhoto', 'role', 'title', 'userId'].sort(),
      );
      // title é objeto {id,title,tier} ou null — NUNCA string.
      expect(row.title === null || typeof row.title === 'object').toBe(true);
      expect(typeof row.title === 'string').toBe(false);
    }

    expect(typeof aluno.mmr).toBe('number');
    expect(aluno.mmr).toBe(64);
    expect(aluno.calibrating).toBe(false);
    expect(aluno.matches).toBe(8);

    expect(solo.mmr).toBeNull();
    expect(solo.calibrating).toBe(true);
    expect(solo.matchesRemaining).toBe(3);
  });

  // D3 — o coração da demanda #2: as duas arenas leem o MESMO mmr.json, mas cada uma
  // só enxerga os seus. Se este teste cair, um visitante está entrando no ranking dos
  // alunos (ou vice-versa).
  it('D3: aluno vê só alunos; visitante vê só visitantes', async () => {
    const v = await loginVisitorFull();
    writeData('mmr.json', {
      players: {
        3: maturedPlayer(60, 8),          // Aluno A
        5: maturedPlayer(90, 8),          // Aluno B
        [v.id]: maturedPlayer(99, 8),     // visitante — MMR altíssimo de propósito
      },
      characters: {},
    });

    const aluno = await loginAs('aluno');
    const rankAluno = (await request(app).get('/api/ranking').set(authHeader(aluno))).body;
    expect(rankAluno.map((r) => r.userId).sort()).toEqual(['3', '5']);
    // Mesmo liderando em MMR, o visitante não polui o ranking dos alunos.
    expect(rankAluno.find((r) => r.userId === v.id)).toBeUndefined();

    const rankVisitante = (await request(app).get('/api/ranking').set(authHeader(v.token))).body;
    expect(rankVisitante.map((r) => r.userId)).toEqual([v.id]);
    expect(rankVisitante[0].mmr).toBe(99);
  });

  it('título desbloqueado aparece RESOLVIDO (objeto {id,title,tier}) no ranking', async () => {
    // Dá ao aluno um activeTitle e um log que desbloqueia a conquista 'first_session'.
    const users = readData('users.json');
    const aluno = users.find((u) => u.id === '3');
    aluno.activeTitle = 'first_session';
    writeData('users.json', users);
    writeData('logs.json', [makeLog({ userId: '3', type: 'exercise', mode: 'training' })]);
    writeData('mmr.json', { players: { 3: maturedPlayer(70, 8) }, characters: {} });

    const admin = await loginAs('admin');
    const rank = (await request(app).get('/api/ranking').set(authHeader(admin))).body;
    const row = rank.find((r) => r.userId === '3');
    expect(row.title).toMatchObject({ id: 'first_session', tier: 'bronze' });
    expect(typeof row.title.title).toBe('string');
  });

  it('activeTitle inexistente/inválido → title null (não quebra)', async () => {
    const users = readData('users.json');
    users.find((u) => u.id === '3').activeTitle = 'titulo_que_nao_existe';
    writeData('users.json', users);
    writeData('mmr.json', { players: { 3: maturedPlayer(70, 8) }, characters: {} });
    const admin = await loginAs('admin');
    const rank = (await request(app).get('/api/ranking').set(authHeader(admin))).body;
    expect(rank.find((r) => r.userId === '3').title).toBeNull();
  });
});

describe('GET /api/me/mmr', () => {
  it('usuário sem partidas → calibrando, mmr null', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/me/mmr').set(authHeader(aluno));
    expect(res.status).toBe(200);
    expect(res.body.n).toBe(0);
    expect(res.body.calibrating).toBe(true);
    expect(res.body.mmr).toBeNull();
    expect(res.body.matchesRemaining).toBe(5);
  });

  it('usuário maduro → mmr numérico, calibrando false', async () => {
    writeData('mmr.json', { players: { 3: maturedPlayer(72, 8) }, characters: {} });
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/me/mmr').set(authHeader(aluno));
    expect(res.body.calibrating).toBe(false);
    expect(res.body.mmr).toBe(72);
  });

  // Demanda #2: o visitante tem MMR de verdade, igual ao aluno (o antigo
  // `{visitor:true}` de fachada morreu). O que o separa é a arena (D3), não o rating.
  it('visitante tem MMR REAL, igual ao aluno', async () => {
    const v = await loginVisitorFull();
    writeData('mmr.json', { players: { [v.id]: maturedPlayer(72, 8) }, characters: {} });
    const res = await request(app).get('/api/me/mmr').set(authHeader(v.token));
    expect(res.status).toBe(200);
    expect(res.body.mmr).toBe(72);
    expect(res.body.calibrating).toBe(false);
    expect(res.body.visitor).toBeUndefined(); // sem a flag de fachada
  });

  it('visitante novo entra calibrando (como qualquer aluno)', async () => {
    const v = await loginVisitor();
    const res = await request(app).get('/api/me/mmr').set(authHeader(v));
    expect(res.body.calibrating).toBe(true);
    expect(res.body.mmr).toBeNull();
  });
});

describe('POST /api/admin/ranking/reset', () => {
  it('zera score/criteriaScores de TODOS os logs, PRESERVA os logs e o mmr.json, limpa progress', async () => {
    // Estado: logs com notas, progresso e um mmr.json não trivial.
    writeData('logs.json', [
      makeLog({ userId: '3', type: 'exercise', score: 20, criteriaScores: { a: 1 } }),
      makeLog({ userId: '3', type: 'freeplay', score: 15, criteriaScores: { b: 2 } }),
      makeLog({ userId: '5', type: 'freeplay', score: 9, criteriaScores: null }),
    ]);
    writeData('progress.json', { 3: { skill1: true }, 5: { skill2: true } });
    const mmrBefore = { players: { 3: maturedPlayer(70, 8), 5: maturedPlayer(60, 6) }, characters: { 'fp-test-1': { D: 44, n_D: 3 } } };
    writeData('mmr.json', mmrBefore);

    const admin = await loginAs('admin');
    const res = await request(app).post('/api/admin/ranking/reset').set(authHeader(admin));
    expect(res.status).toBe(200);

    const logsAfter = readData('logs.json');
    expect(logsAfter.length).toBe(3);                      // logs preservados (mesma quantidade)
    for (const l of logsAfter) {
      expect(l.score).toBeNull();
      expect(l.criteriaScores).toBeNull();
    }
    // demais campos do log intactos (não apagou a sessão)
    expect(logsAfter.every((l) => Array.isArray(l.messages))).toBe(true);

    expect(readData('progress.json')).toEqual({});         // progresso limpo
    expect(readData('mmr.json')).toEqual(mmrBefore);       // MMR intacto
  });

  it('403 para supervisor e aluno; só admin reseta', async () => {
    writeData('logs.json', [makeLog({ userId: '3', score: 20 })]);
    for (const who of ['prof', 'aluno']) {
      const token = await loginAs(who);
      const res = await request(app).post('/api/admin/ranking/reset').set(authHeader(token));
      expect(res.status).toBe(403);
    }
    // o log seguiu com a nota (nada foi resetado)
    expect(readData('logs.json')[0].score).toBe(20);
  });

  it('403 para visitante', async () => {
    const v = await loginVisitor();
    const res = await request(app).post('/api/admin/ranking/reset').set(authHeader(v));
    expect(res.status).toBe(403);
  });
});
