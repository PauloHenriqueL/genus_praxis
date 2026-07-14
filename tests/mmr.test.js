// IMPORTANTE: helpers seta as envs antes de importar o app — manter como 1º require.
const { app, request, resetData, loginAs, loginVisitor, loginVisitorFull, readData, authHeader } = require('./helpers');
const mmr = require('../server/mmr');

describe('MMR engine — construtores e clamp', () => {
  it('newPlayer() é o estado inicial { P:P0, n:0, W:[] }', () => {
    expect(mmr.newPlayer()).toEqual({ P: mmr.P0, n: 0, W: [] });
    expect(mmr.P0).toBe(50);
  });

  it('newCharacter() é { D:D0, n_D:0, alpha:null, beta:null, history:[] }', () => {
    expect(mmr.newCharacter()).toEqual({ D: mmr.D0, n_D: 0, alpha: null, beta: null, history: [] });
    expect(mmr.D0).toBe(50);
  });

  it('clamp respeita os limites (dentro, abaixo, acima)', () => {
    expect(mmr.clamp(50, 10, 90)).toBe(50);
    expect(mmr.clamp(5, 10, 90)).toBe(10);
    expect(mmr.clamp(200, 10, 90)).toBe(90);
    expect(mmr.clamp(10, 10, 90)).toBe(10);   // borda inferior
    expect(mmr.clamp(90, 10, 90)).toBe(90);   // borda superior
  });
});

describe('expectedScore', () => {
  it('cold start usa a fórmula provisória 50 + 0,5·(P−D)', () => {
    const p = { P: 70 };
    const c = mmr.newCharacter(); // n_D=0, cold start
    c.D = 80;
    expect(mmr.expectedScore(p, c)).toBeCloseTo(50 + 0.5 * (70 - 80), 6); // 45
  });

  it('fase madura usa a regressão (alpha + beta·gap) só com n_D ≥ 20 e coef finitos', () => {
    const p = { P: 70 };
    const c = { D: 80, n_D: 25, alpha: 52, beta: 0.45, history: [] };
    expect(mmr.expectedScore(p, c)).toBeCloseTo(47.5, 6);
    // sem coeficientes ainda → cai no cold start mesmo com n_D alto
    const c2 = { D: 80, n_D: 25, alpha: null, beta: null, history: [] };
    expect(mmr.expectedScore(p, c2)).toBeCloseTo(45, 6);
  });

  it('n_D abaixo do CHAR_MATURE_AT ignora alpha/beta (fica no cold start)', () => {
    const p = { P: 70 };
    const c = { D: 80, n_D: mmr.CHAR_MATURE_AT - 1, alpha: 10, beta: 5, history: [] };
    expect(mmr.expectedScore(p, c)).toBeCloseTo(45, 6);
  });
});

describe('linearWeights', () => {
  it('normaliza, dá o maior peso ao MAIS RECENTE (último) e razão de 20× na janela cheia', () => {
    const w = mmr.linearWeights(20);
    const sum = w.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 9);
    expect(w[19]).toBeGreaterThan(w[0]);            // mais recente > mais antigo
    expect(w[19] / w[0]).toBeCloseTo(20, 6);        // 20× (§5.2)
    expect(w[19]).toBeCloseTo(20 / 210, 6);         // ~9,5%
    expect(w[0]).toBeCloseTo(1 / 210, 6);           // ~0,5%
  });
  it('pesos são crescentes do índice 0 ao último', () => {
    const w = mmr.linearWeights(6);
    for (let i = 1; i < w.length; i++) expect(w[i]).toBeGreaterThan(w[i - 1]);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });
  it('janela vazia ou negativa → []', () => {
    expect(mmr.linearWeights(0)).toEqual([]);
    expect(mmr.linearWeights(-3)).toEqual([]);
  });
});

describe('sensitivity (K_p)', () => {
  it('0,50 na 1ª partida (n=0) e assintótico em 0,10', () => {
    expect(mmr.sensitivity(0)).toBeCloseTo(0.50, 6);
    expect(mmr.sensitivity(10)).toBeCloseTo(0.10 + 0.40 * Math.exp(-1.5), 6); // ~0,189
    expect(mmr.sensitivity(1000)).toBeCloseTo(0.10, 6);
  });
  it('decresce monotonicamente com n', () => {
    let prev = Infinity;
    for (let n = 0; n <= 30; n++) {
      const k = mmr.sensitivity(n);
      expect(k).toBeLessThan(prev);
      expect(k).toBeGreaterThan(0.10);
      prev = k;
    }
  });
});

describe('fitRegression', () => {
  it('recupera alpha/beta de uma reta perfeita S = 50 + 0,5·gap', () => {
    const history = [
      { P: 60, D: 40, S: 60 }, // gap 20 → 60
      { P: 50, D: 50, S: 50 }, // gap 0  → 50
      { P: 40, D: 60, S: 40 }, // gap -20 → 40
      { P: 70, D: 30, S: 70 }, // gap 40 → 70
    ];
    const fit = mmr.fitRegression(history);
    expect(fit.alpha).toBeCloseTo(50, 6);
    expect(fit.beta).toBeCloseTo(0.5, 6);
  });
  it('retorna null com gap constante (variância ~0) ou poucos pontos', () => {
    expect(mmr.fitRegression([{ P: 50, D: 50, S: 40 }, { P: 60, D: 60, S: 70 }])).toBeNull();
    expect(mmr.fitRegression([{ P: 50, D: 50, S: 40 }])).toBeNull();
  });
  it('ignora pontos com campos não-finitos', () => {
    const history = [
      { P: 60, D: 40, S: 60 },
      { P: NaN, D: 50, S: 50 },      // descartado
      { P: 40, D: 60, S: 40 },
      { P: 70, D: 30, S: 70 },
      { P: 50, D: 50, S: undefined }, // descartado
    ];
    const fit = mmr.fitRegression(history);
    expect(fit.alpha).toBeCloseTo(50, 6);
    expect(fit.beta).toBeCloseTo(0.5, 6);
  });
  it('history vazio ou nulo → null', () => {
    expect(mmr.fitRegression([])).toBeNull();
    expect(mmr.fitRegression(null)).toBeNull();
    expect(mmr.fitRegression(undefined)).toBeNull();
  });
});

describe('updateMatch — estrutura do result', () => {
  it('devolve todas as chaves documentadas do result', () => {
    const { result } = mmr.updateMatch(undefined, undefined, 80);
    expect(result).toHaveProperty('S');
    expect(result).toHaveProperty('S_esp');
    expect(result).toHaveProperty('S_aj');
    expect(result).toHaveProperty('K_p');
    expect(result).toHaveProperty('P_before');
    expect(result).toHaveProperty('P_after');
    expect(result).toHaveProperty('delta');
    expect(result).toHaveProperty('D_before');
    expect(result).toHaveProperty('D_after');
    expect(result).toHaveProperty('n');
    expect(result).toHaveProperty('calibratingBefore');
    expect(result).toHaveProperty('calibrating');
    expect(result).toHaveProperty('matchesRemaining');
    expect(result.delta).toBeCloseTo(result.P_after - result.P_before, 9);
  });
});

describe('updateMatch — calibração e fronteira', () => {
  it('1ª partida: EMA pura, dificuldade NÃO muda, calibrando', () => {
    const { player, character, result } = mmr.updateMatch(undefined, undefined, 80);
    // P = (1-0.5)*50 + 0.5*S_aj, S_esp=50 (gap 0) → S_aj=80 → P=65
    expect(result.S_esp).toBeCloseTo(50, 6);
    expect(result.S_aj).toBeCloseTo(80, 6);
    expect(result.P_after).toBeCloseTo(65, 6);
    expect(result.D_after).toBe(50);          // dificuldade intacta na calibração
    expect(result.D_before).toBe(50);
    expect(result.calibratingBefore).toBe(true);
    expect(character.n_D).toBe(0);
    expect(result.n).toBe(1);
    expect(result.calibrating).toBe(true);
    expect(result.matchesRemaining).toBe(4);
    expect(player.W.length).toBe(1);
  });

  it('dificuldade só se move a partir da 6ª partida (jogador fora da calibração)', () => {
    let p, c;
    for (let i = 1; i <= 5; i++) {
      const r = mmr.updateMatch(p, c, 80);
      p = r.player; c = r.character;
      expect(r.result.D_after).toBe(50);      // partidas 1..5: D fixo
      expect(r.result.calibratingBefore).toBe(true);
      expect(c.n_D).toBe(0);
    }
    const r6 = mmr.updateMatch(p, c, 80);
    expect(r6.result.calibratingBefore).toBe(false); // 6ª: jogador já maduro
    expect(r6.result.D_after).not.toBe(50);   // 6ª partida: D ajusta
    expect(r6.character.n_D).toBe(1);
    expect(r6.result.calibrating).toBe(false);
    expect(r6.result.matchesRemaining).toBe(0);
  });

  it('matchesRemaining decresce e nunca fica negativo', () => {
    let p, c;
    const remaining = [];
    for (let i = 1; i <= 8; i++) {
      const r = mmr.updateMatch(p, c, 60);
      p = r.player; c = r.character;
      remaining.push(r.result.matchesRemaining);
    }
    expect(remaining).toEqual([4, 3, 2, 1, 0, 0, 0, 0]);
    for (const m of remaining) expect(m).toBeGreaterThanOrEqual(0);
  });

  it('jogador forte (S=80) puxa a dificuldade pra baixo quando supera o esperado', () => {
    let p, c;
    for (let i = 1; i <= 5; i++) { const r = mmr.updateMatch(p, c, 80); p = r.player; c = r.character; }
    const r6 = mmr.updateMatch(p, c, 80);
    expect(r6.result.D_after).toBeLessThan(50); // overperformou → caso "mais fácil"
  });

  it('jogador fraco (S baixo) empurra a dificuldade pra cima', () => {
    let p, c;
    for (let i = 1; i <= 5; i++) { const r = mmr.updateMatch(p, c, 50); p = r.player; c = r.character; }
    const before = c.D;
    const r6 = mmr.updateMatch(p, c, 10); // muito abaixo do esperado
    expect(r6.result.D_after).toBeGreaterThan(before);
  });
});

describe('updateMatch — direção do delta', () => {
  it('nota acima do esperado sobe o P; abaixo desce', () => {
    const up = mmr.updateMatch(undefined, undefined, 90);
    expect(up.result.delta).toBeGreaterThan(0);
    const down = mmr.updateMatch(undefined, undefined, 10);
    expect(down.result.delta).toBeLessThan(0);
  });

  it('nota exatamente igual à esperada → delta ~0', () => {
    // player novo (P=50) vs personagem novo (D=50) → S_esp=50. S=50 → S_aj=50 → P fica 50.
    const r = mmr.updateMatch(undefined, undefined, 50);
    expect(r.result.S_esp).toBeCloseTo(50, 6);
    expect(r.result.delta).toBeCloseTo(0, 6);
    expect(r.result.P_after).toBeCloseTo(50, 6);
  });
});

describe('updateMatch — clamp do S e da janela', () => {
  it('S é clampado em 0..100 (200 vira 100, -50 vira 0)', () => {
    const hi = mmr.updateMatch(undefined, undefined, 200);
    expect(hi.result.S).toBe(100);
    const lo = mmr.updateMatch(undefined, undefined, -50);
    expect(lo.result.S).toBe(0);
  });

  it('a janela W nunca excede WINDOW elementos', () => {
    let p, c;
    for (let i = 0; i < mmr.WINDOW + 15; i++) {
      const r = mmr.updateMatch(p, c, 55 + (i % 7));
      p = r.player; c = r.character;
      expect(p.W.length).toBeLessThanOrEqual(mmr.WINDOW);
    }
    expect(p.W.length).toBe(mmr.WINDOW);
  });
});

describe('updateMatch — reproduz o exemplo do §6 do doc', () => {
  it('veterano (P=70,n=10) vs caso difícil maduro (D=80,α=52,β=0,45), S=40, P_W=72 → P≈66,4', () => {
    const W = Array.from({ length: 20 }, () => ({ S_aj: 72, D: 50, P: 70 })); // P_W = 72
    const player = { P: 70, n: 10, W };
    const character = { D: 80, n_D: 25, alpha: 52, beta: 0.45, history: [] };
    const { result } = mmr.updateMatch(player, character, 40);
    expect(result.S_esp).toBeCloseTo(47.5, 6);
    expect(result.D_after).toBeCloseTo(80.75, 6);
    expect(result.K_p).toBeCloseTo(0.189, 3);
    expect(result.S_aj).toBeCloseTo(42.5, 6);
    expect(result.P_after).toBeCloseTo(66.4, 1);
    expect(result.delta).toBeLessThan(0); // caiu de 70 → ~66,4
  });
});

describe('updateMatch — determinismo e pureza', () => {
  it('mesmas entradas → mesmas saídas (duas execuções idênticas)', () => {
    const p = { P: 62, n: 8, W: Array.from({ length: 10 }, (_, i) => ({ S_aj: 55 + i, D: 50, P: 62 })) };
    const c = { D: 44, n_D: 12, alpha: null, beta: null, history: [{ P: 60, D: 50, S: 55 }] };
    const r1 = mmr.updateMatch(p, c, 73);
    const r2 = mmr.updateMatch(p, c, 73);
    expect(r1.result).toEqual(r2.result);
    expect(r1.player).toEqual(r2.player);
    expect(r1.character).toEqual(r2.character);
  });

  it('não muta o estado de entrada (funções puras)', () => {
    const player = mmr.newPlayer();
    const character = mmr.newCharacter();
    const before = JSON.stringify(player);
    const beforeC = JSON.stringify(character);
    mmr.updateMatch(player, character, 70);
    expect(JSON.stringify(player)).toBe(before);
    expect(JSON.stringify(character)).toBe(beforeC);
  });
});

describe('updateMatch — convergência (propriedades, sem número mágico)', () => {
  it('sempre 100: o P sobe e a dificuldade do personagem CAI', () => {
    let p, c;
    for (let i = 0; i < 40; i++) { const r = mmr.updateMatch(p, c, 100); p = r.player; c = r.character; }
    expect(p.P).toBeGreaterThan(mmr.P0);
    expect(c.D).toBeLessThan(mmr.D0);
    expect(c.D).toBeGreaterThanOrEqual(mmr.D_MIN);
  });

  it('sempre 0: o P desce e a dificuldade do personagem SOBE', () => {
    let p, c;
    for (let i = 0; i < 40; i++) { const r = mmr.updateMatch(p, c, 0); p = r.player; c = r.character; }
    expect(p.P).toBeLessThan(mmr.P0);
    expect(c.D).toBeGreaterThan(mmr.D0);
    expect(c.D).toBeLessThanOrEqual(mmr.D_MAX);
  });

  it('P do jogador permanece finito e a dificuldade fica sempre dentro de [D_MIN, D_MAX]', () => {
    let p, c;
    for (let i = 0; i < 60; i++) {
      const r = mmr.updateMatch(p, c, (i * 37) % 101); // varia
      p = r.player; c = r.character;
      expect(Number.isFinite(p.P)).toBe(true);
      expect(c.D).toBeGreaterThanOrEqual(mmr.D_MIN);
      expect(c.D).toBeLessThanOrEqual(mmr.D_MAX);
    }
  });
});

describe('playerView', () => {
  it('oculta o MMR (null) durante a calibração e mostra arredondado depois', () => {
    expect(mmr.playerView({ P: 63.7, n: 3, W: [] })).toMatchObject({ calibrating: true, mmr: null, matchesRemaining: 2 });
    expect(mmr.playerView({ P: 63.7, n: 5, W: [] })).toMatchObject({ calibrating: false, mmr: 64 });
    expect(mmr.playerView(null)).toMatchObject({ calibrating: true, mmr: null, n: 0 });
  });

  it('matchesRemaining nunca é negativo mesmo com n grande', () => {
    const v = mmr.playerView({ P: 80, n: 40, W: [] });
    expect(v.matchesRemaining).toBe(0);
    expect(v.mmr).toBe(80);
    expect(v.mmrRaw).toBe(80);
  });
});

describe('characterDifficulty', () => {
  it('personagem novo/indefinido → D0 (baseline)', () => {
    expect(mmr.characterDifficulty(mmr.newCharacter())).toBe(mmr.D0);
    expect(mmr.characterDifficulty(null)).toBe(mmr.D0);
    expect(mmr.characterDifficulty({ D: NaN })).toBe(mmr.D0);
  });
  it('arredonda o D atual', () => {
    expect(mmr.characterDifficulty({ D: 63.4 })).toBe(63);
    expect(mmr.characterDifficulty({ D: 63.6 })).toBe(64);
  });
});

describe('MMR via API', () => {
  beforeEach(() => resetData());

  async function competitiveMatch(token, score, itemId = 'fp-test-1') {
    return request(app).post('/api/logs').set(authHeader(token)).send({
      type: 'freeplay', mode: 'competitive', itemId, itemTitle: 'Sofia',
      score, messages: [{ role: 'user', content: 'oi' }],
    });
  }

  it('partida competitiva atualiza o MMR e devolve o resultado no POST /api/logs', async () => {
    const aluno = await loginAs('aluno');
    const res = await competitiveMatch(aluno, 80);
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('competitive');
    expect(res.body.mmr).toBeTruthy();
    expect(res.body.mmr.n).toBe(1);
    expect(res.body.mmr.calibrating).toBe(true);
  });

  it('modo treino (sem mode) NÃO mexe no MMR', async () => {
    const aluno = await loginAs('aluno');
    await request(app).post('/api/logs').set(authHeader(aluno)).send({
      type: 'freeplay', itemId: 'fp-test-1', itemTitle: 'Sofia', score: 80,
      messages: [{ role: 'user', content: 'oi' }],
    });
    const me = await request(app).get('/api/me/mmr').set(authHeader(aluno));
    expect(me.body.n).toBe(0);
    const rank = await request(app).get('/api/ranking').set(authHeader(aluno));
    expect(rank.body.find((r) => r.userId === '3')).toBeUndefined();
  });

  it('exercício competitivo NÃO alimenta o MMR (só freeplay)', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/logs').set(authHeader(aluno)).send({
      type: 'exercise', mode: 'competitive', itemId: 'ex-test-1', itemTitle: 'Ex 1',
      score: 80, messages: [{ role: 'user', content: 'oi' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.mmr == null).toBe(true);
    const me = await request(app).get('/api/me/mmr').set(authHeader(aluno));
    expect(me.body.n).toBe(0);
  });

  it('GET /api/freeplay expõe a dificuldade (baseline 50 antes de qualquer partida)', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/freeplay').set(authHeader(aluno));
    const sofia = res.body.find((c) => c.id === 'fp-test-1');
    expect(sofia.difficulty).toBe(50);
    expect(sofia.competitiveMatches).toBe(0);
    expect(sofia.specificInstruction).toBeUndefined();
  });

  // Demanda #2 / D3 — INVERSÃO consciente do teste anterior (que travava o visitante
  // fora do MMR). Agora ele pontua como qualquer aluno; o que o separa é o ranking em
  // que aparece (`GET /api/ranking` filtra por arena), não o direito de pontuar.
  it('visitante PONTUA MMR (demanda #2)', async () => {
    const v = await loginVisitorFull();
    const res = await competitiveMatch(v.token, 90);
    expect(res.status).toBe(200);

    // Calibrando: o card vem sem o número, mas a partida FOI contada.
    expect(res.body.mmr).toBeTruthy();
    expect(res.body.mmr.n).toBe(1);

    // E o rating foi mesmo persistido no mmr.json, sob o id real do visitante.
    expect(readData('mmr.json').players[v.id].n).toBe(1);
  });
});
