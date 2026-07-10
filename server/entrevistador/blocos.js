// Extração dos blocos que o entrevistador produz ao final da entrevista.
//
// O entrevistador devolve, em texto corrido, o prompt do paciente estruturado em
// seções com numeral romano entre colchetes:
//
//   ## [I. CONTENÇÃO]            ← início do Bloco 2 (a persona, vai para o simulador)
//   ## [II. IDENTIDADE]          ← início do Bloco 1 (o gabarito, vai para o avaliador)
//   ## [III. VOZ E COMPORTAMENTO]
//   ## [IV. DINÂMICA TERAPÊUTICA]
//   ## [V. ABERTURA E CONTINUIDADE]
//   ## [VI. ...]                 ← opcional; quando existe, fecha o Bloco 1
//
//   Bloco 2 = da seção I até o fim do prompt (tudo que o paciente precisa saber).
//   Bloco 1 = seções II a V — o gabarito de correção. É um SUBCONJUNTO do Bloco 2.
//
// Nada aqui confia no formato: toda função devolve string vazia / null quando não
// encontra o que procura, e o chamador decide o que fazer.

// Só o numeral romano é obrigatório; o título depois dele é livre. O lookahead
// garante que o numeral esteja completo — sem ele, "[V" casaria dentro de "[VI".
const SECTION_BOUNDARY = '(?=[\\s.\\-:\\]])';

function sectionRegex(numeral) {
  return new RegExp(`##\\s*\\[\\s*${numeral}${SECTION_BOUNDARY}`, 'i');
}

// Frases com que o entrevistador costuma encerrar depois de cuspir o prompt.
// Cortamos aí para o Bloco 2 não carregar a conversa de despedida.
const END_PATTERNS = [
  /\n\s*-{3,}\s*\n\s*Pronto\.?\s*É só colar/i,
  /\n\s*Pronto\.?\s*É só colar/i,
  /\n\s*Pronto\.?\s*Obrigado pela construção/i,
  /\n\s*"?Pronto\.?\s*Bloco\s*1/i,
];

/**
 * Bloco 2 — o prompt do paciente (seção I em diante), pronto para
 * `specificInstruction`. Retorna null se o entrevistador ainda não gerou.
 */
function extractBloco2(text) {
  if (!text || typeof text !== 'string') return null;

  // Formato atual: começa em "## [I. CONTENÇÃO]".
  const startMatch = text.match(sectionRegex('I'));
  if (startMatch) {
    let body = text.slice(startMatch.index);
    for (const re of END_PATTERNS) {
      const m = body.match(re);
      if (m) { body = body.slice(0, m.index); break; }
    }
    return body.trim() || null;
  }

  // Formato antigo: "BLOCO 2 — PROMPT PARA O SIMULADOR".
  const oldStart = text.search(/BLOCO\s*2\b[^\n]*PROMPT/i);
  if (oldStart !== -1) {
    let body = text.slice(oldStart);
    for (const re of END_PATTERNS) {
      const m = body.match(re);
      if (m) { body = body.slice(0, m.index); break; }
    }
    return body.trim() || null;
  }

  return null;
}

/**
 * Bloco 1 — o gabarito (seções II a V), pronto para `evaluationCriteria`.
 * Aceita tanto o texto completo da entrevista quanto só o Bloco 2.
 * Retorna '' se a seção II não aparecer.
 */
function extractBloco1(text) {
  if (!text || typeof text !== 'string') return '';

  const startMatch = text.match(sectionRegex('II'));
  if (!startMatch) return '';
  const tail = text.slice(startMatch.index);

  // Preferência 1: corta na próxima seção [VI ...].
  const sectionVI = tail.search(sectionRegex('VI'));
  if (sectionVI !== -1) return tail.slice(0, sectionVI).trim();

  // Preferência 2: separador "---" em linha própria depois do header da V
  // (o template fecha assim quando não há seção VI).
  const vMatch = tail.match(sectionRegex('V'));
  if (vMatch) {
    const afterVStart = vMatch.index + vMatch[0].length;
    const afterV = tail.slice(afterVStart);
    const dashRel = afterV.search(/\n\s*---\s*(\n|$)/);
    if (dashRel !== -1) return tail.slice(0, afterVStart + dashRel).trim();
  }

  // Preferência 3: corta na frase de encerramento, se houver.
  for (const re of END_PATTERNS) {
    const m = tail.match(re);
    if (m) return tail.slice(0, m.index).trim();
  }

  return tail.trim();
}

/**
 * Metadados de exibição (nome, idade, descrição) inferidos do prompt.
 * Todos os campos são "melhor esforço" — o admin revisa antes de salvar.
 */
function extractMeta(text) {
  const meta = { name: '', age: null, description: '' };
  if (!text || typeof text !== 'string') return meta;

  // "Você representa NOME, ..." — vale nos dois formatos.
  const nomeMatch = text.match(/Você\s+representa\s+([^,.\n]+)/i);
  if (nomeMatch) meta.name = nomeMatch[1].trim();

  // Parágrafo descritivo. Formato atual: "### Quem ela/ele é".
  const quemMatch = text.match(
    /###\s*Quem\s+(?:ela|ele)\s+é\s*\n+([\s\S]+?)(?=\n\s*###|\n\s*##|\n\s*\*\*Camada)/i,
  );
  // Formato antigo: "QUEM ESSA PESSOA É" em caixa alta.
  const oldMatch = !quemMatch && text.match(/QUEM ESSA PESSOA É\s*\n([\s\S]+?)(?=\n[A-Z][A-Z\s—-]{4,}\n)/);

  const raw = (quemMatch && quemMatch[1]) || (oldMatch && oldMatch[1]) || '';
  if (raw) {
    const para = raw.trim().split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
    meta.description = para.slice(0, 240);
    const ageMatch = para.match(/\b(\d{1,3})\s*anos?\b/i);
    if (ageMatch) {
      const n = Number(ageMatch[1]);
      if (n > 0 && n <= 120) meta.age = n;
    }
  }

  return meta;
}

/**
 * Roda as três extrações sobre a transcrição do entrevistador.
 * `ready` indica se já dá para criar o personagem (isto é, se o Bloco 2 saiu).
 */
function extractBlocos(text) {
  const bloco2 = extractBloco2(text);
  // O gabarito vive dentro do Bloco 2; se ele existe, procuramos ali (mais
  // preciso). Senão, varremos a transcrição inteira.
  const bloco1 = extractBloco1(bloco2 || text);
  const meta = extractMeta(bloco2 || text);
  return { ready: !!bloco2, bloco1, bloco2, meta };
}

module.exports = { extractBloco1, extractBloco2, extractMeta, extractBlocos };
