// Máscara e validação do cadastro do visitante (client/src/visitorForm.js).
//
// Módulo puro — sem React, sem DOM — então roda no ambiente node da suíte.
//
// ⚠ Isto é UX, não segurança: quem valida de verdade é o servidor. As regras aqui
// espelham as de lá (`normalizePhone`/`normalizeEmail`) só para o lead receber o
// erro antes do round-trip. `tests/auth.test.js` cobre o lado do servidor.

const {
  phoneDigits, maskPhone, isValidPhone, isValidEmail, isValidName, validateVisitor,
} = require('../client/src/visitorForm.js');

describe('phoneDigits', () => {
  it('descarta tudo que não é dígito', () => {
    expect(phoneDigits('(11) 91234-5678')).toBe('11912345678');
    expect(phoneDigits('+55 11 91234-5678')).toBe('5511912345678'.slice(0, 11));
  });

  it('trunca em 11 dígitos (DDD + celular)', () => {
    expect(phoneDigits('119123456789999').length).toBe(11);
  });

  it('entrada inválida não quebra', () => {
    for (const v of [null, undefined, {}, []]) expect(phoneDigits(v)).toBe('');
  });
});

describe('maskPhone — o lead digitando', () => {
  it('formata progressivamente, sem travar', () => {
    let s = '';
    const passos = [];
    for (const c of '11912345678') { s = maskPhone(s + c); passos.push(s); }
    expect(passos[0]).toBe('(1');
    expect(passos[1]).toBe('(11');
    expect(passos[2]).toBe('(11) 9');
    expect(passos.at(-1)).toBe('(11) 91234-5678');
  });

  it('celular quebra em 5-4; fixo, em 4-4', () => {
    expect(maskPhone('11912345678')).toBe('(11) 91234-5678'); // 11 dígitos
    expect(maskPhone('1134567890')).toBe('(11) 3456-7890');   // 10 dígitos
  });

  it('apagar (backspace) não trava a máscara', () => {
    let s = maskPhone('11912345678');
    const passos = [];
    for (let i = 0; i < 5; i++) { s = maskPhone(s.slice(0, -1)); passos.push(s); }
    // Continua encolhendo, sem repetir nem estourar.
    expect(passos.at(-1).length).toBeLessThan(maskPhone('11912345678').length);
    expect(passos.every((p) => p.startsWith('(11)'))).toBe(true);
  });

  it('vazio continua vazio (não vira "(")', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone(null)).toBe('');
  });

  it('é idempotente: remascarar não corrompe', () => {
    const uma = maskPhone('11912345678');
    expect(maskPhone(uma)).toBe(uma);
  });
});

// D2: permissivo de propósito — o objetivo é o lead conseguir entrar.
describe('isValidPhone — espelha o servidor', () => {
  it('aceita 10 (fixo) e 11 (celular) dígitos, com ou sem máscara', () => {
    for (const p of ['(11) 91234-5678', '11912345678', '1134567890', '(11) 3456-7890']) {
      expect(isValidPhone(p), p).toBe(true);
    }
  });

  it('recusa telefone curto ou vazio', () => {
    for (const p of ['119123456', '123', '', null, undefined]) {
      expect(isValidPhone(p), String(p)).toBe(false);
    }
  });
});

describe('isValidEmail / isValidName', () => {
  it('e-mail: checagem frouxa (algo@algo.algo)', () => {
    expect(isValidEmail('a@b.co')).toBe(true);
    expect(isValidEmail('  joao@email.com  ')).toBe(true);
    for (const e of ['semarroba.com', 'a@b', '', null]) expect(isValidEmail(e), String(e)).toBe(false);
  });

  it('nome: pelo menos 2 caracteres', () => {
    expect(isValidName('Ana')).toBe(true);
    for (const n of ['A', ' ', '', null]) expect(isValidName(n), String(n)).toBe(false);
  });
});

describe('validateVisitor — erros por campo', () => {
  it('formulário vazio acusa os três campos', () => {
    expect(validateVisitor({})).toEqual({
      name: 'Informe seu nome.',
      email: 'E-mail inválido.',
      phone: 'Telefone inválido. Use DDD + número.',
    });
  });

  it('formulário válido não acusa nada', () => {
    expect(validateVisitor({ name: 'Ana', email: 'a@b.co', phone: '(11) 91234-5678' })).toEqual({});
  });

  it('acusa só o campo errado', () => {
    const e = validateVisitor({ name: 'Ana', email: 'a@b.co', phone: '123' });
    expect(Object.keys(e)).toEqual(['phone']);
  });

  it('sem argumento não quebra', () => {
    expect(Object.keys(validateVisitor()).length).toBe(3);
  });
});
