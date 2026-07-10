// MODO DEMONSTRAÇÃO — front 100% no navegador, SEM backend.
// Ativado no build (VITE_DEMO=1), usado no GitHub Pages. O login aceita
// admin / supervisor / aluno (qualquer senha) e tudo roda com dados fictícios
// em memória (some ao recarregar, exceto a sessão de login). Nada é enviado a
// lugar nenhum — não há IA nem servidor.

const TOKEN_KEY = 'gp_token';
const USER_KEY = 'gp_user';

const DEMO_USERS = [
  { id: '1', username: 'admin', name: 'Administrador', role: 'admin', teacherId: null, email: '' },
  { id: '2', username: 'supervisor', name: 'Prof. Helena Dias', role: 'supervisor', teacherId: null, email: '' },
  { id: '3', username: 'aluno', name: 'João Aluno', role: 'therapist', teacherId: '2', email: '', teacherName: 'Prof. Helena Dias' },
  { id: '4', username: 'marina', name: 'Marina Costa', role: 'therapist', teacherId: '2', email: '', teacherName: 'Prof. Helena Dias' },
  { id: '5', username: 'pedro', name: 'Pedro Alves', role: 'therapist', teacherId: '2', email: '', teacherName: 'Prof. Helena Dias' },
];
let users = DEMO_USERS.map((u) => ({ ...u }));

let characters = [
  { id: 'ch1', name: 'Sofia', age: 25, description: 'Jovem com queixas relacionais.' },
  { id: 'ch2', name: 'Roberto', age: 55, description: 'Homem em crise de meia-idade.' },
  { id: 'ch3', name: 'Ana Luiza', age: 34, description: 'Ansiedade e sobrecarga no trabalho.' },
  { id: 'ch4', name: 'Marcos', age: 19, description: 'Universitário com dificuldades de adaptação.' },
];

function iso(daysAgo, h = 10) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, 15, 0, 0);
  return d.toISOString();
}
function mkMsgs(pairs) {
  const out = [];
  for (const [u, a] of pairs) {
    out.push({ role: 'user', content: u, highlighted: false, comment: '' });
    out.push({ role: 'assistant', content: a });
  }
  return out;
}
let logs = [
  { id: 'log-d1', timestamp: iso(1), type: 'simulacao', itemId: 'ch1', itemTitle: 'Sofia', durationSeconds: 640, sessionCount: 2, score: null, criteriaScores: null, evaluation: '', userId: '3', userName: 'João Aluno', messages: mkMsgs([['Olá Sofia, como você está hoje?', 'Oi... meio cansada, pra ser sincera. Tive uma semana difícil.'], ['Quer me contar o que pesou mais?', 'Briguei de novo com o meu namorado. Sempre acho que ele não liga pra mim.']]) },
  { id: 'log-d2', timestamp: iso(3), type: 'simulacao', itemId: 'ch2', itemTitle: 'Roberto', durationSeconds: 720, sessionCount: 1, score: null, criteriaScores: null, evaluation: '', userId: '3', userName: 'João Aluno', messages: mkMsgs([['Roberto, o que te trouxe aqui?', 'Sinceramente? Minha esposa insistiu. Eu acho que está tudo bem comigo.']]) },
  { id: 'log-d3', timestamp: iso(2, 14), type: 'simulacao', itemId: 'ch1', itemTitle: 'Sofia', durationSeconds: 510, sessionCount: 1, score: null, criteriaScores: null, evaluation: '', userId: '4', userName: 'Marina Costa', messages: mkMsgs([['Oi Sofia, pode começar quando quiser.', 'Não sei bem por onde começar... acho que estou perdida.']]) },
  { id: 'log-d4', timestamp: iso(5, 16), type: 'simulacao', itemId: 'ch3', itemTitle: 'Ana Luiza', durationSeconds: 890, sessionCount: 3, score: null, criteriaScores: null, evaluation: '', userId: '5', userName: 'Pedro Alves', messages: mkMsgs([['Ana, como tem passado?', 'Correria total. Não paro um minuto e mesmo assim sinto que não dou conta de nada.']]) },
];

const PATIENT_REPLIES = [
  'Hmm... deixa eu pensar. Acho que sim, faz sentido o que você falou.',
  'É difícil colocar isso em palavras... mas é mais ou menos por aí.',
  'Nunca tinha pensado por esse lado. Fico meio desconfortável, pra ser sincero(a).',
  'Sei lá. Às vezes parece que ninguém entende de verdade.',
  'Você acha? Talvez eu esteja exagerando...',
  'Isso mexe comigo. Prefiro nem tocar muito nesse assunto.',
];

function currentUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
function delay(v, ms = 220) { return new Promise((r) => setTimeout(() => r(v), ms)); }

export const demoApi = {
  login: (username) => {
    const uname = String(username || '').trim().toLowerCase();
    const found = users.find((u) => u.username === uname);
    const user = found ? { ...found } : { ...users[2], name: username || 'Visitante Demo' };
    try {
      localStorage.setItem(TOKEN_KEY, 'demo-token');
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
    return delay(user);
  },
  me: () => { const u = currentUser(); return u ? delay({ user: u }) : Promise.reject(new Error('Sessão expirada')); },
  changeMyPassword: () => delay({ ok: true }),

  getUser: (id) => delay(users.find((u) => u.id === id) || null),
  updateUser: (id, data) => {
    const u = currentUser();
    const merged = { ...u, ...data };
    try { localStorage.setItem(USER_KEY, JSON.stringify(merged)); } catch {}
    const i = users.findIndex((x) => x.id === id);
    if (i >= 0) users[i] = { ...users[i], ...data };
    return delay(merged);
  },

  getFreeplay: () => delay(characters.map((c) => ({ ...c, difficulty: null, competitiveMatches: 0 }))),
  createFreeplay: (data) => { const c = { id: 'ch' + Date.now(), ...data }; characters.push(c); return delay(c); },
  updateFreeplay: (id, data) => { const i = characters.findIndex((c) => c.id === id); if (i >= 0) characters[i] = { ...characters[i], ...data }; return delay(characters[i]); },
  deleteFreeplay: (id) => { characters = characters.filter((c) => c.id !== id); return delay({ ok: true }); },
  setFreeplayPhoto: (id, data) => {
    const i = characters.findIndex((c) => c.id === id);
    if (i >= 0) {
      if (data && data.clear) { delete characters[i].photoIcon; delete characters[i].photoFull; }
      else { characters[i].photoIcon = data.icon; characters[i].photoFull = data.full; }
    }
    return delay(characters[i]);
  },

  // Trilha de competências: sem exercícios no modo demonstração.
  getExercises: () => delay([]),
  createExercise: (d) => delay({ id: 'ex' + Date.now(), ...d }),
  updateExercise: (id, d) => delay({ id, ...d }),
  deleteExercise: () => delay({ ok: true }),
  getProgress: () => delay({}),
  saveProgress: (userId, d) => delay(d),

  // Recursos que dependem de servidor real (IA, MMR, duelos, notificações).
  // No modo demonstração aparecem vazios em vez de quebrar a página.
  loginVisitor: () => Promise.reject(new Error('Indisponível no modo demonstração')),
  logout: () => { try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch {} },
  setMyTitle: () => delay({ ok: true }),
  getProfilePhotos: () => delay([]),
  getGamification: () => delay({ streak: null, dailyMissions: [], achievements: [], stats: {} }),
  getRanking: () => delay([]),
  getMyMmr: () => delay(null),
  adminResetRanking: () => delay({ ok: true }),
  getMyStudents: () => delay(users.filter((u) => u.role === 'therapist')),
  getEntrevistadorPrompt: () => delay({ prompt: '' }),
  entrevistadorChat: () => Promise.reject(new Error('Entrevistador indisponível no modo demonstração')),
  extractBlocos: () => delay({ ready: false, bloco1: '', bloco2: null, meta: { name: '', age: null, description: '' } }),
  createCharacterFromInterview: () => Promise.reject(new Error('Indisponível no modo demonstração')),
  getDuelOpponents: () => delay([]),
  createDuel: () => Promise.reject(new Error('Duelos indisponíveis no modo demonstração')),
  getDuel: () => Promise.reject(new Error('Duelos indisponíveis no modo demonstração')),
  getDuelByToken: () => Promise.reject(new Error('Duelos indisponíveis no modo demonstração')),
  acceptDuelByToken: () => Promise.reject(new Error('Duelos indisponíveis no modo demonstração')),
  acceptDuel: () => Promise.reject(new Error('Duelos indisponíveis no modo demonstração')),
  submitDuel: () => Promise.reject(new Error('Duelos indisponíveis no modo demonstração')),
  cancelDuel: () => delay({ ok: true }),
  exportDuelLog: () => Promise.reject(new Error('Duelos indisponíveis no modo demonstração')),
  getSocialLogs: () => delay([]),
  getProgressionPatients: () => delay([]),
  evaluateProgression: () => Promise.reject(new Error('Progressão indisponível no modo demonstração')),
  // Mesmo shape da API real: { items, unread }.
  getNotifications: () => delay({ items: [], unread: 0 }),
  markNotificationRead: () => delay({ ok: true }),
  markAllNotificationsRead: () => delay({ ok: true }),
  listActiveSessions: () => delay([]),

  getLogs: (userId) => {
    const u = currentUser();
    let out = logs;
    if (u && u.role === 'therapist') out = logs.filter((l) => l.userId === u.id);
    else if (userId) out = logs.filter((l) => l.userId === userId);
    return delay(out.map((l) => ({ ...l, expiresAt: new Date(new Date(l.timestamp).getTime() + 30 * 86400000).toISOString() })));
  },
  saveLog: (data) => {
    const u = currentUser() || {};
    const log = { id: 'log' + Date.now(), timestamp: new Date().toISOString(), type: 'simulacao', criteriaScores: null, score: null, evaluation: '', ...data, userId: u.id, userName: u.name };
    logs = [log, ...logs];
    return delay({ ...log, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString() });
  },
  getLogsPolicy: () => delay({ ttlDays: 30 }),
  deleteLog: (id) => { logs = logs.filter((l) => l.id !== id); return delay({ ok: true }); },

  chat: (messages) => {
    const us = (messages || []).filter((m) => m.role === 'user');
    const last = us[us.length - 1];
    if (us.length <= 1 && last && /iniciar/i.test(last.content)) {
      return delay({ role: 'assistant', content: 'Oi... obrigado(a) por me receber. Confesso que tô um pouco nervoso(a), mas pode começar quando quiser.' }, 600);
    }
    if (last && /passaremos para a próxima|próxima sessão/i.test(last.content)) {
      return delay({ role: 'assistant', content: 'Oi de novo. Essa semana foi... intensa. Aconteceu bastante coisa desde a última vez que conversamos.' }, 600);
    }
    return delay({ role: 'assistant', content: PATIENT_REPLIES[us.length % PATIENT_REPLIES.length] }, 650);
  },
  evaluate: () => delay({ role: 'assistant', content: '', disabled: true }),
  transcribe: () => delay({ text: '(demonstração) transcrição de áudio simulada.' }, 500),

  getActiveSession: () => delay(null),
  saveActiveSession: (t, i, d) => delay(d),
  clearActiveSession: () => delay({ ok: true }),

  getSettings: () => delay({ evaluatorEnabled: false }),
  adminUpdateSettings: (d) => delay({ evaluatorEnabled: !!(d && d.evaluatorEnabled) }),

  adminListUsers: () => delay(users.map((u) => ({ ...u }))),
  adminCreateUser: (data) => {
    const id = String(Math.max(...users.map((u) => Number(u.id))) + 1);
    const u = { id, teacherId: null, email: '', ...data };
    delete u.password;
    users.push(u);
    return delay(u);
  },
  adminUpdateUser: (id, data) => { const i = users.findIndex((u) => u.id === id); if (i >= 0) { const { password, ...rest } = data; users[i] = { ...users[i], ...rest }; } return delay(users[i]); },
  adminDeleteUser: (id) => { users = users.filter((u) => u.id !== id); return delay({ ok: true }); },
  adminResetPassword: () => delay({ ok: true }),
  adminExportData: () => {
    const blob = new Blob([JSON.stringify({ demo: true, users, characters, logs }, null, 2)], { type: 'application/json' });
    return delay({ blob, filename: 'genus-praxis-demo.json' });
  },
};
