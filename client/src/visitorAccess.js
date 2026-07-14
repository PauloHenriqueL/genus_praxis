// Prazo do acesso de visitante (demanda #8) — formatação para a tela do admin.
//
// Módulo puro: sem React, sem DOM. A regra de verdade é do servidor
// (`visitorAccessExpired`); isto aqui só traduz o estado em algo legível.

/**
 * Estado do acesso de um visitante.
 * Espelha o `visitorAccessExpired` do servidor: `blocked` manda; sem `accessExpiresAt`,
 * não expira (é o visitante que já existia antes desta demanda).
 */
export function visitorAccessStatus(user) {
  if (!user || user.role !== 'visitor') return null;
  if (user.blocked) return { state: 'blocked', label: 'Bloqueado' };
  if (!user.accessExpiresAt) return { state: 'unlimited', label: 'Sem prazo' };

  const t = Date.parse(user.accessExpiresAt);
  if (!Number.isFinite(t)) return { state: 'unlimited', label: 'Sem prazo' };

  const restante = t - Date.now();
  if (restante <= 0) return { state: 'expired', label: 'Expirado' };
  return { state: 'active', label: `Expira em ${humanizeDuration(restante)}` };
}

/** "2 dias", "3 horas", "12 minutos" — arredondado para baixo, sem precisão falsa. */
export function humanizeDuration(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'menos de 1 minuto';
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;

  const horas = Math.floor(min / 60);
  if (horas < 24) return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;

  const dias = Math.floor(horas / 24);
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}
