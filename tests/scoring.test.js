// Testes unitários puros de server/scoring.js (sem HTTP).
const { finalScoreFromCriteria, comparativeScores } = require('../server/scoring');

describe('finalScoreFromCriteria', () => {
  it('calcula round((soma / (n*10)) * 100): {1:8, 2:7} -> 75', () => {
    expect(finalScoreFromCriteria({ 1: 8, 2: 7 })).toBe(75);
  });

  it('objeto vazio -> null', () => {
    expect(finalScoreFromCriteria({})).toBe(null);
  });

  it('null -> null', () => {
    expect(finalScoreFromCriteria(null)).toBe(null);
  });

  it('undefined -> null', () => {
    expect(finalScoreFromCriteria(undefined)).toBe(null);
  });

  it('não-objeto (número/string) -> null', () => {
    expect(finalScoreFromCriteria(42)).toBe(null);
    expect(finalScoreFromCriteria('8,7')).toBe(null);
  });

  it('valores com vírgula decimal funcionam: {1:"4,5", 2:"5,5"} -> 50', () => {
    // soma = 10, base = 20 -> round(50) = 50
    expect(finalScoreFromCriteria({ 1: '4,5', 2: '5,5' })).toBe(50);
  });

  it('valores não numéricos são ignorados: {1:8, 2:"abc"} -> 80', () => {
    // só o 8 conta: 8 / 10 * 100 = 80
    expect(finalScoreFromCriteria({ 1: 8, 2: 'abc' })).toBe(80);
  });

  it('se TODOS os valores forem não numéricos -> null', () => {
    expect(finalScoreFromCriteria({ 1: 'x', 2: 'y' })).toBe(null);
  });

  it('6 critérios 10/10 -> 100', () => {
    expect(finalScoreFromCriteria({ 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 10 })).toBe(100);
  });

  it('todos 0 -> 0', () => {
    expect(finalScoreFromCriteria({ 1: 0, 2: 0, 3: 0 })).toBe(0);
  });

  it('arredonda para o inteiro mais próximo: {1:8,2:7,3:8} -> round(76.66)=77', () => {
    // soma 23, base 30 -> 76.66 -> 77
    expect(finalScoreFromCriteria({ 1: 8, 2: 7, 3: 8 })).toBe(77);
  });
});

describe('comparativeScores', () => {
  it('separa A1..A6/B1..B6 em criteriaA/criteriaB, calcula notas e vencedor', () => {
    const r = comparativeScores({
      A1: 8, A2: 8, A3: 8, A4: 8, A5: 8, A6: 8,
      B1: 6, B2: 6, B3: 6, B4: 6, B5: 6, B6: 6,
    });
    expect(r).not.toBe(null);
    expect(r.scoreA).toBe(80);
    expect(r.scoreB).toBe(60);
    expect(r.winner).toBe('A');
    expect(r.criteriaA).toEqual({ 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 8 });
    expect(r.criteriaB).toEqual({ 1: 6, 2: 6, 3: 6, 4: 6, 5: 6, 6: 6 });
  });

  it('winner "B" quando B pontua mais', () => {
    const r = comparativeScores({ A1: 5, B1: 9 });
    expect(r.winner).toBe('B');
    expect(r.scoreA).toBe(50);
    expect(r.scoreB).toBe(90);
  });

  it('winner "draw" em empate', () => {
    const r = comparativeScores({ A1: 7, A2: 7, B1: 7, B2: 7 });
    expect(r.winner).toBe('draw');
    expect(r.scoreA).toBe(r.scoreB);
  });

  it('faltando o lado B -> null', () => {
    expect(comparativeScores({ A1: 8, A2: 7 })).toBe(null);
  });

  it('faltando o lado A -> null', () => {
    expect(comparativeScores({ B1: 8, B2: 7 })).toBe(null);
  });

  it('chaves inválidas são ignoradas (só A/B contam)', () => {
    // C1/foo/1 não entram; A1 e B1 formam as duas notas
    const r = comparativeScores({ A1: 8, B1: 6, C1: 10, foo: 5, 1: 3 });
    expect(r.scoreA).toBe(80);
    expect(r.scoreB).toBe(60);
    expect(r.criteriaA).toEqual({ 1: 8 });
    expect(r.criteriaB).toEqual({ 1: 6 });
  });

  it('aceita minúsculas e zeros à esquerda: a01/b1', () => {
    const r = comparativeScores({ a01: 8, b1: 6 });
    expect(r.scoreA).toBe(80);
    expect(r.scoreB).toBe(60);
  });

  it('valores com vírgula funcionam', () => {
    const r = comparativeScores({ A1: '7,5', B1: '2,5' });
    expect(r.scoreA).toBe(75);
    expect(r.scoreB).toBe(25);
    expect(r.winner).toBe('A');
  });

  it('valores não numéricos dentro de um lado são ignorados', () => {
    // A1=8 numérico, A2 ignorado -> scoreA=80; B só com B1=6 -> 60
    const r = comparativeScores({ A1: 8, A2: 'xx', B1: 6 });
    expect(r.scoreA).toBe(80);
    expect(r.scoreB).toBe(60);
  });

  it('null / não-objeto -> null', () => {
    expect(comparativeScores(null)).toBe(null);
    expect(comparativeScores('A1:8')).toBe(null);
  });
});
