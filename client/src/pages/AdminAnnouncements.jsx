// Anúncios do admin (demanda #9). Publicar um aviso que vira pop-up no primeiro login de
// cada usuário do público escolhido, e depois entra na lista de notificações.
import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import Typewriter from '../components/Typewriter';
import '../styles/Admin.css';

// Os papéis que podem ser público de um anúncio. `visitor` incluído (decisão do usuário).
const ROLES = [
  { key: 'therapist', label: 'Alunos' },
  { key: 'visitor', label: 'Visitantes' },
  { key: 'supervisor', label: 'Professores' },
  { key: 'admin', label: 'Administradores' },
];
const roleLabel = (k) => (ROLES.find((r) => r.key === k) || {}).label || k;

export default function AdminAnnouncements() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  // Vazio = todos. O admin marca quem vê.
  const [roles, setRoles] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    api.adminListAnnouncements()
      .then((l) => setList(Array.isArray(l) ? l : []))
      .catch((e) => setError(e.message || 'Erro ao carregar.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  function toggleRole(key) {
    setOk('');
    setRoles((r) => (r.includes(key) ? r.filter((x) => x !== key) : [...r, key]));
  }

  async function publicar(e) {
    e.preventDefault();
    setError(''); setOk('');
    if (!title.trim()) return setError('O título é obrigatório.');
    if (!body.trim()) return setError('O texto é obrigatório.');
    setSaving(true);
    try {
      await api.adminCreateAnnouncement({ title: title.trim(), body: body.trim(), roles });
      setTitle(''); setBody(''); setRoles([]);
      setOk('Anúncio publicado. Vai aparecer no próximo login de cada usuário do público.');
      load();
    } catch (err) {
      setError(err.message || 'Erro ao publicar.');
    } finally {
      setSaving(false);
    }
  }

  async function togglePublicado(a) {
    setError(''); setOk('');
    try { await api.adminUpdateAnnouncement(a.id, { active: a.active === false }); load(); }
    catch (err) { setError(err.message || 'Erro ao atualizar.'); }
  }

  async function apagar(a) {
    if (!window.confirm(`Apagar o anúncio "${a.title}"? Ele some para todos, inclusive da lista de notificações.`)) return;
    setError(''); setOk('');
    try { await api.adminDeleteAnnouncement(a.id); load(); }
    catch (err) { setError(err.message || 'Erro ao apagar.'); }
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <div className="eyebrow">Administração</div>
        <h2><Typewriter text="Anún" /><span className="accent"><Typewriter text="cios" delayStart={260} /></span></h2>
        <div className="ornament" />
      </div>

      <div className="card feature-warning">
        <h3 className="card-title">Como o anúncio aparece</h3>
        <p>
          Ao publicar, o anúncio vira um <strong>pop-up</strong> no <strong>próximo login</strong> de cada
          usuário do público que você escolher. Depois que a pessoa fecha, ele continua disponível na
          lista de notificações (o sino).
        </p>
        <ul>
          <li>Cada anúncio <strong>novo</strong> reabre o pop-up, mesmo para quem já viu o anterior.</li>
          <li>Quem se cadastrar <strong>depois</strong> também vê, enquanto o anúncio estiver publicado.</li>
          <li><strong>Despublicar</strong> tira o pop-up e a notificação, sem apagar o anúncio — dá para republicar.</li>
        </ul>
      </div>

      <form className="card admin-form" onSubmit={publicar}>
        <h3 className="card-title">Novo anúncio</h3>
        <div>
          <label htmlFor="ann-title">Título</label>
          <input id="ann-title" value={title} onChange={(e) => { setTitle(e.target.value); setOk(''); }} placeholder="Ex.: Bem-vindos à plataforma" maxLength={200} />
        </div>
        <div>
          <label htmlFor="ann-body">Texto</label>
          <textarea id="ann-body" value={body} onChange={(e) => { setBody(e.target.value); setOk(''); }} placeholder="O que você quer avisar…" style={{ minHeight: 120 }} maxLength={4000} />
        </div>
        <div>
          <label>Quem vê</label>
          <div className="announcement-roles">
            {ROLES.map((r) => (
              <label key={r.key} className={`role-chip ${roles.includes(r.key) ? 'on' : ''}`}>
                <input type="checkbox" checked={roles.includes(r.key)} onChange={() => toggleRole(r.key)} />
                {r.label}
              </label>
            ))}
          </div>
          <small className="field-hint">Nenhum marcado = <strong>todos</strong> os usuários veem.</small>
        </div>

        {error && <div className="alert error">{error}</div>}
        {ok && <div className="alert success">{ok}</div>}
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Publicando…' : 'Publicar'}</button>
      </form>

      <div className="card tight" style={{ padding: 0, overflow: 'auto' }}>
        <table className="admin-table">
          <thead><tr><th>Título</th><th>Público</th><th>Publicado em</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Carregando…</td></tr>
            ) : list.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-soft)' }}>Nenhum anúncio ainda.</td></tr>
            ) : list.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 600, color: 'var(--text)', maxWidth: 320 }}>
                  <div>{a.title}</div>
                  <div className="feature-matrix-desc"><span className="clamp-2">{a.body}</span></div>
                </td>
                <td style={{ color: 'var(--text-soft)' }}>
                  {!a.roles || a.roles.length === 0 ? 'Todos' : a.roles.map(roleLabel).join(', ')}
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
                <td>
                  <span className={`access-pill ${a.active === false ? 'access-blocked' : 'access-active'}`}>
                    {a.active === false ? 'Despublicado' : 'Publicado'}
                  </span>
                </td>
                <td>
                  <div className="actions">
                    <button className="btn btn-outline btn-sm" onClick={() => togglePublicado(a)}>
                      {a.active === false ? 'Publicar' : 'Despublicar'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => apagar(a)}>Apagar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
