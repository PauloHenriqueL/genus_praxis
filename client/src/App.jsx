import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import FreePlay from './pages/FreePlay';
import Competitive from './pages/Competitive';
import SkillMap from './pages/SkillMap';
import ChatSession from './pages/ChatSession';
import EchoSession from './pages/EchoSession';
import Duelo from './pages/Duelo';
import DuelSession from './pages/DuelSession';
import DuelAccept from './pages/DuelAccept';
import LogsSociais from './pages/LogsSociais';
import Progression from './pages/Progression';
import Missoes from './pages/Missoes';
import Ranking from './pages/Ranking';
import Avaliacao from './pages/Avaliacao';
import Logs from './pages/Logs';
import Profile from './pages/Profile';
import AdminFreeplay from './pages/AdminFreeplay';
import AdminExercises from './pages/AdminExercises';
import AdminEntrevistador from './pages/AdminEntrevistador';
import AdminUsers from './pages/AdminUsers';
import NotificationBell from './components/NotificationBell';
import SystemUpdates from './components/SystemUpdates';
import { api, getToken, clearAuth, onSessionExpired, DEMO } from './api';
import { ICONS } from './icons';

const USER_KEY = 'gp_user';

export default function App() {
  const [user, setUser] = useState(() => {
    if (!getToken()) return null;
    const saved = localStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  });
  const [authChecked, setAuthChecked] = useState(!getToken());
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [streak, setStreak] = useState(null);
  const [title, setTitle] = useState(null);
  // Barra lateral recolhível (só desktop) — estado lembrado entre sessões.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('gp_sidebar_collapsed') === '1'; } catch { return false; }
  });
  function toggleSidebar() {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem('gp_sidebar_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }

  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  // Trava o scroll do body enquanto o drawer está aberto — senão a página
  // rola por trás do menu no celular.
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [mobileNavOpen]);

  // Revalida token no boot.
  useEffect(() => {
    if (!getToken()) { setAuthChecked(true); return; }
    let cancelled = false;
    api.me()
      .then((data) => {
        if (cancelled) return;
        if (data && data.user) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }
      })
      .catch(() => { if (!cancelled) { clearAuth(); setUser(null); } })
      .finally(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => onSessionExpired(() => { setUser(null); navigate('/'); }), [navigate]);

  // Constância (streak) e título ativo, exibidos junto ao avatar.
  // O usuário guarda só o id do título (`activeTitle`); o rótulo e o tier vêm da
  // lista de conquistas — a mesma chamada que já traz o streak. Visitante não pontua.
  useEffect(() => {
    if (!user?.id || user.role === 'visitor') { setStreak(null); setTitle(null); return; }
    let cancelled = false;
    api.getGamification(user.id)
      .then((data) => {
        if (cancelled) return;
        setStreak(data?.streak || null);
        const def = user.activeTitle && (data?.achievements || []).find((a) => a.id === user.activeTitle && a.earned);
        setTitle(def ? { title: def.title, tier: def.tier } : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.id, user?.role, user?.activeTitle, location.pathname]);

  const handleLogin = (u) => { setUser(u); localStorage.setItem(USER_KEY, JSON.stringify(u)); };
  const handleUpdateUser = (u) => { setUser(u); localStorage.setItem(USER_KEY, JSON.stringify(u)); };
  const handleLogout = () => { clearAuth(); setUser(null); navigate('/'); };

  if (!authChecked) return null;
  if (!user) return <Login onLogin={handleLogin} />;

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const isTherapist = user.role === 'therapist';
  const isSupervisor = user.role === 'supervisor';
  const isAdmin = user.role === 'admin';
  const isVisitor = user.role === 'visitor';
  const roleLabel = isVisitor ? 'Visitante'
    : isTherapist ? 'Aluno'
    : isSupervisor ? 'Professor'
    : 'Administrador';
  // Quem pratica: aluno, admin e visitante. Professor só supervisiona/avalia.
  const canPractice = isTherapist || isAdmin || isVisitor;

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="topbar-actions">
        <SystemUpdates />
        {!isVisitor && <NotificationBell user={user} />}
      </div>

      <header className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setMobileNavOpen((v) => !v)} aria-label="Abrir menu" aria-expanded={mobileNavOpen}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="mobile-topbar-logo">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="brand-mark-sm" />
          <span>Genus <span className="accent">Práxis</span></span>
        </div>
        {isVisitor ? (
          <span className="mobile-topbar-avatar" aria-label="Visitante">{ICONS.user}</span>
        ) : (
          <Link to="/perfil" className="mobile-topbar-avatar" aria-label="Perfil">
            {user.profilePhoto ? <img src={user.profilePhoto} alt={user.name} /> : ICONS.user}
          </Link>
        )}
      </header>

      <div className={`mobile-nav-backdrop ${mobileNavOpen ? 'open' : ''}`} onClick={() => setMobileNavOpen(false)} aria-hidden="true" />

      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
          title={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points={sidebarCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'} />
          </svg>
        </button>
        <div className="sidebar-logo">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Genus Práxis" className="brand-mark" />
          <h1>Genus <span className="accent">Práxis</span></h1>
          <p>Simulação Clínica</p>
          {DEMO && <span className="sidebar-demo">Demonstração</span>}
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">Prática</div>
          <Link to="/inicio" title="Início" className={isActive('/inicio') ? 'active' : ''}>{ICONS.home}<span>Início</span></Link>
          {canPractice && (
            <>
              <Link to="/freeplay" title="Simulação" className={isActive('/freeplay') ? 'active' : ''}>{ICONS.simulation}<span>Simulação</span></Link>
              <Link to="/skills" title="Trilha de Competências" className={isActive('/skills') ? 'active' : ''}>{ICONS.skill}<span>Trilha de Competências</span></Link>
              {/* Competitivo alimenta o MMR — visitante tem id efêmero, não pontua. */}
              {!isVisitor && (
                <Link to="/competitivo" title="Competitivo" className={isActive('/competitivo') ? 'active' : ''}>{ICONS.trophy}<span>Competitivo</span></Link>
              )}
              {/* Visitante não abre duelo (403 no backend); só entra por link de convite. */}
              {!isVisitor && (
                <>
                  <Link to="/duelo" title="Duelo" className={isActive('/duelo') ? 'active' : ''}>{ICONS.duel}<span>Duelo</span></Link>
                  <Link to="/progression" title="Progressão" className={isActive('/progression') ? 'active' : ''}>{ICONS.progression}<span>Progressão</span></Link>
                  <Link to="/missoes" title="Objetivos" className={isActive('/missoes') ? 'active' : ''}>{ICONS.flame}<span>Objetivos</span></Link>
                </>
              )}
            </>
          )}

          <div className="nav-section">Histórico</div>
          {(isTherapist || isVisitor || isAdmin) && (
            <Link to="/logs" title="Minhas sessões" className={isActive('/logs') ? 'active' : ''}>
              {ICONS.log}<span>Minhas sessões</span>
            </Link>
          )}
          {!isVisitor && !isSupervisor && (
            <Link to="/duelo/logs" title="Logs sociais" className={isActive('/duelo/logs') ? 'active' : ''}>
              {ICONS.social}<span>Logs sociais</span>
            </Link>
          )}
          {(isSupervisor || isAdmin) && (
            <Link to="/supervisor" title="Logs dos alunos" className={isActive('/supervisor') ? 'active' : ''}>
              {ICONS.supervisor}<span>Logs dos alunos</span>
            </Link>
          )}

          {/* Ranking exclui visitante (403 no backend). */}
          {!isVisitor && (
            <>
              <div className="nav-section">Comunidade</div>
              <Link to="/ranking" title="Ranking" className={isActive('/ranking') ? 'active' : ''}>{ICONS.trophy}<span>Ranking</span></Link>
            </>
          )}

          {(isSupervisor || isAdmin) && (
            <>
              <div className="nav-section">Avaliação</div>
              <Link to="/avaliacao" title="Avaliar sessão" className={isActive('/avaliacao') ? 'active' : ''}>{ICONS.evaluate}<span>Avaliar sessão</span></Link>
            </>
          )}

          {isAdmin && (
            <>
              <div className="nav-section">Administração</div>
              <Link to="/admin/freeplay" title="Personagens da Simulação" className={isActive('/admin/freeplay') ? 'active' : ''}>
                {ICONS.characters}<span>Personagens</span>
              </Link>
              <Link to="/admin/exercises" title="Exercícios da Trilha" className={isActive('/admin/exercises') ? 'active' : ''}>
                {ICONS.admin}<span>Exercícios da Trilha</span>
              </Link>
              <Link to="/admin/entrevistador" title="Entrevistador" className={isActive('/admin/entrevistador') ? 'active' : ''}>
                {ICONS.evaluate}<span>Entrevistador</span>
              </Link>
              <Link to="/admin/contas" title="Contas" className={isActive('/admin/contas') ? 'active' : ''}>
                {ICONS.users}<span>Contas</span>
              </Link>
            </>
          )}
        </nav>

        <div className="sidebar-user">
          {isVisitor ? (
            <div className="profile-mini" style={{ cursor: 'default' }}>
              <span className="profile-mini-avatar">{ICONS.user}</span>
              <div className="profile-mini-info">
                <div className="profile-mini-name">Visitante</div>
                <div className="profile-mini-role">sessão temporária</div>
              </div>
            </div>
          ) : (
            <Link to="/perfil" className="profile-mini" title="Editar perfil">
              <span className={`profile-mini-avatar ${streak?.isAlive ? 'with-streak' : ''}`}>
                {user.profilePhoto ? <img src={user.profilePhoto} alt={user.name} /> : ICONS.user}
              </span>
              <div className="profile-mini-info">
                <div className="profile-mini-name">{user.name}</div>
                {title && <div className={`player-title tier-${title.tier}`}>{title.title}</div>}
                <div className="profile-mini-role">
                  {streak?.isAlive
                    ? `${streak.current} ${streak.current === 1 ? 'dia consecutivo' : 'dias consecutivos'}`
                    : roleLabel}
                </div>
              </div>
            </Link>
          )}
          <button onClick={handleLogout} className="btn btn-ghost btn-sm" title="Sair">{ICONS.exit}</button>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/inicio" element={<Home user={user} />} />

          {/* Prática */}
          <Route path="/freeplay" element={<FreePlay user={user} />} />
          <Route path="/competitivo" element={<Competitive user={user} />} />
          <Route path="/skills" element={<SkillMap user={user} />} />
          <Route path="/chat/exercise/:id" element={<ChatSession user={user} />} />
          <Route path="/chat/freeplay/:id" element={<EchoSession user={user} sessionType="freeplay" />} />

          {/* Duelo */}
          <Route path="/duelo" element={<Duelo user={user} />} />
          <Route path="/duelo/logs" element={<LogsSociais user={user} />} />
          <Route path="/duelo/sessao/:id" element={<DuelSession user={user} />} />
          <Route path="/duelo/aceitar/:id" element={<DuelAccept user={user} />} />
          <Route path="/duelo/convite/:token" element={<DuelAccept user={user} />} />

          <Route path="/progression" element={<Progression user={user} />} />
          <Route path="/missoes" element={<Missoes user={user} />} />
          <Route path="/ranking" element={<Ranking user={user} />} />

          {/* Histórico. /logs = as minhas; /supervisor = as dos alunos. */}
          <Route path="/logs" element={<Logs user={user} userId={user.id} />} />
          <Route path="/supervisor" element={<Logs user={user} />} />

          <Route path="/avaliacao" element={<Avaliacao user={user} />} />
          <Route path="/perfil" element={<Profile user={user} onUpdate={handleUpdateUser} />} />

          {isAdmin && <Route path="/admin/freeplay" element={<AdminFreeplay />} />}
          {isAdmin && <Route path="/admin/exercises" element={<AdminExercises />} />}
          {isAdmin && <Route path="/admin/entrevistador" element={<AdminEntrevistador user={user} />} />}
          {isAdmin && <Route path="/admin/contas" element={<AdminUsers user={user} />} />}

          <Route path="*" element={<Navigate to={defaultRoute(user)} replace />} />
        </Routes>
      </main>
    </div>
  );
}

function defaultRoute(user) {
  if (user.role === 'supervisor') return '/supervisor';
  return '/inicio';
}
