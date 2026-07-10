// Avaliador customizado por exercício da trilha.
//
// No All_OS, um exercício com `evaluatorPrompt` preenchido usa AQUELE prompt como
// avaliador (via `wrapCustomEvaluatorPrompt`). No porte isso ficou desligado: o
// `/api/evaluate` sempre usava o avaliador global e o `evaluatorPrompt` era
// silenciosamente reaproveitado como gabarito — enquanto a tela AdminExercises
// mostrava a coluna "Avaliador: customizado". Promessa que o backend não cumpria.
//
// Estes testes travam a religação. Como `/api/evaluate` responde 503 antes de
// resolver o prompt quando `OPENAI_API_KEY=''` (o caso da suíte), a checagem de
// fiação é feita no código-fonte, como em `prompt-files.test.js`.

const fs = require('fs');
const path = require('path');
const { app, request, resetData, loginAs, authHeader, SECRETS } = require('./helpers');

const { wrapCustomEvaluatorPrompt } = require('../server/prompts');
const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf-8');

beforeEach(() => resetData());

describe('wrapCustomEvaluatorPrompt', () => {
  it('preserva o prompt do admin', () => {
    const out = wrapCustomEvaluatorPrompt('AVALIE CONTANDO QUANTAS PERGUNTAS ABERTAS O ALUNO FEZ.');
    expect(out).toContain('AVALIE CONTANDO QUANTAS PERGUNTAS ABERTAS O ALUNO FEZ.');
  });

  it('exige [NOTA:X] — cada avaliador tem a PRÓPRIA escala', () => {
    const out = wrapCustomEvaluatorPrompt('qualquer coisa');
    expect(out).toContain('[NOTA:X]');
    // Forçar o bloco de critérios distorceria a nota: `finalScoreFromCriteria`
    // assume `base = nº critérios × 10`, e os avaliadores reais usam "5 eixos de
    // 0 a 2 (máx. 10)". A mesma sessão valia 7 numa escala e 40 na outra.
    expect(out).not.toContain('[notas-supervisor]');
  });

  it('deixa claro que a escala é a do próprio prompt', () => {
    const out = wrapCustomEvaluatorPrompt('x');
    expect(out.toLowerCase()).toContain('na escala definida acima');
  });

  it('tolera prompt vazio/nulo sem quebrar', () => {
    for (const v of ['', null, undefined]) {
      expect(() => wrapCustomEvaluatorPrompt(v)).not.toThrow();
      expect(wrapCustomEvaluatorPrompt(v)).toContain('[NOTA:X]');
    }
  });
});

// `extractFinalScore` é interno ao server; exercitamos pela rede de segurança do
// POST /api/logs, que remove o marcador e deriva a nota quando falta `score`.
describe('[NOTA:X] no POST /api/logs (rede de segurança)', () => {
  async function saveLog(over) {
    const token = await loginAs('aluno');
    return request(app).post('/api/logs').set(authHeader(token)).send({
      type: 'exercise', itemId: 'ex-test-1', itemTitle: 'Exercício 1',
      durationSeconds: 60, messages: [{ role: 'user', content: 'oi' }], ...over,
    });
  }

  it('remove o [NOTA:X] do texto e usa como nota do log', async () => {
    const res = await saveLog({ evaluation: 'Boa sessão, mas atente ao silêncio.\n\n[NOTA:7]' });
    expect(res.status).toBe(200);
    expect(res.body.evaluation).not.toContain('[NOTA:');
    expect(res.body.evaluation).toContain('Boa sessão');
    expect(res.body.score).toBe(7);
  });

  it('aceita decimal com vírgula e com ponto', async () => {
    expect((await saveLog({ evaluation: 'x [NOTA:7,5]' })).body.score).toBe(7.5);
    expect((await saveLog({ evaluation: 'x [NOTA:8.5]' })).body.score).toBe(8.5);
  });

  it('`score` explícito no body vence o [NOTA:X] do texto', async () => {
    const res = await saveLog({ evaluation: 'x [NOTA:7]', score: 42 });
    expect(res.body.score).toBe(42);
    expect(res.body.evaluation).not.toContain('[NOTA:');
  });

  it('texto sem [NOTA:X] fica intacto e sem nota', async () => {
    const res = await saveLog({ evaluation: 'Apenas um feedback.' });
    expect(res.body.evaluation).toBe('Apenas um feedback.');
    expect(res.body.score).toBeNull();
  });

  it('o bloco [notas-supervisor] continua sendo removido (não regrediu)', async () => {
    const res = await saveLog({ evaluation: 'Feedback.\n\n---\n[notas-supervisor]\n{"1":8,"2":7,"3":8,"4":7,"5":8,"6":7}' });
    expect(res.body.evaluation).not.toContain('notas-supervisor');
    expect(res.body.score).toBe(75);
  });
});

describe('fiação do avaliador customizado em /api/evaluate', () => {
  it('resolveEvaluatorPrompt usa o evaluatorPrompt do exercício', () => {
    expect(SERVER_SRC).toContain('function resolveEvaluatorPrompt');
    const fn = SERVER_SRC.slice(
      SERVER_SRC.indexOf('function resolveEvaluatorPrompt'),
      SERVER_SRC.indexOf('app.post(\'/api/evaluate\''),
    );
    expect(fn).toContain('wrapCustomEvaluatorPrompt(e.evaluatorPrompt)');
    expect(fn).toContain("context.type === 'exercise'");
    // Sem exercício com prompt próprio, cai no avaliador global.
    expect(fn).toContain('loadEvaluatorPrompt()');
  });

  it('/api/evaluate chama resolveEvaluatorPrompt (não mais loadEvaluatorPrompt direto)', () => {
    const route = SERVER_SRC.slice(SERVER_SRC.indexOf("app.post('/api/evaluate'"));
    const body = route.slice(0, route.indexOf('\napp.'));
    expect(body).toContain('resolveEvaluatorPrompt(context)');
  });

  it('/api/evaluate escolhe o parser de nota conforme a família do avaliador', () => {
    const route = SERVER_SRC.slice(SERVER_SRC.indexOf("app.post('/api/evaluate'"));
    const body = route.slice(0, route.indexOf('\napp.'));
    // customizado -> [NOTA:X]; global -> bloco de critérios.
    expect(body).toContain('if (resolved.custom)');
    expect(body).toContain('extractFinalScore(raw)');
    expect(body).toContain('extractSupervisorNotes(raw)');
  });

  it('avaliador customizado NÃO devolve criteriaScores (não há critérios)', () => {
    const route = SERVER_SRC.slice(SERVER_SRC.indexOf("app.post('/api/evaluate'"));
    const body = route.slice(0, route.indexOf('\napp.'));
    const custom = body.slice(body.indexOf('if (resolved.custom)'), body.indexOf('} else {'));
    expect(custom).not.toContain('criteriaScores');
  });

  it('exercício NÃO tem mais gabarito injetado (o campo é um avaliador)', () => {
    const fn = SERVER_SRC.slice(
      SERVER_SRC.indexOf('function resolveEvaluationCriteria'),
      SERVER_SRC.indexOf('function resolveEvaluatorPrompt'),
    );
    expect(fn).toContain("if (type === 'exercise') return '';");
  });

  it('buildDirectEvaluationPrompt foi removido (era código morto)', () => {
    expect(SERVER_SRC).not.toContain('buildDirectEvaluationPrompt');
    const prompts = fs.readFileSync(path.join(__dirname, '..', 'server', 'prompts.js'), 'utf-8');
    expect(prompts).not.toContain('buildDirectEvaluationPrompt');
  });
});

describe('o evaluatorPrompt continua sendo segredo', () => {
  it('aluno não recebe evaluatorPrompt em GET /api/exercises', async () => {
    const token = await loginAs('aluno');
    const res = await request(app).get('/api/exercises').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(SECRETS.evaluator);
    for (const ex of res.body) expect(ex.evaluatorPrompt).toBeUndefined();
  });

  it('admin recebe (precisa editar na tela AdminExercises)', async () => {
    const token = await loginAs('admin');
    const res = await request(app).get('/api/exercises').set(authHeader(token));
    const ex = res.body.find((e) => e.id === 'ex-test-1');
    expect(ex.evaluatorPrompt).toBe(SECRETS.evaluator);
  });

  it('exercício sem evaluatorPrompt fica com o avaliador global', async () => {
    // ex-test-2 não tem evaluatorPrompt nas fixtures.
    const token = await loginAs('admin');
    const res = await request(app).get('/api/exercises').set(authHeader(token));
    const ex = res.body.find((e) => e.id === 'ex-test-2');
    expect(ex.evaluatorPrompt).toBeUndefined();
  });

  it('o avaliador customizado sobrevive a um PUT do admin', async () => {
    const token = await loginAs('admin');
    await request(app).put('/api/exercises/ex-test-1').set(authHeader(token))
      .send({ evaluatorPrompt: 'NOVO AVALIADOR' });
    const res = await request(app).get('/api/exercises').set(authHeader(token));
    expect(res.body.find((e) => e.id === 'ex-test-1').evaluatorPrompt).toBe('NOVO AVALIADOR');
  });
});
