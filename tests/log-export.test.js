// Exportação de logs em .txt (client/src/logFiles.js).
//
// Módulo puro — sem React, sem CSS, sem DOM — por isso dá para testar direto aqui,
// no ambiente node da suíte. As funções de download/clipboard não são exercitadas
// (precisam de DOM); o que interessa é a MONTAGEM do texto.
//
// O bloco "NOTAS POR CRITÉRIO" só aparece nos downloads de professor/admin: o
// servidor nem envia `criteriaScores` para o aluno (ver tests/security.test.js).

const {
  criteriaSection, criteriaEntries, baseKey, CRITERIA_LABELS, evalSection, makeLogItems,
  realMessages, hasTranscript,
} = require('../client/src/logFiles.js');

describe('baseKey', () => {
  it('normaliza chaves do avaliador comparativo (A/B) e simples', () => {
    expect(baseKey('1')).toBe('1');
    expect(baseKey('A3')).toBe('3');
    expect(baseKey('b2')).toBe('2');
    expect(baseKey(' A 04 ')).toBe('4');
  });
  it('devolve a chave crua quando não reconhece', () => {
    expect(baseKey('xyz')).toBe('xyz');
    expect(baseKey('')).toBe('');
  });
});

describe('criteriaEntries', () => {
  it('ordena pelo número do critério, não alfabeticamente', () => {
    const e = criteriaEntries({ '10': 1, '2': 2, '1': 3 });
    expect(e.map(([k]) => k)).toEqual(['1', '2', '10']);
  });

  it('descarta valores não numéricos', () => {
    const e = criteriaEntries({ '1': 8, '2': 'abc', '3': null, '4': undefined, '5': 7 });
    expect(e.map(([k]) => k)).toEqual(['1', '5']);
  });

  // `Number(null) === 0` e `Number('') === 0`: um filtro ingênuo os deixaria passar
  // e o aluno veria um "0/10" que a IA nunca deu.
  it('não transforma null/vazio/array em nota 0', () => {
    const e = criteriaEntries({ '1': null, '2': '', '3': [], '4': '  ', '5': false });
    expect(e).toEqual([]);
  });

  it('aceita string numérica (o payload da IA às vezes vem assim)', () => {
    expect(criteriaEntries({ '1': '8' }).map(([, v]) => Number(v))).toEqual([8]);
    expect(criteriaEntries({ '1': '8.5' }).map(([, v]) => Number(v))).toEqual([8.5]);
  });

  it('nota 0 legítima é preservada', () => {
    expect(criteriaEntries({ '1': 0 }).map(([k]) => k)).toEqual(['1']);
  });

  it('aceita chaves A/B do duelo e ordena por número', () => {
    const e = criteriaEntries({ B1: 5, A2: 6, A1: 7 });
    expect(e.map(([k]) => k)).toEqual(['A1', 'B1', 'A2']);
  });

  it('entrada inválida → lista vazia', () => {
    for (const v of [null, undefined, 'x', 42, []]) {
      expect(criteriaEntries(v)).toEqual([]);
    }
  });
});

describe('criteriaSection (bloco do .txt)', () => {
  const SCORES = { '1': 8, '2': 7, '3': 8.5, '4': 7, '5': 8, '6': 7 };

  it('monta o cabeçalho e uma linha por critério, com rótulo', () => {
    const out = criteriaSection(SCORES);
    expect(out).toContain('NOTAS POR CRITÉRIO (professor)');
    expect(out).toContain(`${CRITERIA_LABELS['1']}: 8/10`);
    expect(out).toContain(`${CRITERIA_LABELS['6']}: 7/10`);
    // 6 critérios → 6 linhas de nota.
    expect(out.match(/\/10/g)).toHaveLength(6);
  });

  it('preserva decimais', () => {
    expect(criteriaSection({ '3': 8.5 })).toContain('8.5/10');
  });

  it('respeita a ordem dos critérios', () => {
    const out = criteriaSection(SCORES);
    const pos = (n) => out.indexOf(CRITERIA_LABELS[n]);
    expect(pos('1')).toBeLessThan(pos('2'));
    expect(pos('5')).toBeLessThan(pos('6'));
  });

  it('chave desconhecida vira "Critério X" em vez de sumir', () => {
    expect(criteriaSection({ '9': 4 })).toContain('Critério 9: 4/10');
  });

  it('sem critérios → string vazia (não polui o .txt)', () => {
    for (const v of [null, undefined, {}, { '1': 'abc' }]) {
      expect(criteriaSection(v)).toBe('');
    }
  });
});

// Gate do botão "Log" no cabeçalho da sessão (ChatSession e EchoSession).
// As duas telas usam esta função para não divergirem.
describe('realMessages / hasTranscript', () => {
  const KICKOFF = { role: 'user', content: 'Iniciar', isSystem: true };
  const BREAK = { type: 'session-break', sessionNumber: 2 };
  const FALA = { role: 'user', content: 'Percebi que você cruzou os braços.' };

  it('sem conversa → botão oculto', () => {
    expect(hasTranscript([])).toBe(false);
    expect(hasTranscript([KICKOFF])).toBe(false);
    expect(hasTranscript([KICKOFF, BREAK])).toBe(false);
  });

  it('com conversa → botão visível', () => {
    expect(hasTranscript([KICKOFF, FALA])).toBe(true);
    expect(hasTranscript([KICKOFF, BREAK, FALA])).toBe(true);
  });

  it('descarta o kickoff e os marcadores de troca de sessão', () => {
    const reais = realMessages([KICKOFF, FALA, BREAK, { role: 'assistant', content: 'Nada.' }]);
    expect(reais).toHaveLength(2);
    expect(reais.every((m) => !m.isSystem && !m.type)).toBe(true);
  });

  it('entrada inválida não quebra', () => {
    for (const v of [null, undefined, 'x', 42, {}]) {
      expect(realMessages(v)).toEqual([]);
      expect(hasTranscript(v)).toBe(false);
    }
    expect(hasTranscript([null, undefined])).toBe(false);
  });
});

describe('evalSection', () => {
  it('vazio quando não há texto de avaliação', () => {
    for (const v of ['', '   ', null, undefined]) expect(evalSection(v)).toBe('');
  });
  it('embrulha o texto no cabeçalho AVALIAÇÃO', () => {
    const out = evalSection('Boa condução.');
    expect(out).toContain('AVALIAÇÃO');
    expect(out).toContain('Boa condução.');
  });

  // O botão "Log" do cabeçalho baixa `bothText()` no meio da sessão, quando ainda
  // não há avaliação. Sem esta propriedade o .txt teria uma seção AVALIAÇÃO vazia.
  it('no meio da sessão o .txt sai sem seção AVALIAÇÃO', () => {
    const bothText = (ev) => `CABEÇALHO\n\n---\n\nTRANSCRIÇÃO${evalSection(ev)}`;
    expect(bothText('')).not.toContain('AVALIAÇÃO');
    expect(bothText('')).toBe('CABEÇALHO\n\n---\n\nTRANSCRIÇÃO');
    expect(bothText('Feedback.')).toContain('AVALIAÇÃO');
  });
});

describe('makeLogItems', () => {
  it('sem avaliação, só o item "Log"', () => {
    const items = makeLogItems({ baseName: 'aluno-sofia', getLog: () => 'x', getEval: null });
    expect(items.map((i) => i.key)).toEqual(['log']);
  });

  it('com avaliação, oferece Log / Avaliação / Tudo', () => {
    const items = makeLogItems({
      baseName: 'aluno-sofia', getLog: () => 'l', getEval: () => 'e', getBoth: () => 'b',
    });
    expect(items.map((i) => i.key)).toEqual(['log', 'eval', 'both']);
    expect(items.every((i) => i.filename.endsWith('.txt'))).toBe(true);
  });

  it('sanitiza o nome do arquivo (espaços → _)', () => {
    const [item] = makeLogItems({ baseName: 'Aluno A Sofia Test', getLog: () => 'x' });
    expect(item.filename).not.toMatch(/\s/);
    expect(item.filename).toContain('Aluno_A_Sofia_Test');
  });
});
