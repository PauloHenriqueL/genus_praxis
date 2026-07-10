// PvP (duelos) — engine puro, sem HTTP.
const mmr = require('../server/mmr');

// Jogador fora da calibração (n alto) com MMR P fixo.
function player(P, n = 10) {
  return { P, n, W: [] };
}

describe('processDuel — exemplos do doc (PvP)', () => {
  it('Exemplo 1: favorito vence mas não domina (A 75 vs B 25, 60×40 → A −3 / B +3)', () => {
    const r = mmr.processDuel(player(75), player(25), undefined, 60, 40);
    expect(r.ranked).toBe(true);
    expect(r.pvp.pool).toBeCloseTo(20, 6);
    expect(r.pvp.deltaA).toBeCloseTo(-3, 6);
    expect(r.pvp.deltaB).toBeCloseTo(3, 6);
  });

  it('Exemplo 2: underdog domina (35×65 → A −8 / B +8)', () => {
    const r = mmr.processDuel(player(75), player(25), undefined, 35, 65);
    expect(r.pvp.deltaA).toBeCloseTo(-8, 6);
    expect(r.pvp.deltaB).toBeCloseTo(8, 6);
  });

  it('80×20 é bloqueado pelo anti-smurf (20 < 25), apesar da tabela do Exemplo 3', () => {
    const r = mmr.processDuel(player(75), player(25), undefined, 80, 20);
    expect(r.ranked).toBe(false);
    expect(r.reason).toBe('anti_smurf');
  });

  it('break-even: favorito com 3× a nota do oponente fica com delta ~0', () => {
    const r = mmr.processDuel(player(75), player(25), undefined, 75, 25);
    expect(r.ranked).toBe(true);
    expect(r.pvp.deltaA).toBeCloseTo(0, 6);
    expect(r.pvp.deltaB).toBeCloseTo(0, 6);
  });

  it('Exemplo 4: anti-smurf — nota < 25 bloqueia o duelo (sem alteração)', () => {
    const r = mmr.processDuel(player(70), player(68), undefined, 80, 18);
    expect(r.ranked).toBe(false);
    expect(r.reason).toBe('anti_smurf');
    expect(r.pvp).toBeUndefined();
  });
});

describe('processDuel — guardas (cada reason possível)', () => {
  it('reason=calibrating quando A ainda calibra (n < CALIBRATION_MATCHES)', () => {
    const r = mmr.processDuel(player(60, 2), player(60, 10), undefined, 70, 60);
    expect(r.ranked).toBe(false);
    expect(r.reason).toBe('calibrating');
    expect(r.pvp).toBeUndefined();
  });

  it('reason=calibrating quando B ainda calibra', () => {
    const r = mmr.processDuel(player(60, 10), player(60, 0), undefined, 70, 60);
    expect(r.ranked).toBe(false);
    expect(r.reason).toBe('calibrating');
  });

  it('calibração tem precedência sobre anti-smurf (ambas as violações → calibrating)', () => {
    // A calibrando E nota B abaixo do mínimo: a checagem de calibração vem antes.
    const r = mmr.processDuel(player(60, 1), player(60, 10), undefined, 70, 10);
    expect(r.ranked).toBe(false);
    expect(r.reason).toBe('calibrating');
  });

  it('reason=anti_smurf quando SÓ A tira abaixo do mínimo', () => {
    const r = mmr.processDuel(player(60), player(60), undefined, mmr.PVP_MIN_SCORE - 1, 80);
    expect(r.ranked).toBe(false);
    expect(r.reason).toBe('anti_smurf');
  });

  it('reason=anti_smurf quando SÓ B tira abaixo do mínimo', () => {
    const r = mmr.processDuel(player(60), player(60), undefined, 80, mmr.PVP_MIN_SCORE - 1);
    expect(r.ranked).toBe(false);
    expect(r.reason).toBe('anti_smurf');
  });

  it('nota EXATAMENTE no mínimo (PVP_MIN_SCORE) é aceita', () => {
    const r = mmr.processDuel(player(60), player(60), undefined, mmr.PVP_MIN_SCORE, mmr.PVP_MIN_SCORE);
    expect(r.ranked).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('nota crua fora de 0..100 é clampada antes da checagem anti-smurf', () => {
    // -50 → 0 < 25 → bloqueia; e 200 → 100 no lado que passa.
    const r = mmr.processDuel(player(60), player(60), undefined, 200, -50);
    expect(r.S_A).toBe(100);
    expect(r.S_B).toBe(0);
    expect(r.ranked).toBe(false);
    expect(r.reason).toBe('anti_smurf');
  });
});

describe('processDuel — soma zero e sinais', () => {
  it('empate (sA===sB) → deltaA === -deltaB e ambos ~0 quando MMRs iguais', () => {
    const r = mmr.processDuel(player(60), player(60), undefined, 70, 70);
    expect(r.ranked).toBe(true);
    expect(r.pvp.deltaA).toBeCloseTo(-r.pvp.deltaB, 9);
    expect(r.pvp.deltaA).toBeCloseTo(0, 6);
    expect(r.pvp.deltaB).toBeCloseTo(0, 6);
  });

  it('vitória de A (sA > sB) → deltaA > 0, deltaB < 0, soma zero', () => {
    const r = mmr.processDuel(player(60), player(60), undefined, 80, 40);
    expect(r.pvp.deltaA).toBeGreaterThan(0);
    expect(r.pvp.deltaB).toBeLessThan(0);
    expect(r.pvp.deltaA + r.pvp.deltaB).toBeCloseTo(0, 9);
  });

  it('conservação: deltaA + deltaB ≈ 0 em vários cenários rankeados', () => {
    const cases = [
      [player(50), player(70), 50, 50],
      [player(80), player(30), 60, 40],
      [player(45, 12), player(88, 7), 55, 45],
      [player(60), player(60), 100, 25],
    ];
    for (const [a, b, sA, sB] of cases) {
      const r = mmr.processDuel(a, b, undefined, sA, sB);
      expect(r.ranked).toBe(true);
      expect(r.pvp.deltaA + r.pvp.deltaB).toBeCloseTo(0, 9);
    }
  });

  it('empate com MMRs DIFERENTES: quem tem MMR menor ganha (apostou menos)', () => {
    // A=50 aposta 10, B=70 aposta 14, pool 24 → 12 cada → A +2, B −2.
    const r = mmr.processDuel(player(50), player(70), undefined, 50, 50);
    expect(r.pvp.deltaA).toBeCloseTo(2, 6);
    expect(r.pvp.deltaB).toBeCloseTo(-2, 6);
  });
});

describe('processDuel — formato do retorno rankeado', () => {
  it('tem todas as chaves documentadas', () => {
    const r = mmr.processDuel(player(60), player(60), undefined, 70, 50);
    expect(r).toHaveProperty('ranked', true);
    expect(r).toHaveProperty('reason', null);
    expect(r).toHaveProperty('S_A');
    expect(r).toHaveProperty('S_B');
    expect(r).toHaveProperty('playerA');
    expect(r).toHaveProperty('playerB');
    expect(r).toHaveProperty('character');
    expect(r).toHaveProperty('resultA');
    expect(r).toHaveProperty('resultB');
    for (const k of ['pool', 'apostaA', 'apostaB', 'recebidoA', 'recebidoB', 'deltaA', 'deltaB']) {
      expect(r.pvp).toHaveProperty(k);
    }
  });

  it('pool = apostaA + apostaB e cada aposta = PVP_STAKE·P', () => {
    const r = mmr.processDuel(player(80), player(40), undefined, 60, 50);
    expect(r.pvp.apostaA).toBeCloseTo(mmr.PVP_STAKE * 80, 6);
    expect(r.pvp.apostaB).toBeCloseTo(mmr.PVP_STAKE * 40, 6);
    expect(r.pvp.pool).toBeCloseTo(r.pvp.apostaA + r.pvp.apostaB, 9);
    expect(r.pvp.recebidoA + r.pvp.recebidoB).toBeCloseTo(r.pvp.pool, 9);
    expect(r.pvp.deltaA).toBeCloseTo(r.pvp.recebidoA - r.pvp.apostaA, 9);
    expect(r.pvp.deltaB).toBeCloseTo(r.pvp.recebidoB - r.pvp.apostaB, 9);
  });

  it('resultA.pvpDelta === pvp.deltaA e resultB.pvpDelta === pvp.deltaB', () => {
    const r = mmr.processDuel(player(75), player(25), undefined, 60, 40);
    expect(r.resultA.pvpDelta).toBeCloseTo(r.pvp.deltaA, 9);
    expect(r.resultB.pvpDelta).toBeCloseTo(r.pvp.deltaB, 9);
  });

  it('rankeado aplica delta PvP POR CIMA do MMR atualizado pelo solo', () => {
    const r = mmr.processDuel(player(50), player(70), undefined, 50, 50);
    expect(r.ranked).toBe(true);
    expect(r.pvp.deltaA).toBeCloseTo(2, 6);
    expect(r.pvp.deltaB).toBeCloseTo(-2, 6);
    expect(r.playerA.P).not.toBe(50);
    expect(r.resultA.pvpDelta).toBeCloseTo(2, 6);
    // delta total = movimento solo + delta pvp
    expect(r.resultA.delta).toBeCloseTo(r.playerA.P - r.resultA.P_before, 9);
    expect(r.resultA.P_after).toBeCloseTo(r.playerA.P, 9);
  });

  it('o personagem é threaded (A joga, depois B contra o D já ajustado)', () => {
    // Ambos fora da calibração → o D se ajusta duas vezes; n_D final = 2.
    const r = mmr.processDuel(player(60), player(60), undefined, 70, 50);
    expect(r.character.n_D).toBe(2);
  });
});

describe('processDuel — pureza', () => {
  it('não muta os objetos de entrada', () => {
    const a = player(75);
    const b = player(25);
    mmr.processDuel(a, b, undefined, 60, 40);
    expect(a.P).toBe(75);
    expect(b.P).toBe(25);
    expect(a.n).toBe(10);
  });

  it('determinismo: mesmas entradas → mesmo retorno', () => {
    const args = [player(62, 9), player(71, 14), undefined, 66, 48];
    const r1 = mmr.processDuel(...args);
    const r2 = mmr.processDuel(...args);
    expect(r1.pvp).toEqual(r2.pvp);
    expect(r1.playerA).toEqual(r2.playerA);
    expect(r1.playerB).toEqual(r2.playerB);
  });
});
