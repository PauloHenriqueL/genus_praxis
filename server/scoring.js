// Cálculo da nota final (0–100) a partir das notas por critério.
//
// A estrutura de avaliação já fica pronta: quando o avaliador for ligado, ele
// emitirá um bloco de notas por critério (0–10 cada), e a nota final é calculada
// DE FORMA DETERMINÍSTICA aqui em código (a IA não faz a conta final):
//   nota_final = round( soma / (nº de critérios × 10) × 100 )

function finalScoreFromCriteria(criteria) {
  if (!criteria || typeof criteria !== 'object') return null;
  const vals = Object.values(criteria)
    .map((v) => Number(String(v).replace(',', '.')))
    .filter((n) => Number.isFinite(n));
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  const base = vals.length * 10;
  if (base === 0) return null;
  return Math.round((sum / base) * 100);
}

// Separa o JSON comparativo do duelo (chaves A1..A6 / B1..B6) nas notas de cada
// aluno e calcula a nota final 0–100 de cada um. Retorna também o vencedor.
// Retorna null se não der pra montar as duas notas.
function comparativeScores(criteria) {
  if (!criteria || typeof criteria !== 'object') return null;
  const a = {};
  const b = {};
  for (const [k, v] of Object.entries(criteria)) {
    const m = /^([AB])\s*0*(\d+)$/i.exec(String(k).trim());
    if (!m) continue;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) continue;
    if (m[1].toUpperCase() === 'A') a[m[2]] = n;
    else b[m[2]] = n;
  }
  const scoreA = finalScoreFromCriteria(a);
  const scoreB = finalScoreFromCriteria(b);
  if (scoreA === null || scoreB === null) return null;
  let winner;
  if (scoreA > scoreB) winner = 'A';
  else if (scoreB > scoreA) winner = 'B';
  else winner = 'draw';
  return { criteriaA: a, criteriaB: b, scoreA, scoreB, winner };
}

module.exports = { finalScoreFromCriteria, comparativeScores };
