// Metadados de display da Trilha de Competências (SkillMap).
// Só nomes e cores das 5 competências clínicas. A montagem dos system prompts
// vive no servidor (server/prompts.js) — o cliente nunca envia systemPrompt.
//
// As cores originais do All_OS (verde/terra/sage) foram remapeadas para a
// paleta laranja/roxo do Genus Práxis.

export const SKILL_NAMES = {
  1: 'Hermenêutica',
  2: 'Estrutura',
  3: 'Empatia',
  4: 'Especificidade do caso',
  5: 'Eu',
};

export const SKILL_COLORS = {
  1: '#ff6200', // laranja        — Hermenêutica
  2: '#7a34b8', // roxo claro     — Estrutura
  3: '#e05200', // laranja forte  — Empatia
  4: '#b06adf', // lilás          — Especificidade do caso
  5: '#c14503', // laranja fundo  — Eu
};
