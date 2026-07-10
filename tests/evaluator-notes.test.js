// O bloco [notas-supervisor] em POST /api/logs — rede de segurança contra
// vazamento do gabarito de notas ao aluno (bug real já ocorrido).
const {
  app, request, resetData, loginAs, authHeader,
} = require('./helpers');

beforeEach(() => resetData());

// Helper: cria um log via POST como o aluno (id 3), com a `evaluation` dada.
async function postLog(token, over = {}) {
  return request(app)
    .post('/api/logs')
    .set(authHeader(token))
    .send({ type: 'freeplay', itemId: 'fp-test-1', messages: [], ...over });
}

describe('POST /api/logs — extração do bloco [notas-supervisor]', () => {
  const BLOCO =
    'Feedback bonito.\n\n---\n[notas-supervisor]\n{"1":8,"2":7,"3":8,"4":7,"5":8,"6":7}';

  it('não salva "notas-supervisor" no texto e deriva score=75 com as 6 notas', async () => {
    const aluno = await loginAs('aluno');
    const res = await postLog(aluno, { evaluation: BLOCO });
    expect(res.status).toBe(200);
    // O aluno é o autor: a resposta imediata do POST inclui criteriaScores (é o objeto salvo).
    expect(res.body.evaluation).not.toContain('notas-supervisor');
    expect(res.body.evaluation).toContain('Feedback bonito');
    expect(res.body.criteriaScores).toEqual({ 1: 8, 2: 7, 3: 8, 4: 7, 5: 8, 6: 7 });
    // score derivado (não veio no body): (45/60)*100 = 75
    expect(res.body.score).toBe(75);
    // Nem a cerca "---" nem o fence devem sobrar pendurados.
    expect(res.body.evaluation.trim().endsWith('Feedback bonito.')).toBe(true);
  });

  it('ALUNO relendo GET /api/logs não vê criteriaScores nem o bloco no texto', async () => {
    const aluno = await loginAs('aluno');
    await postLog(aluno, { evaluation: BLOCO });
    const res = await request(app).get('/api/logs').set(authHeader(aluno));
    expect(res.status).toBe(200);
    const log = res.body.find((l) => l.userId === '3');
    expect(log).toBeTruthy();
    expect(log.criteriaScores).toBeUndefined();
    expect(log.evaluation).not.toContain('notas-supervisor');
    expect(JSON.stringify(log)).not.toContain('notas-supervisor');
  });

  it('ADMIN relendo GET /api/logs vê criteriaScores', async () => {
    const aluno = await loginAs('aluno');
    await postLog(aluno, { evaluation: BLOCO });
    const admin = await loginAs('admin');
    const res = await request(app).get('/api/logs').set(authHeader(admin));
    const log = res.body.find((l) => l.userId === '3');
    expect(log.criteriaScores).toEqual({ 1: 8, 2: 7, 3: 8, 4: 7, 5: 8, 6: 7 });
    // mas mesmo para o admin, o texto do aluno já foi limpo do bloco.
    expect(log.evaluation).not.toContain('notas-supervisor');
  });
});

describe('POST /api/logs — variações de formato do bloco', () => {
  const cases = [
    {
      nome: 'fence ``` ABRINDO ANTES do marcador (não deixa fence órfão)',
      evaluation: 'Texto.\n\n```\n[notas-supervisor]\n{"1":8,"2":8}\n```',
      criteria: { 1: 8, 2: 8 },
      score: 80,
    },
    {
      nome: 'fence ```json DEPOIS do marcador',
      evaluation: 'Texto.\n\n[notas-supervisor]\n```json\n{"1":6,"2":6}\n```',
      criteria: { 1: 6, 2: 6 },
      score: 60,
    },
    {
      nome: 'pares na MESMA linha (avaliador comparativo): A1: 4  A2: 4  A3: 4',
      evaluation: 'Texto.\n\n[notas-supervisor]\nA1: 4  A2: 4  A3: 4',
      criteria: { A1: 4, A2: 4, A3: 4 },
      // finalScoreFromCriteria sobre {4,4,4}: 12/30*100 = 40
      score: 40,
    },
    {
      nome: 'um par por linha',
      evaluation: 'Texto.\n\n[notas-supervisor]\n1: 9\n2: 9\n3: 9',
      criteria: { 1: 9, 2: 9, 3: 9 },
      score: 90,
    },
    {
      nome: 'decimais com vírgula',
      evaluation: 'Texto.\n\n[notas-supervisor]\n1: 4,5\n2: 5,5',
      criteria: { 1: 4.5, 2: 5.5 },
      score: 50,
    },
  ];

  for (const c of cases) {
    it(`aguenta: ${c.nome}`, async () => {
      const aluno = await loginAs('aluno');
      const res = await request(app)
        .post('/api/logs')
        .set(authHeader(aluno))
        .send({ type: 'freeplay', itemId: 'fp-test-1', messages: [], evaluation: c.evaluation });
      expect(res.status).toBe(200);
      expect(res.body.criteriaScores).toEqual(c.criteria);
      expect(res.body.score).toBe(c.score);
      // O texto do aluno nunca deve carregar o marcador nem cerca/hífens órfãos.
      expect(res.body.evaluation).not.toContain('notas-supervisor');
      expect(res.body.evaluation).not.toContain('```');
      expect(res.body.evaluation.trim()).toBe('Texto.');
    });
  }

  it('texto SEM o bloco: criteriaScores null e evaluation intacta', async () => {
    const aluno = await loginAs('aluno');
    const texto = 'Apenas um feedback simples, sem notas.';
    const res = await request(app)
      .post('/api/logs')
      .set(authHeader(aluno))
      .send({ type: 'freeplay', itemId: 'fp-test-1', messages: [], evaluation: texto });
    expect(res.status).toBe(200);
    expect(res.body.criteriaScores).toBe(null);
    expect(res.body.evaluation).toBe(texto);
    expect(res.body.score).toBe(null);
  });
});

describe('POST /api/logs — prioridade de score/criteriaScores explícitos', () => {
  const BLOCO =
    'Feedback.\n\n[notas-supervisor]\n{"1":8,"2":7,"3":8,"4":7,"5":8,"6":7}'; // derivaria 75

  it('score explícito no body tem prioridade sobre o derivado', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app)
      .post('/api/logs')
      .set(authHeader(aluno))
      .send({ type: 'freeplay', itemId: 'fp-test-1', messages: [], evaluation: BLOCO, score: 42 });
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(42);
  });

  it('criteriaScores explícito no body tem prioridade sobre o bloco extraído', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app)
      .post('/api/logs')
      .set(authHeader(aluno))
      .send({
        type: 'freeplay', itemId: 'fp-test-1', messages: [],
        evaluation: BLOCO,
        criteriaScores: { 1: 10, 2: 10 },
      });
    expect(res.status).toBe(200);
    expect(res.body.criteriaScores).toEqual({ 1: 10, 2: 10 });
    // score derivado usa o criteriaScores explícito: {10,10} -> 100
    expect(res.body.score).toBe(100);
    // o texto ainda foi limpo do bloco.
    expect(res.body.evaluation).not.toContain('notas-supervisor');
  });
});
