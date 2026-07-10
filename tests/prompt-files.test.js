// Os prompts de IA são carregados do disco POR NOME, em runtime. Um rename (ou um
// arquivo esquecido fora do commit) não quebra o boot: quebra a feature, silenciosamente,
// só quando um usuário a aciona.
//
// Foi exatamente assim que o avaliador de sessão ficou inutilizável — o código procurava
// `avaliacao/avaliador.md`, que nunca existiu (o arquivo real é `avaliador-v16-2.md`).
// O admin ligava a avaliação e o aluno recebia 500 ao terminar a sessão.
//
// Os testes de HTTP NÃO pegam isso: com `OPENAI_API_KEY=''` a rota /api/evaluate
// devolve `disabled`/demo ANTES de chegar em `loadEvaluatorPrompt()`. Por isso este
// arquivo verifica os nomes direto no código-fonte e no disco.

const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const SERVER_SRC = fs.readFileSync(path.join(SERVER_DIR, 'index.js'), 'utf-8');

/** Todo `loadPromptFile('x.md')` literal no server. */
function referencedPromptFiles() {
  return [...SERVER_SRC.matchAll(/loadPromptFile\(\s*'([^']+\.md)'\s*\)/g)].map((m) => m[1]);
}

/** Os candidatos de EVALUATOR_PROMPT_FILES = ['a.md', 'b.md']. */
function evaluatorCandidates() {
  const m = SERVER_SRC.match(/const EVALUATOR_PROMPT_FILES\s*=\s*\[([^\]]+)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('prompts de IA carregados do disco', () => {
  it('todo loadPromptFile(...) do server aponta para um arquivo que existe', () => {
    const refs = referencedPromptFiles();
    // Se o regex parar de casar (refactor), o teste vira inútil sem avisar.
    expect(refs.length).toBeGreaterThan(0);
    for (const name of refs) {
      const p = path.join(SERVER_DIR, 'avaliacao', name);
      expect(fs.existsSync(p), `server/avaliacao/${name} não existe`).toBe(true);
      expect(fs.readFileSync(p, 'utf-8').trim().length).toBeGreaterThan(0);
    }
  });

  it('o avaliador de sessão resolve para um prompt existente', () => {
    const candidates = evaluatorCandidates();
    expect(candidates.length).toBeGreaterThan(0);
    const found = candidates.filter((n) => fs.existsSync(path.join(SERVER_DIR, 'avaliacao', n)));
    // Ao menos um candidato tem de existir, senão /api/evaluate responde 500 quando ligado.
    expect(found.length, `nenhum de ${candidates.join(', ')} existe em server/avaliacao/`).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(SERVER_DIR, 'avaliacao', found[0]), 'utf-8').trim().length)
      .toBeGreaterThan(100);
  });

  it('o avaliador comparativo (duelo) e o de progressão existem', () => {
    for (const name of ['avaliador-comparativo-v2.md', 'avaliador-progressao-v2.md']) {
      expect(referencedPromptFiles(), `${name} deixou de ser referenciado no server`).toContain(name);
      expect(fs.existsSync(path.join(SERVER_DIR, 'avaliacao', name))).toBe(true);
    }
  });

  it('o prompt do entrevistador existe e é referenciado', () => {
    expect(SERVER_SRC).toContain("'promptentrevistador.md'");
    const p = path.join(SERVER_DIR, 'entrevistador', 'promptentrevistador.md');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf-8').length).toBeGreaterThan(1000);
  });

  it('o conteúdo do seed (pacientes e exercícios) existe e é versionável', () => {
    // Sem server/seed/, um deploy limpo (Railway) sobe sem paciente nenhum.
    for (const name of ['freeplay-characters.json', 'exercises.json']) {
      const p = path.join(SERVER_DIR, 'seed', name);
      expect(fs.existsSync(p), `server/seed/${name} não existe`).toBe(true);
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    }
  });

  it('o servidor não referencia Anthropic nem neuro', () => {
    expect(SERVER_SRC).not.toMatch(/anthropic/i);
    expect(SERVER_SRC).not.toMatch(/neuro-characters|neuro-tests|buildNeuroPrompt|\/api\/neuro/i);
  });
});
