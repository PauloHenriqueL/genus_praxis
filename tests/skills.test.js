// Competências da Trilha (demandas #5a e #5b).
//
// O teste que justifica a #5a inteira é `os critérios editados chegam ao PROMPT`. Sem ele,
// a demanda seria cosmética: o admin editaria um texto que não muda nada. Antes desta
// demanda os critérios viviam num objeto hardcoded em `server/prompts.js`.
const {
  app, request, resetData, readData, writeData,
  loginAs, loginVisitor, authHeader,
} = require('./helpers');

const { buildExercisePrompt } = require('../server/prompts');
const { defaultSkills, nextSkillId, sanitizeSkill } = require('../server/skills');

beforeEach(() => resetData());

const getSkills = (token) => request(app).get('/api/skills').set(authHeader(token));
const createSkill = (token, body) => request(app).post('/api/admin/skills').set(authHeader(token)).send(body);
const updateSkill = (token, id, body) => request(app).put(`/api/admin/skills/${id}`).set(authHeader(token)).send(body);
const deleteSkill = (token, id, confirm) =>
  request(app).delete(`/api/admin/skills/${id}${confirm ? '?confirm=1' : ''}`).set(authHeader(token));

describe('GET /api/skills', () => {
  it('admin recebe criteria + a contagem de exercícios', async () => {
    const admin = await loginAs('admin');
    const res = await getSkills(admin);
    expect(res.status).toBe(200);

    const s1 = res.body.find((s) => s.id === 1);
    expect(typeof s1.criteria).toBe('string');
    expect(s1.criteria.length).toBeGreaterThan(0);
    // As fixtures têm 1 exercício em cada uma das competências 1, 2 e 3.
    expect(s1.exerciseCount).toBe(1);
    expect(res.body.find((s) => s.id === 5).exerciseCount).toBe(0);
  });

  // Os critérios são material de AVALIAÇÃO: dizem à IA o que ela deve cobrar. Entregá-los
  // ao aluno é entregar o gabarito do que está sendo medido.
  it('aluno e visitante NÃO recebem os criteria', async () => {
    for (const token of [await loginAs('aluno'), await loginVisitor()]) {
      const res = await getSkills(token);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body[0]).sort()).toEqual(['color', 'id', 'name']);
      expect(JSON.stringify(res.body)).not.toContain('Critério 8');
    }
  });

  it('exige autenticação', async () => {
    expect((await request(app).get('/api/skills')).status).toBe(401);
  });
});

// ⚠ SEM ISTO A #5a NÃO EXISTE. O `buildExercisePrompt` lia um SKILL_CRITERIA hardcoded;
// agora recebe o texto do skills.json. Se este teste cair, o admin edita os critérios e o
// paciente continua rodando com os antigos — em silêncio.
describe('#5a — os critérios editados chegam ao PROMPT do paciente', () => {
  it('o texto salvo pelo admin aparece no system prompt do exercício', async () => {
    const admin = await loginAs('admin');
    await updateSkill(admin, 2, {
      name: 'Estrutura', color: '#7a34b8', criteria: 'MARCADOR_UNICO_DE_CRITERIO_XYZ',
    });

    // O exercício 'ex-test-2' é da competência 2.
    const skill = readData('skills.json').find((s) => s.id === 2);
    const prompt = buildExercisePrompt(skill.criteria, 'instrução do exercício');

    expect(prompt).toContain('MARCADOR_UNICO_DE_CRITERIO_XYZ');
    expect(prompt).toContain('instrução do exercício');
  });

  // Um exercício ÓRFÃO (competência apagada) monta o prompt SEM os critérios. É degradação
  // consciente (D4), não erro — e é por isso que o admin é avisado ao apagar.
  it('exercício órfão → prompt sem a seção de critérios (degrada, não quebra)', async () => {
    // ⚠ Não dá para procurar "Critério 8" aqui: esse texto também aparece no
    // GENERAL_INSTRUCTION, que é comum a todos os exercícios. Comparamos os dois prompts:
    // o do órfão é o mesmo, MENOS os critérios da competência.
    const comCriterios = buildExercisePrompt('CRITERIOS_DA_COMPETENCIA_ABC', 'instrução do exercício');
    const orfao = buildExercisePrompt('', 'instrução do exercício');

    expect(comCriterios).toContain('CRITERIOS_DA_COMPETENCIA_ABC');
    expect(orfao).not.toContain('CRITERIOS_DA_COMPETENCIA_ABC');
    // O resto do prompt continua de pé — degrada, não quebra.
    expect(orfao).toContain('instrução do exercício');
    expect(orfao.length).toBeGreaterThan(100);
  });
});

describe('#5a — editar', () => {
  it('admin edita nome, cor e critérios', async () => {
    const admin = await loginAs('admin');
    const res = await updateSkill(admin, 1, {
      name: 'Hermenêutica Clínica', color: '#00ff00', criteria: 'novos critérios',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: 'Hermenêutica Clínica', color: '#00ff00' });

    const disco = readData('skills.json').find((s) => s.id === 1);
    expect(disco.criteria).toBe('novos critérios');
  });

  // O id é a chave que os exercícios e os LOGS guardam. Deixar o cliente trocá-lo
  // reapontaria exercícios para a competência errada, em silêncio.
  it('o id é IMUTÁVEL (mandar outro no corpo é ignorado)', async () => {
    const admin = await loginAs('admin');
    const res = await updateSkill(admin, 1, {
      id: 99, name: 'Nome Válido', color: '#ffffff', criteria: '',
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(readData('skills.json').some((s) => s.id === 99)).toBe(false);
  });

  it('validação: nome curto e cor inválida → 400 com o campo', async () => {
    const admin = await loginAs('admin');

    const semNome = await updateSkill(admin, 1, { name: 'X', color: '#ff6200', criteria: '' });
    expect(semNome.status).toBe(400);
    expect(semNome.body.fields[0].field).toBe('name');

    const corRuim = await updateSkill(admin, 1, { name: 'Válido', color: 'vermelho', criteria: '' });
    expect(corRuim.status).toBe(400);
    expect(corRuim.body.fields[0].field).toBe('color');
  });

  it('competência inexistente → 404', async () => {
    const admin = await loginAs('admin');
    expect((await updateSkill(admin, 999, { name: 'X', color: '#ff6200' })).status).toBe(404);
  });

  it('aluno não edita (rota é de admin)', async () => {
    const aluno = await loginAs('aluno');
    expect((await updateSkill(aluno, 1, { name: 'Hack', color: '#ff6200' })).status).toBe(403);
  });
});

describe('#5b — adicionar', () => {
  it('cria uma 6ª competência com id novo', async () => {
    const admin = await loginAs('admin');
    const res = await createSkill(admin, { name: 'Ética', color: '#22aa66', criteria: 'conduta ética' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(6);
    expect(readData('skills.json').length).toBe(6);
  });

  // O id NUNCA é reciclado: um exercício órfão que apontava para a competência 5 apagada
  // "renasceria" apontando para a competência nova — silenciosamente errado.
  // 🔴 BUG REAL, achado por este teste. `max(ids)+1` sobre a lista VIVA reciclava o id:
  // apagada a competência 5, o max caía para 4 e a nova nascia com id 5 — herdando os
  // exercícios órfãos da apagada, que voltariam à trilha ligados à competência ERRADA.
  it('o id de uma competência APAGADA nunca é reaproveitado', async () => {
    const admin = await loginAs('admin');
    await deleteSkill(admin, 5, true);                       // apaga a 5 (a de maior id)
    const res = await createSkill(admin, { name: 'Nova', color: '#123456', criteria: '' });

    expect(res.body.id).not.toBe(5);
    expect(res.body.id).toBe(6);
  });

  it('o id usado por um exercício ÓRFÃO também não é reciclado', async () => {
    const admin = await loginAs('admin');
    // ex-test-3 é da competência 3. Apagamos a 3, a 4 e a 5: o maior id VIVO vira 2, mas
    // o 3 continua gravado no exercício órfão.
    await deleteSkill(admin, 5, true);
    await deleteSkill(admin, 4, true);
    await deleteSkill(admin, 3, true);
    expect(readData('skills.json').map((s) => s.id)).toEqual([1, 2]);

    const res = await createSkill(admin, { name: 'Nova', color: '#123456', criteria: '' });
    // Se nascesse com id 3, adotaria o ex-test-3 órfão sem ninguém pedir.
    expect(res.body.id).toBe(6);

    // Só 1 órfão: das três competências apagadas (3, 4, 5), apenas a 3 tinha exercício.
    const orfaos = (await request(app).get('/api/admin/skills/orphans').set(authHeader(admin))).body;
    expect(orfaos.map((o) => o.id)).toEqual(['ex-test-3']);
    // E ele NÃO foi adotado pela competência nova.
    expect(orfaos[0].skillId).toBe(3);
  });

  it('validação: sem nome → 400', async () => {
    const admin = await loginAs('admin');
    expect((await createSkill(admin, { name: '', color: '#ff6200' })).status).toBe(400);
  });

  it('aluno não cria', async () => {
    const aluno = await loginAs('aluno');
    expect((await createSkill(aluno, { name: 'X', color: '#ff6200' })).status).toBe(403);
  });
});

// D4: apagar deixa os exercícios ÓRFÃOS. A decisão foi essa — mas o combinado é que isso
// seja VISÍVEL, não silencioso.
describe('#5b — apagar (D4: deixa órfão, mas avisa)', () => {
  it('sem confirm → 409 com a contagem de órfãos (não apaga nada)', async () => {
    const admin = await loginAs('admin');
    const res = await deleteSkill(admin, 1, false);

    expect(res.status).toBe(409);
    expect(res.body.needsConfirm).toBe(true);
    expect(res.body.orphanCount).toBe(1);       // ex-test-1 é da competência 1
    expect(res.body.skillName).toBe('Hermenêutica');
    expect(readData('skills.json').length).toBe(5);   // continua tudo lá
  });

  it('com confirm → apaga e informa quantos ficaram órfãos', async () => {
    const admin = await loginAs('admin');
    const res = await deleteSkill(admin, 1, true);

    expect(res.status).toBe(200);
    expect(res.body.orphanCount).toBe(1);
    expect(readData('skills.json').some((s) => s.id === 1)).toBe(false);
  });

  it('o exercício órfão CONTINUA existindo (não é apagado junto)', async () => {
    const admin = await loginAs('admin');
    await deleteSkill(admin, 1, true);

    const ex = readData('exercises.json').find((e) => e.id === 'ex-test-1');
    expect(ex).toBeTruthy();
    expect(ex.skillId).toBe(1);   // aponta para uma competência que não existe mais
  });

  it('competência inexistente → 404; aluno → 403', async () => {
    const admin = await loginAs('admin');
    const aluno = await loginAs('aluno');
    expect((await deleteSkill(admin, 999, true)).status).toBe(404);
    expect((await deleteSkill(aluno, 1, true)).status).toBe(403);
  });
});

// Sem esta rota, um exercício órfão simplesmente DESAPARECE — some da trilha e ninguém
// nunca mais o encontra para reatribuir.
describe('GET /api/admin/skills/orphans', () => {
  it('lista os exercícios que apontam para competência inexistente', async () => {
    const admin = await loginAs('admin');
    expect((await request(app).get('/api/admin/skills/orphans').set(authHeader(admin))).body).toEqual([]);

    await deleteSkill(admin, 1, true);

    const res = await request(app).get('/api/admin/skills/orphans').set(authHeader(admin));
    expect(res.body.length).toBe(1);
    expect(res.body[0]).toMatchObject({ id: 'ex-test-1', skillId: 1 });
  });

  it('exercício com skillId nulo também conta como órfão', async () => {
    const exercicios = readData('exercises.json');
    exercicios[0].skillId = null;
    writeData('exercises.json', exercicios);

    const admin = await loginAs('admin');
    const res = await request(app).get('/api/admin/skills/orphans').set(authHeader(admin));
    expect(res.body.some((o) => o.id === 'ex-test-1')).toBe(true);
  });

  it('aluno não vê a lista de órfãos', async () => {
    const aluno = await loginAs('aluno');
    expect((await request(app).get('/api/admin/skills/orphans').set(authHeader(aluno))).status).toBe(403);
  });
});

// A ordem da lista É a ordem dos vértices no polígono do SkillMap.
describe('POST /api/admin/skills/reorder', () => {
  it('reordena', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/admin/skills/reorder').set(authHeader(admin))
      .send({ ids: ['5', '4', '3', '2', '1'] });

    expect(res.status).toBe(200);
    expect(readData('skills.json').map((s) => s.id)).toEqual([5, 4, 3, 2, 1]);
  });

  // Uma lista incompleta APAGARIA as competências que faltassem — o `ordered` seria menor
  // que o original e sobrescreveria o arquivo.
  it('lista incompleta → 400 (não apaga o resto)', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/admin/skills/reorder').set(authHeader(admin))
      .send({ ids: ['1', '2'] });

    expect(res.status).toBe(400);
    expect(readData('skills.json').length).toBe(5);
  });

  it('id desconhecido → 400', async () => {
    const admin = await loginAs('admin');
    const res = await request(app).post('/api/admin/skills/reorder').set(authHeader(admin))
      .send({ ids: ['1', '2', '3', '4', '99'] });
    expect(res.status).toBe(400);
    expect(readData('skills.json').length).toBe(5);
  });

  it('aluno não reordena', async () => {
    const aluno = await loginAs('aluno');
    const res = await request(app).post('/api/admin/skills/reorder').set(authHeader(aluno))
      .send({ ids: ['1', '2', '3', '4', '5'] });
    expect(res.status).toBe(403);
  });
});

// --- módulo puro (server/skills.js) ---
describe('server/skills.js', () => {
  it('nasce com as 5 competências originais', () => {
    const s = defaultSkills();
    expect(s.length).toBe(5);
    expect(s.map((x) => x.name)).toContain('Hermenêutica');
    for (const sk of s) {
      expect(sk.criteria.length, sk.name).toBeGreaterThan(0);
    }
  });

  it('defaultSkills() devolve cópias (mutar o resultado não corrompe o default)', () => {
    defaultSkills()[0].name = 'Corrompido';
    expect(defaultSkills()[0].name).toBe('Hermenêutica');
  });

  it('nextSkillId nunca recicla — nem um id que só existe em exercício órfão', () => {
    expect(nextSkillId([{ id: 1 }, { id: 7 }, { id: 3 }])).toBe(8);
    expect(nextSkillId([])).toBe(1);
    // O id 9 não está mais na lista viva, mas um exercício (ou log) ainda o referencia.
    expect(nextSkillId([{ id: 1 }], [9, 3])).toBe(10);
  });

  it('sanitizeSkill: apara, valida e trunca', () => {
    const ok = sanitizeSkill({ name: '  Ética  ', color: '#22AA66', criteria: ' x ' }, { id: 9 });
    expect(ok.errors).toEqual([]);
    expect(ok.skill).toEqual({ id: 9, name: 'Ética', color: '#22AA66', criteria: 'x' });

    expect(sanitizeSkill({ name: 'A', color: '#fff' }).errors.length).toBe(2); // nome + cor
    expect(sanitizeSkill({}).errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('sanitizeSkill não quebra com lixo', () => {
    for (const v of [null, undefined, 42, []]) {
      expect(() => sanitizeSkill(v)).not.toThrow();
    }
  });
});
