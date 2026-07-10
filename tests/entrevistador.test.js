// Entrevistador: parser puro de blocos.js (require direto) + rotas HTTP admin-only.
const fs = require('fs');
const path = require('path');
const {
  app, request, resetData, loginAs, loginVisitor, authHeader,
} = require('./helpers');
const { extractBloco1, extractBloco2, extractMeta, extractBlocos } = require('../server/entrevistador/blocos');

beforeEach(() => resetData());

// Template REAL como fixture (do "## [I." em diante). Tem seções I..V (sem VI).
const REAL_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'entrevistador', 'promptentrevistador.md'), 'utf-8',
);
const REAL_FROM_I = REAL_PROMPT.slice(REAL_PROMPT.indexOf('## [I. CONTENÇÃO]'));

// =====================================================================
// UNITÁRIO — extractBloco2
// =====================================================================
describe('extractBloco2', () => {
  it('texto começando em "## [I. CONTENÇÃO]" -> devolve dali até o fim', () => {
    const b2 = extractBloco2(REAL_FROM_I);
    expect(b2).not.toBeNull();
    expect(b2.startsWith('## [I. CONTENÇÃO]')).toBe(true);
  });

  it('preâmbulo antes do "## [I." é descartado', () => {
    const txt = 'blá blá conversa\n\n## [I. CONTENÇÃO]\nconteúdo';
    const b2 = extractBloco2(txt);
    expect(b2.startsWith('## [I. CONTENÇÃO]')).toBe(true);
    expect(b2).not.toContain('blá blá conversa');
  });

  it('corta na frase "Pronto. É só colar…"', () => {
    const txt = '## [I. CONTENÇÃO]\ncorpo do prompt\n\nPronto. É só colar no simulador.';
    const b2 = extractBloco2(txt);
    expect(b2).toContain('corpo do prompt');
    expect(b2).not.toContain('É só colar');
  });

  it('corta na frase "Pronto. Obrigado pela construção"', () => {
    const txt = '## [I. CONTENÇÃO]\ncorpo\n\nPronto. Obrigado pela construção do caso.';
    const b2 = extractBloco2(txt);
    expect(b2).toContain('corpo');
    expect(b2).not.toContain('Obrigado pela construção');
  });

  it('corta na frase "Pronto. Bloco 1…"', () => {
    const txt = '## [I. CONTENÇÃO]\ncorpo\n\nPronto. Bloco 1 vai a seguir.';
    const b2 = extractBloco2(txt);
    expect(b2).toContain('corpo');
    expect(b2).not.toContain('Bloco 1 vai a seguir');
  });

  it('formato antigo "BLOCO 2 — PROMPT PARA O SIMULADOR"', () => {
    const txt = 'intro\n\nBLOCO 2 — PROMPT PARA O SIMULADOR\ncorpo antigo';
    const b2 = extractBloco2(txt);
    expect(b2).not.toBeNull();
    expect(b2).toContain('BLOCO 2');
    expect(b2).toContain('corpo antigo');
    expect(b2).not.toContain('intro');
  });

  it('sem o marcador -> null', () => {
    expect(extractBloco2('só uma conversa sem prompt gerado')).toBeNull();
  });

  it('entrada não-string -> null', () => {
    expect(extractBloco2(null)).toBeNull();
    expect(extractBloco2(undefined)).toBeNull();
    expect(extractBloco2(42)).toBeNull();
    expect(extractBloco2({})).toBeNull();
  });

  it('string vazia -> null', () => {
    expect(extractBloco2('')).toBeNull();
  });
});

// =====================================================================
// UNITÁRIO — extractBloco1
// =====================================================================
describe('extractBloco1', () => {
  it('das seções [II] até [VI] (exclusivo)', () => {
    const txt = [
      '## [I. CONTENÇÃO]', 'i', '',
      '## [II. IDENTIDADE]', 'ii', '',
      '## [III. VOZ]', 'iii', '',
      '## [VI. EXTRA]', 'nao deve entrar',
    ].join('\n');
    const b1 = extractBloco1(txt);
    expect(b1.startsWith('## [II. IDENTIDADE]')).toBe(true);
    expect(b1).toContain('iii');
    expect(b1).not.toContain('nao deve entrar');
    expect(b1).not.toContain('[VI');
  });

  it('sem seção VI: corta no "---" depois da seção V', () => {
    const txt = [
      '## [II. IDENTIDADE]', 'ii', '',
      '## [V. ABERTURA]', 'conteudo da V', '',
      '---', '', 'rodapé que não entra no gabarito',
    ].join('\n');
    const b1 = extractBloco1(txt);
    expect(b1).toContain('conteudo da V');
    expect(b1).not.toContain('rodapé');
    expect(b1.trim().endsWith('conteudo da V')).toBe(true);
  });

  it('sem [II] -> string vazia', () => {
    expect(extractBloco1('## [I. CONTENÇÃO]\nsem identidade')).toBe('');
  });

  // Ponto sutil: o numeral tem de casar por completo. "[V" NÃO pode casar dentro de
  // "[VI". Se casasse, o corte de VI aconteceria no header da PRÓPRIA seção V.
  it('[V] não casa dentro de [VI]: a seção V inteira permanece no bloco 1', () => {
    const txt = [
      '## [II. IDENTIDADE]', 'ii', '',
      '## [V. ABERTURA E CONTINUIDADE]', 'texto exclusivo da V', '',
      '## [VI. FECHAMENTO]', 'texto da VI fora do gabarito',
    ].join('\n');
    const b1 = extractBloco1(txt);
    // A seção V deve estar inteira dentro do bloco 1...
    expect(b1).toContain('## [V. ABERTURA E CONTINUIDADE]');
    expect(b1).toContain('texto exclusivo da V');
    // ...e o corte acontece só na VI.
    expect(b1).not.toContain('texto da VI fora do gabarito');
    expect(b1).not.toContain('## [VI');
  });

  it('template REAL (I..V, sem VI): bloco1 começa em [II] e termina antes do "---" pós-V', () => {
    const b1 = extractBloco1(REAL_FROM_I);
    expect(b1.startsWith('## [II. IDENTIDADE]')).toBe(true);
    expect(b1).toContain('## [V. ABERTURA E CONTINUIDADE]');
    expect(b1).not.toContain('## [I. CONTENÇÃO]');
  });

  it('entrada não-string -> string vazia', () => {
    expect(extractBloco1(null)).toBe('');
    expect(extractBloco1(123)).toBe('');
  });
});

// =====================================================================
// UNITÁRIO — extractMeta
// =====================================================================
describe('extractMeta', () => {
  it('nome de "Você representa NOME,"', () => {
    const meta = extractMeta('Você representa Maria Silva, uma mulher de meia-idade.');
    expect(meta.name).toBe('Maria Silva');
  });

  // A idade é lida DO parágrafo descritivo — que só é capturado quando delimitado
  // por um próximo "###"/"##"/"**Camada". Sem delimitador, não há descrição nem idade.
  it('idade de "34 anos" no parágrafo descritivo (com delimitador de seção)', () => {
    const txt = '### Quem ela é\n\nMaria tem 34 anos e mora sozinha.\n\n### Próxima';
    const meta = extractMeta(txt);
    expect(meta.age).toBe(34);
  });

  it('descrição de "### Quem ela é"', () => {
    const txt = '### Quem ela é\n\nUma advogada de 40 anos, ansiosa e reservada.\n\n### Outra seção';
    const meta = extractMeta(txt);
    expect(meta.description).toContain('advogada');
    expect(meta.age).toBe(40);
  });

  it('descrição de "### Quem ele é" (masculino)', () => {
    const txt = '### Quem ele é\n\nUm homem de 50 anos, aposentado.\n\n### Fim';
    const meta = extractMeta(txt);
    expect(meta.description).toContain('aposentado');
    expect(meta.age).toBe(50);
  });

  it('formato antigo "QUEM ESSA PESSOA É"', () => {
    // O terminador do formato antigo é uma linha em CAIXA ALTA ASCII (sem acentos).
    const txt = 'QUEM ESSA PESSOA É\nUma jovem de 22 anos.\n\nOUTRA SECAO EM CAIXA\ntexto';
    const meta = extractMeta(txt);
    expect(meta.description).toContain('jovem');
    expect(meta.age).toBe(22);
  });

  it('idade fora de 1..120 é ignorada', () => {
    const txt = '### Quem ela é\n\nUma pessoa de 200 anos (impossível).\n\n### Fim';
    const meta = extractMeta(txt);
    expect(meta.age).toBeNull();
  });

  it('descrição truncada em 240 chars', () => {
    const longa = 'x'.repeat(500);
    const txt = `### Quem ela é\n\n${longa}\n\n### Fim`;
    const meta = extractMeta(txt);
    expect(meta.description.length).toBe(240);
  });

  it('entrada não-string -> meta vazia', () => {
    const meta = extractMeta(null);
    expect(meta).toEqual({ name: '', age: null, description: '' });
  });
});

// =====================================================================
// UNITÁRIO — extractBlocos (composição)
// =====================================================================
describe('extractBlocos', () => {
  it('ready é !!bloco2', () => {
    expect(extractBlocos('sem prompt').ready).toBe(false);
    expect(extractBlocos(REAL_FROM_I).ready).toBe(true);
  });

  it('devolve { ready, bloco1, bloco2, meta }', () => {
    const r = extractBlocos(REAL_FROM_I);
    expect(r).toHaveProperty('ready');
    expect(r).toHaveProperty('bloco1');
    expect(r).toHaveProperty('bloco2');
    expect(r).toHaveProperty('meta');
  });

  it('bloco1 é SUBCONJUNTO do bloco2 quando ambos existem', () => {
    const r = extractBlocos(REAL_FROM_I);
    expect(r.bloco2).toContain(r.bloco1);
  });

  it('sem prompt: bloco2 null, bloco1 vazio, ready false', () => {
    const r = extractBlocos('apenas uma conversa');
    expect(r.bloco2).toBeNull();
    expect(r.bloco1).toBe('');
    expect(r.ready).toBe(false);
  });
});

// =====================================================================
// HTTP — GET /api/entrevistador-prompt (admin-only)
// =====================================================================
describe('GET /api/entrevistador-prompt', () => {
  it('admin -> 200 com { prompt }', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).get('/api/entrevistador-prompt').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(typeof res.body.prompt).toBe('string');
    expect(res.body.prompt.length).toBeGreaterThan(0);
  });

  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).get('/api/entrevistador-prompt').set(authHeader(aluno));
    expect(res.status).toBe(403);
  });

  it('professor -> 403', async () => {
    const prof = await loginAs('prof');
    const res = await request(app).get('/api/entrevistador-prompt').set(authHeader(prof));
    expect(res.status).toBe(403);
  });

  it('visitante -> 403', async () => {
    const visit = await loginVisitor();
    const res = await request(app).get('/api/entrevistador-prompt').set(authHeader(visit));
    expect(res.status).toBe(403);
  });
});

// =====================================================================
// HTTP — POST /api/entrevistador/extract (admin-only)
// =====================================================================
describe('POST /api/entrevistador/extract', () => {
  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/entrevistador/extract').set(authHeader(aluno)).send({ text: REAL_FROM_I });
    expect(res.status).toBe(403);
  });

  it('admin com { text } -> 200 { ready, bloco1, bloco2, meta }', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/entrevistador/extract').set(authHeader(admin)).send({ text: REAL_FROM_I });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.bloco2).toContain('## [I. CONTENÇÃO]');
    expect(res.body.bloco1).toContain('## [II. IDENTIDADE]');
  });

  it('admin com { messages } concatena só as do assistant', async () => {
    const admin = await loginAs('admin');
    const messages = [
      { role: 'user', content: 'quero um caso' },
      { role: 'assistant', content: REAL_FROM_I },
    ];
    const res = await request(app).post('/api/entrevistador/extract').set(authHeader(admin)).send({ messages });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it('sem text nem messages -> 400', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/entrevistador/extract').set(authHeader(admin)).send({});
    expect(res.status).toBe(400);
  });
});

// =====================================================================
// HTTP — POST /api/entrevistador/character (admin-only)
// =====================================================================
describe('POST /api/entrevistador/character', () => {
  it('aluno -> 403', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/entrevistador/character').set(authHeader(aluno))
      .send({ specificInstruction: '## [I. CONTENÇÃO]\ncorpo', name: 'X' });
    expect(res.status).toBe(403);
  });

  it('transcrição sem "## [I." (prompt não gerado) -> 422', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/entrevistador/character').set(authHeader(admin))
      .send({ text: 'só uma conversa, sem prompt gerado', name: 'Maria' });
    expect(res.status).toBe(422);
  });

  it('specificInstruction explícito + name -> cria', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/entrevistador/character').set(authHeader(admin))
      .send({ specificInstruction: '## [I. CONTENÇÃO]\npersona', evaluationCriteria: '## [II. IDENTIDADE]\ngabarito', name: 'Maria', age: 30, description: 'desc' });
    expect(res.status).toBe(200);
    expect(res.body.id).toMatch(/^fp/);
    expect(res.body.name).toBe('Maria');
    expect(res.body.age).toBe(30);
    expect(res.body.specificInstruction).toContain('persona');
    expect(res.body.evaluationCriteria).toContain('gabarito');
  });

  it('specificInstruction explícito sem name -> 400', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/entrevistador/character').set(authHeader(admin))
      .send({ specificInstruction: '## [I. CONTENÇÃO]\npersona' });
    expect(res.status).toBe(400);
  });

  it('age fora de 1..120 -> null', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/entrevistador/character').set(authHeader(admin))
      .send({ specificInstruction: '## [I. CONTENÇÃO]\npersona', name: 'Zé', age: 999 });
    expect(res.status).toBe(200);
    expect(res.body.age).toBeNull();
  });

  it('cria com specificInstruction=Bloco2 e evaluationCriteria=Bloco1 a partir da transcrição', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/entrevistador/character').set(authHeader(admin))
      .send({ text: REAL_FROM_I, name: 'Paciente Real' });
    expect(res.status).toBe(200);
    expect(res.body.specificInstruction).toContain('## [I. CONTENÇÃO]');
    expect(res.body.evaluationCriteria).toContain('## [II. IDENTIDADE]');
  });

  it('personagem criado aparece em GET /api/freeplay; ALUNO não vê os dois campos secretos', async () => {
    const admin = await loginAs('admin');
    const create = await request(app).post('/api/entrevistador/character').set(authHeader(admin))
      .send({ specificInstruction: '## [I. CONTENÇÃO]\nSEGREDO_PERSONA', evaluationCriteria: '## [II.]\nSEGREDO_GABARITO', name: 'Novo' });
    const id = create.body.id;

    const aluno = await loginAs('aluno');
    const list = await request(app).get('/api/freeplay').set(authHeader(aluno));
    expect(list.status).toBe(200);
    const found = list.body.find((c) => c.id === id);
    expect(found).toBeTruthy();
    expect(found.name).toBe('Novo');
    expect(found).not.toHaveProperty('specificInstruction');
    expect(found).not.toHaveProperty('evaluationCriteria');
    expect(JSON.stringify(list.body)).not.toContain('SEGREDO_PERSONA');
    expect(JSON.stringify(list.body)).not.toContain('SEGREDO_GABARITO');
  });
});
