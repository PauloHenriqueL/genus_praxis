import { useState } from 'react';
import { api, DEMO } from '../api';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await api.login(username, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  }

  async function quickLogin(role) {
    setError('');
    setLoading(true);
    try {
      const user = await api.login(role, 'demo');
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Erro');
    } finally {
      setLoading(false);
    }
  }

  // Sessão temporária, sem cadastro. O visitante não pontua (fica fora de
  // ranking, MMR, notificações) e não abre duelos — só entra por convite.
  async function handleVisitor() {
    setError('');
    setLoading(true);
    try {
      const user = await api.loginVisitor();
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Não foi possível entrar como visitante.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Genus Práxis" className="login-mark" />
        <div className="login-eyebrow">Plataforma de Simulação Clínica</div>
        <h1>Genus <span className="accent">Práxis</span></h1>
        <p className="subtitle">todo ser humano é único e possui um potencial ilimitado</p>
        <div className="login-ornament" />

        <form onSubmit={handleSubmit}>
          <div>
            <label htmlFor="username">Usuário</label>
            <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seu usuário" autoComplete="username" required />
          </div>
          <div>
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="sua senha" autoComplete="current-password" required />
          </div>
          {error && <div className="alert error">{error}</div>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        {/* Visitante depende do backend (POST /api/login/visitor); no modo
            demonstração não existe servidor, então o botão não aparece. */}
        {!DEMO && (
          <div className="login-visitor">
            <div className="login-divider"><span>ou</span></div>
            <button type="button" className="btn btn-outline" onClick={handleVisitor} disabled={loading}>
              Entrar como visitante
            </button>
            <p className="login-visitor-note">
              Sessão temporária para conhecer a plataforma. Não guarda progresso nem entra no ranking.
            </p>
          </div>
        )}

        {DEMO && (
          <div className="login-demo">
            <div className="login-demo-tag">Modo demonstração · sem servidor</div>
            <p>Entre com qualquer senha, ou acesse direto como:</p>
            <div className="login-demo-btns">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => quickLogin('admin')} disabled={loading}>Administrador</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => quickLogin('supervisor')} disabled={loading}>Professor</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => quickLogin('aluno')} disabled={loading}>Aluno</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
