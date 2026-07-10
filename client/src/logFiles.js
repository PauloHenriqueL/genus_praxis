// Utilitários compartilhados para COPIAR e BAIXAR logs de sessão e avaliações.

export const EVAL_SECTION_HEADER = '===========================\nAVALIAÇÃO\n===========================';

// Rótulos dos 6 critérios do avaliador clínico. Vivem aqui (módulo puro, sem
// React/CSS) porque tanto a <CriteriaTable> quanto o .txt exportado precisam deles.
export const CRITERIA_LABELS = {
  '1': 'Construção linguística',
  '2': 'Relação terapêutica',
  '3': 'Confiança transmitida',
  '4': 'Priorização',
  '5': 'Aprofundamento',
  '6': 'Flexibilidade e criatividade',
};

// "A3" → "3"; "1" → "1". O avaliador comparativo do duelo prefixa as chaves com A/B.
export function baseKey(k) {
  const m = /^[AB]?\s*0*(\d+)$/i.exec(String(k).trim());
  return m ? m[1] : String(k);
}

// `Number(null)`, `Number('')` e `Number([])` são 0 — todos passariam por um
// `Number.isFinite(Number(v))` e virariam "0/10" na tela do aluno, uma nota zero
// inventada. Só aceitamos número de verdade ou string numérica.
function isRealScore(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string' && v.trim() !== '') return Number.isFinite(Number(v));
  return false;
}

/** Pares [chave, nota] válidos, ordenados pelo número do critério. */
export function criteriaEntries(criteriaScores) {
  if (!criteriaScores || typeof criteriaScores !== 'object') return [];
  return Object.entries(criteriaScores)
    .filter(([, v]) => isRealScore(v))
    .sort((a, b) => {
      const na = Number(baseKey(a[0]));
      const nb = Number(baseKey(b[0]));
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
      return String(a[0]).localeCompare(String(b[0]));
    });
}

/**
 * Mensagens que o aluno de fato trocou com o paciente.
 *
 * Descarta a de kickoff (`isSystem`) e, na Simulação, os marcadores de troca de
 * sessão (`type: 'session-break'`). É o mesmo filtro da transcrição — as duas
 * telas usam esta função para não divergirem.
 */
export function realMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((m) => m && !m.isSystem && !m.type);
}

/** Há conversa de verdade? (habilita o botão "Log" no cabeçalho da sessão.) */
export function hasTranscript(messages) {
  return realMessages(messages).length > 0;
}

/**
 * Bloco "NOTAS POR CRITÉRIO" do .txt exportado. String vazia quando não há notas.
 * Só aparece nos downloads de professor/admin — o servidor não envia
 * `criteriaScores` para o aluno.
 */
export function criteriaSection(criteriaScores) {
  const rows = criteriaEntries(criteriaScores)
    .map(([k, v]) => `${CRITERIA_LABELS[baseKey(k)] || `Critério ${k}`}: ${Number(v)}/10`);
  if (!rows.length) return '';
  return `\n\n===========================\nNOTAS POR CRITÉRIO (professor)\n===========================\n\n${rows.join('\n')}`;
}

export function evalSection(evaluationText) {
  const t = (evaluationText || '').trim();
  return t ? `\n\n${EVAL_SECTION_HEADER}\n\n${t}` : '';
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      ok ? resolve() : reject(new Error('copy falhou'));
    } catch (e) { reject(e); }
  });
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Monta a lista de itens pro <LogActions>. getEval/getBoth podem ser null quando
// não há avaliação (aí só o item "Log" aparece).
export function makeLogItems({ baseName, getLog, getEval, getBoth }) {
  const date = new Date().toISOString().slice(0, 10);
  const base = (baseName || 'sessao').toString().replace(/\s+/g, '_').slice(0, 60) || 'sessao';
  if (!getEval) {
    return [{ key: 'log', label: 'Log', build: getLog, filename: `log-${base}-${date}.txt` }];
  }
  return [
    { key: 'log', label: 'Log', build: getLog, filename: `log-${base}-${date}.txt` },
    { key: 'eval', label: 'Avaliação', build: getEval, filename: `avaliacao-${base}-${date}.txt` },
    { key: 'both', label: 'Tudo', build: getBoth, filename: `log-avaliacao-${base}-${date}.txt` },
  ];
}
