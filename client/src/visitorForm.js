// Cadastro do visitante — máscara e validação de campo (demanda #1).
//
// Módulo puro: sem React, sem CSS, sem DOM. É testável no node
// (`tests/visitor-form.test.js`), e o <Login> é só a casca em volta.
//
// ⚠ Isto é UX, não segurança. Quem valida de verdade é o servidor
// (`normalizePhone` / `normalizeEmail` em server/index.js). As regras aqui
// espelham as de lá para o lead receber o erro antes do round-trip — mas passar
// por aqui não garante nada.

/** Só os dígitos, no máximo 11 (DDD + celular com 9). */
export function phoneDigits(v) {
  return String(v == null ? '' : v).replace(/\D/g, '').slice(0, 11);
}

/**
 * Máscara progressiva, aplicada enquanto o lead digita:
 *   1            → (1
 *   11           → (11)
 *   11912345678  → (11) 91234-5678
 *   1134567890   → (11) 3456-7890
 * Não força nada: o campo aceita o que o usuário digitar e vai formatando.
 */
export function maskPhone(v) {
  const d = phoneDigits(v);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  // Celular (9 dígitos) quebra em 5-4; fixo (8 dígitos), em 4-4.
  const cut = rest.length > 8 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, cut)}-${rest.slice(cut)}`;
}

/** Espelha o `normalizePhone` do servidor: 10 ou 11 dígitos (D2). */
export function isValidPhone(v) {
  const d = phoneDigits(v);
  return d.length === 10 || d.length === 11;
}

/** Espelha o `normalizeEmail` do servidor: checagem deliberadamente frouxa. */
export function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v == null ? '' : v).trim());
}

export function isValidName(v) {
  return String(v == null ? '' : v).trim().length >= 2;
}

/**
 * Erros por campo, para o formulário destacar o input certo.
 * Devolve `{}` quando está tudo válido.
 */
export function validateVisitor({ name, email, phone } = {}) {
  const errors = {};
  if (!isValidName(name)) errors.name = 'Informe seu nome.';
  if (!isValidEmail(email)) errors.email = 'E-mail inválido.';
  if (!isValidPhone(phone)) errors.phone = 'Telefone inválido. Use DDD + número.';
  return errors;
}
