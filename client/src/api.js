import { demoApi } from './demo';

// Origem da API. Vazio (padrão) = mesma origem — funciona no dev (proxy do Vite)
// e no deploy full-stack (o Express serve o front). Para hospedar o FRONT no
// GitHub Pages com o BACKEND em outro host, defina VITE_API_BASE no build com a
// URL do backend (ex.: https://meu-backend.up.railway.app).
const API_ORIGIN = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '');
const BASE = `${API_ORIGIN}/api`;
const TOKEN_KEY = 'gp_token';
const USER_KEY = 'gp_user';

// Modo demonstração (VITE_DEMO=1): front sem backend, com dados fictícios.
// Usado no GitHub Pages para mostrar o app sem servidor.
export const DEMO = import.meta.env.VITE_DEMO === '1';

// Resolve URLs de assets servidos pelo backend (ex.: /patient-photos/...).
// Data URLs e URLs absolutas passam direto.
export function assetUrl(p) {
  if (!p) return p;
  if (/^(https?:)?\/\//i.test(p) || p.startsWith('data:')) return p;
  return `${API_ORIGIN}${p}`;
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {}
}

const sessionListeners = new Set();
export function onSessionExpired(fn) {
  sessionListeners.add(fn);
  return () => sessionListeners.delete(fn);
}
function notifySessionExpired() {
  for (const fn of sessionListeners) { try { fn(); } catch {} }
}

// Visitante com o prazo vencido (demanda #8). É um caso separado da sessão expirada:
// o token dele ainda é VÁLIDO (o JWT dura 7 dias), o que venceu é o direito de acesso.
// Por isso o servidor responde 403 + `code: VISITOR_EXPIRED`, e não 401 — um 401 faria
// logout e mandaria para o login, onde ele se cadastraria de novo e não entenderia nada.
const visitorExpiredListeners = new Set();
export function onVisitorExpired(fn) {
  visitorExpiredListeners.add(fn);
  return () => visitorExpiredListeners.delete(fn);
}
function notifyVisitorExpired() {
  for (const fn of visitorExpiredListeners) { try { fn(); } catch {} }
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    clearAuth();
    notifySessionExpired();
    const err = await res.json().catch(() => ({ error: 'Sessão expirada' }));
    throw new Error(err.error || 'Sessão expirada');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    if (res.status === 403 && err && err.code === 'VISITOR_EXPIRED') notifyVisitorExpired();
    const e = new Error((err && err.error) || `Erro ${res.status}${res.statusText ? ' ' + res.statusText : ''}`);
    // Erros de validação por campo (ex.: cadastro do visitante) vêm com `field`
    // (qual campo colidiu, no 409) ou `fields` (lista, no 400). Sem isto, o
    // formulário não conseguiria destacar o campo errado — a mensagem se perderia.
    e.status = res.status;
    if (err && err.field) e.field = err.field;
    if (err && Array.isArray(err.fields)) e.fields = err.fields;
    if (err && err.code) e.code = err.code;
    // Demandas #4 e #7: o client abre o pop-up certo em vez de um erro genérico.
    if (err && err.locked) e.locked = true;
    if (err && err.patientLocked) e.patientLocked = true;
    throw e;
  }
  return res.json();
}

const realApi = {
  // Auth
  login: async (username, password) => {
    const data = await request('/login', { method: 'POST', body: { username, password } });
    if (data && data.token) setToken(data.token);
    return data && data.user ? data.user : data;
  },
  // Cadastro do visitante: nome, e-mail e telefone (obrigatórios e únicos).
  // Sem senha — informar os dados JÁ é o login. Repetir os mesmos dados volta
  // para a mesma conta. Colisão → erro com `.field` dizendo qual campo bateu.
  loginVisitor: async ({ name, email, phone } = {}) => {
    const data = await request('/login/visitor', { method: 'POST', body: { name, email, phone } });
    if (data && data.token) setToken(data.token);
    return data && data.user ? data.user : data;
  },
  logout: () => { clearAuth(); },
  me: () => request('/me'),
  changeMyPassword: (currentPassword, newPassword) =>
    request('/me/password', { method: 'POST', body: { currentPassword, newPassword } }),
  // Título (subtítulo) ativo exibido no perfil/ranking. titleId vazio limpa.
  setMyTitle: (titleId) => request('/me/title', { method: 'POST', body: { titleId } }),

  // Perfil
  getUser: (id) => request(`/users/${id}`),
  updateUser: (id, data) => request(`/users/${id}`, { method: 'PUT', body: data }),
  getProfilePhotos: () => request('/profile-photos'),

  // Personagens da simulação (freeplay). Só freeplay tem foto.
  getFreeplay: () => request('/freeplay'),
  createFreeplay: (data) => request('/freeplay', { method: 'POST', body: data }),
  updateFreeplay: (id, data) => request(`/freeplay/${id}`, { method: 'PUT', body: data }),
  deleteFreeplay: (id) => request(`/freeplay/${id}`, { method: 'DELETE' }),
  setFreeplayPhoto: (id, data) => request(`/freeplay/${id}/photo`, { method: 'PUT', body: data }),

  // Exercícios da trilha de competências
  getExercises: () => request('/exercises'),
  createExercise: (data) => request('/exercises', { method: 'POST', body: data }),
  updateExercise: (id, data) => request(`/exercises/${id}`, { method: 'PUT', body: data }),
  deleteExercise: (id) => request(`/exercises/${id}`, { method: 'DELETE' }),

  // Progresso da trilha
  getProgress: (userId) => request(`/progress/${userId}`),
  saveProgress: (userId, data) => request(`/progress/${userId}`, { method: 'POST', body: data }),

  // Logs. POST exige `type` ('exercise'|'freeplay') e aceita `mode`
  // ('competitive'|'training') — freeplay+competitive alimenta o MMR.
  getLogs: (userId) => request(`/logs${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`),
  saveLog: (data) => request('/logs', { method: 'POST', body: data }),
  getLogsPolicy: () => request('/logs/policy'),
  deleteLog: (id) => request(`/logs/${id}`, { method: 'DELETE' }),

  // Chat da simulação (o servidor resolve o system prompt via context: { type, itemId })
  chat: (messages, context) => request('/chat', { method: 'POST', body: { messages, context } }),
  // Avaliação (estrutura pronta; desligada por padrão → { disabled: true }).
  // Resposta: { role, content, score } — e, só para supervisor/admin,
  // também { criteriaScores, reasoning }.
  evaluate: (messages, context) => request('/evaluate', { method: 'POST', body: { messages, context } }),
  transcribe: (audioBase64) => request('/transcribe', { method: 'POST', body: { audio: audioBase64 } }),

  // Indicadores (constância, objetivos diários, conquistas)
  getGamification: (userId) => request(`/gamification/${userId}`),

  // Ranking global (403 para visitante) e MMR competitivo do próprio usuário
  getRanking: () => request('/ranking'),
  getMyMmr: () => request('/me/mmr'),
  adminResetRanking: () => request('/admin/ranking/reset', { method: 'POST' }),

  // Professor: alunos vinculados
  getMyStudents: () => request('/teacher/students'),

  // --- Entrevistador (construção de personagem, admin-only) ---
  getEntrevistadorPrompt: () => request('/entrevistador-prompt'),
  // Conversa com o entrevistador. O prompt é resolvido no servidor.
  entrevistadorChat: (messages) =>
    request('/chat', { method: 'POST', body: { messages, mode: 'entrevistador' } }),
  // Parsing dos blocos a partir da transcrição (sem IA).
  // → { ready, bloco1, bloco2, meta: { name, age, description } }
  extractBlocos: (messages) => request('/entrevistador/extract', { method: 'POST', body: { messages } }),
  // Cria o personagem de Simulação. Bloco 2 → specificInstruction,
  // Bloco 1 → evaluationCriteria (gabarito do avaliador).
  createCharacterFromInterview: (data) =>
    request('/entrevistador/character', { method: 'POST', body: data }),

  // --- Duelos (avaliação comparada entre dois alunos) ---
  getDuelOpponents: () => request('/duel/opponents'),
  // data: { characterId, opponentUserId?, inviteMethod: 'system'|'whatsapp' }
  createDuel: (data) => request('/duel', { method: 'POST', body: data }),
  getDuel: (id) => request(`/duel/${id}`),
  getDuelByToken: (token) => request(`/duel/by-token/${encodeURIComponent(token)}`),
  acceptDuelByToken: (token) => request(`/duel/by-token/${encodeURIComponent(token)}/accept`, { method: 'POST', body: {} }),
  acceptDuel: (id) => request(`/duel/${id}/accept`, { method: 'POST', body: {} }),
  submitDuel: (id, data) => request(`/duel/${id}/submit`, { method: 'POST', body: data }),
  cancelDuel: (id) => request(`/duel/${id}`, { method: 'DELETE' }),
  // Baixa o log do duelo como arquivo (o servidor responde com attachment).
  exportDuelLog: async (id) => {
    const token = getToken();
    const res = await fetch(`${BASE}/duel/${encodeURIComponent(id)}/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let err = 'Erro ao baixar o log';
      try { const j = await res.json(); err = j.error || err; } catch {}
      throw new Error(err);
    }
    const dispo = res.headers.get('content-disposition') || '';
    const match = dispo.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `duelo-${id}.txt`;
    const blob = await res.blob();
    return { blob, filename };
  },
  getSocialLogs: () => request('/duels/social'),

  // --- Progressão (evolução entre atendimentos repetidos do mesmo paciente) ---
  getProgressionPatients: () => request('/progression/available-patients'),
  evaluateProgression: (data) => request('/progression/evaluate', { method: 'POST', body: data }),

  // --- Notificações in-app (visitante não recebe) ---
  getNotifications: () => request('/notifications'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST', body: {} }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST', body: {} }),

  // Anúncios do admin (demanda #9): pop-up no primeiro login após publicado.
  getPendingAnnouncements: () => request('/announcements/pending'),
  markAnnouncementSeen: (id) => request(`/announcements/${id}/seen`, { method: 'POST', body: {} }),
  adminListAnnouncements: () => request('/admin/announcements'),
  adminCreateAnnouncement: (data) => request('/admin/announcements', { method: 'POST', body: data }),
  adminUpdateAnnouncement: (id, data) => request(`/admin/announcements/${id}`, { method: 'PUT', body: data }),
  adminDeleteAnnouncement: (id) => request(`/admin/announcements/${id}`, { method: 'DELETE' }),

  // Sessões ativas (persistência de sessão não finalizada)
  listActiveSessions: () => request('/active-sessions'),
  getActiveSession: (type, itemId) => request(`/active-sessions/${type}/${encodeURIComponent(itemId)}`),
  saveActiveSession: (type, itemId, data) =>
    request(`/active-sessions/${type}/${encodeURIComponent(itemId)}`, { method: 'PUT', body: data }),
  clearActiveSession: (type, itemId) =>
    request(`/active-sessions/${type}/${encodeURIComponent(itemId)}`, { method: 'DELETE' }),

  // Configurações
  getSettings: () => request('/settings'),
  adminUpdateSettings: (data) => request('/admin/settings', { method: 'PUT', body: data }),

  // Admin · Contas
  adminListUsers: () => request('/admin/users'),
  adminCreateUser: (data) => request('/admin/users', { method: 'POST', body: data }),
  adminUpdateUser: (id, data) => request(`/admin/users/${id}`, { method: 'PUT', body: data }),
  adminDeleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  // Demanda #8: renovar (duração padrão VIGENTE) ou bloquear o acesso de um visitante.
  // Competências da trilha (demandas #5a/#5b). O admin recebe `criteria` e a contagem
  // de exercícios; o aluno, só id/nome/cor.
  getSkills: () => request('/skills'),
  adminCreateSkill: (data) => request('/admin/skills', { method: 'POST', body: data }),
  adminUpdateSkill: (id, data) => request(`/admin/skills/${id}`, { method: 'PUT', body: data }),
  adminReorderSkills: (ids) => request('/admin/skills/reorder', { method: 'POST', body: { ids } }),
  // `confirm` é obrigatório: sem ele o servidor responde 409 com a contagem de órfãos.
  adminDeleteSkill: (id, { confirm = false } = {}) =>
    request(`/admin/skills/${id}${confirm ? '?confirm=1' : ''}`, { method: 'DELETE' }),
  adminSkillOrphans: () => request('/admin/skills/orphans'),

  adminVisitorAccess: (id, action) =>
    request(`/admin/users/${id}/visitor-access`, { method: 'POST', body: { action } }),
  adminResetPassword: (id, newPassword) =>
    request(`/admin/users/${id}/reset-password`, { method: 'POST', body: { newPassword } }),
  adminExportData: async () => {
    const token = getToken();
    const res = await fetch(BASE + '/admin/export', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      let err = 'Erro ao exportar';
      try { const j = await res.json(); err = j.error || err; } catch {}
      throw new Error(err);
    }
    const dispo = res.headers.get('content-disposition') || '';
    const match = dispo.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `genus-praxis-export-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = await res.blob();
    return { blob, filename };
  },
};

// No modo demonstração usamos a API falsa (sem backend); senão, a real.
export const api = DEMO ? demoApi : realApi;
