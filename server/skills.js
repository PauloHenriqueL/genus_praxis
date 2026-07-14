// Competências da Trilha (demandas #5a e #5b).
//
// FONTE ÚNICA. Antes, as competências viviam em TRÊS lugares que podiam divergir:
//   - `server/prompts.js`  → SKILL_CRITERIA (entrava no system prompt do paciente)
//   - `client/utils/skills.js` → SKILL_NAMES + SKILL_COLORS (só display)
//   - `client/pages/SkillMap.jsx` → um pentágono com 5 ângulos FIXOS
// Agora tudo sai de `skills.json`, e o client lê do servidor.
//
// ⚠ O `id` é ESTÁVEL e nunca é reciclado. Os logs gravam `skillId`, e os exercícios
// apontam para ele — reaproveitar o id de uma competência apagada faria os exercícios
// órfãos "renascerem" apontando para a competência errada, em silêncio.

const DEFAULT_SKILLS = [
  {
    id: 1,
    name: 'Hermenêutica',
    color: '#ff6200',
    criteria: 'Critério 8 (Formulação de caso ×1) + Critério 9 (Insight/Potência ×2)',
  },
  {
    id: 2,
    name: 'Estrutura',
    color: '#7a34b8',
    criteria: 'Critério 1 (Abertura e Encerramento ×1) + Critério 10 (Setting ×1)',
  },
  {
    id: 3,
    name: 'Empatia',
    color: '#e05200',
    criteria: 'Critério 3 (Construção do vínculo ×2) + Critério 5 (Confiança enquanto profissional ×1)',
  },
  {
    id: 4,
    name: 'Especificidade do caso',
    color: '#b06adf',
    criteria: 'Critério 6 (Priorização ×2) + Critério 7 (Esquema de aprofundamento ×2)',
  },
  {
    id: 5,
    name: 'Eu',
    color: '#c14503',
    criteria: 'Critério 2 (Escuta ×2) + Critério 4 (Manejo do próprio estado ×1)',
  },
];

/** Ordem = a do array. Só isto define a posição no polígono do SkillMap. */
function defaultSkills() {
  return DEFAULT_SKILLS.map((s) => ({ ...s }));
}

/**
 * Próximo id livre. NUNCA recicla — ver o aviso no topo.
 *
 * ⚠ `max(ids) + 1` sobre a lista VIVA **não basta**, e este foi um bug real: apagada a
 * competência 5, o max cai para 4 e a próxima nasce com id 5 — herdando os exercícios
 * órfãos e os logs da competência apagada, que voltariam ligados à competência ERRADA,
 * em silêncio.
 *
 * Por isso a conta considera três fontes, e o resultado é o maior + 1:
 *   - `skills`  — as competências vivas;
 *   - `usedIds` — os `skillId` gravados em exercícios e logs (a memória do que já existiu);
 *   - `floor`   — uma marca d'água persistida, que sobrevive mesmo quando as duas
 *                 anteriores esquecem (apaguei a competência 5 e nenhum exercício a usava).
 */
function nextSkillId(skills, usedIds = [], floor = 0) {
  const todos = [
    ...skills.map((s) => Number(s.id) || 0),
    ...usedIds.map((v) => Number(v) || 0),
    Number(floor) || 0,
  ];
  return todos.reduce((m, n) => Math.max(m, n), 0) + 1;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Sanitiza o que veio do admin. Devolve `{ skill, errors }`. */
function sanitizeSkill(raw, { id } = {}) {
  const errors = [];
  const name = String((raw && raw.name) || '').trim();
  const color = String((raw && raw.color) || '').trim();
  const criteria = String((raw && raw.criteria) || '').trim();

  if (name.length < 2) errors.push({ field: 'name', error: 'O nome é obrigatório.' });
  if (name.length > 60) errors.push({ field: 'name', error: 'O nome é longo demais (máx. 60).' });
  if (!HEX.test(color)) errors.push({ field: 'color', error: 'Cor inválida. Use hexadecimal, ex.: #ff6200.' });
  if (criteria.length > 2000) errors.push({ field: 'criteria', error: 'Os critérios são longos demais (máx. 2000).' });

  return {
    errors,
    skill: { id, name, color, criteria: criteria.slice(0, 2000) },
  };
}

module.exports = { DEFAULT_SKILLS, defaultSkills, nextSkillId, sanitizeSkill };
