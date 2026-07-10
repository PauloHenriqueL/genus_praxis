import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import Typewriter from '../components/Typewriter';

const ROLE_LABELS = { admin: 'Administrador', supervisor: 'Professor', therapist: 'Aluno' };
const EMPTY_FORM = { username: '', name: '', password: '', role: 'therapist', teacherId: '', email: '' };

export default function AdminUsers({ user: currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [exporting, setExporting] = useState(false);
  const [evalEnabled, setEvalEnabled] = useState(false);
  const [evalSaving, setEvalSaving] = useState(false);
  const [evalError, setEvalError] = useState('');
  const [visitorEvalEnabled, setVisitorEvalEnabled] = useState(false);
  const [visitorEvalSaving, setVisitorEvalSaving] = useState(false);
  const [visitorEvalError, setVisitorEvalError] = useState('');

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        setEvalEnabled(!!s.evaluatorEnabled);
        setVisitorEvalEnabled(!!s.visitorEvaluationEnabled);
      })
      .catch(() => {});
  }, []);

  async function toggleEvaluator() {
    if (evalSaving) return;
    setEvalSaving(true); setEvalError('');
    try {
      const s = await api.adminUpdateSettings({ evaluatorEnabled: !evalEnabled });
      setEvalEnabled(!!s.evaluatorEnabled);
    } catch (err) {
      setEvalError(err.message || 'Erro ao salvar configuração.');
    } finally {
      setEvalSaving(false);
    }
  }

  async function toggleVisitorEvaluation() {
    if (visitorEvalSaving) return;
    setVisitorEvalSaving(true); setVisitorEvalError('');
    try {
      const s = await api.adminUpdateSettings({ visitorEvaluationEnabled: !visitorEvalEnabled });
      setVisitorEvalEnabled(!!s.visitorEvaluationEnabled);
    } catch (err) {
      setVisitorEvalError(err.message || 'Erro ao salvar configuração.');
    } finally {
      setVisitorEvalSaving(false);
    }
  }

  function load() {
    setLoading(true);
    api.adminListUsers().then(setUsers).catch((err) => setError(err.message || 'Erro ao carregar usuários')).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const teachers = useMemo(() => users.filter((u) => u.role === 'supervisor'), [users]);
  const teacherById = useMemo(() => { const m = {}; for (const t of teachers) m[t.id] = t; return m; }, [teachers]);
  const filteredUsers = useMemo(() => (filterRole === 'all' ? users : users.filter((u) => u.role === filterRole)), [users, filterRole]);

  function openCreate() { setForm(EMPTY_FORM); setEditingId(null); setFormError(''); setShowModal(true); }
  function openEdit(u) {
    setForm({ username: u.username || '', name: u.name || '', password: '', role: u.role, teacherId: u.teacherId || '', email: u.email || '' });
    setEditingId(u.id); setFormError(''); setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditingId(null); setForm(EMPTY_FORM); setFormError(''); }
  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'role' && value !== 'therapist') next.teacherId = '';
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.username.trim()) return setFormError('Usuário é obrigatório.');
    if (!form.name.trim()) return setFormError('Nome é obrigatório.');
    if (!editingId && !form.password) return setFormError('Senha é obrigatória.');
    if (form.password && form.password.length < 6) return setFormError('Senha deve ter ao menos 6 caracteres.');
    setSaving(true);
    try {
      const payload = {
        username: form.username.trim(),
        name: form.name.trim(),
        role: form.role,
        teacherId: form.role === 'therapist' ? (form.teacherId || null) : null,
        email: form.email.trim(),
      };
      if (form.password) payload.password = form.password;
      if (editingId) await api.adminUpdateUser(editingId, payload);
      else await api.adminCreateUser(payload);
      closeModal();
      load();
    } catch (err) {
      setFormError(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(u) {
    if (u.id === currentUser.id) { setError('Você não pode excluir a própria conta.'); return; }
    if (!window.confirm(`Excluir ${ROLE_LABELS[u.role]} "${u.name}" (${u.username})?`)) return;
    try { await api.adminDeleteUser(u.id); load(); }
    catch (err) { setError(err.message || 'Erro ao excluir'); }
  }

  function openResetPassword(u) { setResetTarget(u); setResetPassword(''); setResetError(''); setResetSuccess(''); }
  function closeResetPassword() { setResetTarget(null); setResetPassword(''); setResetError(''); setResetSuccess(''); setResetSaving(false); }
  async function handleResetPassword(e) {
    e.preventDefault();
    setResetError(''); setResetSuccess('');
    if (!resetPassword || resetPassword.length < 6) { setResetError('Senha deve ter ao menos 6 caracteres.'); return; }
    setResetSaving(true);
    try {
      await api.adminResetPassword(resetTarget.id, resetPassword);
      setResetSuccess(`Senha redefinida para ${resetTarget.username}.`);
      setTimeout(() => closeResetPassword(), 1400);
    } catch (err) {
      setResetError(err.message || 'Erro ao redefinir senha.');
    } finally {
      setResetSaving(false);
    }
  }

  async function handleExport() {
    if (exporting) return;
    setExporting(true); setError('');
    try {
      const { blob, filename } = await api.adminExportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Erro ao exportar: ' + err.message);
    } finally {
      setExporting(false);
    }
  }

  const roleFilters = [
    { v: 'all', label: `Todos (${users.length})` },
    { v: 'admin', label: `Administradores (${users.filter((u) => u.role === 'admin').length})` },
    { v: 'supervisor', label: `Professores (${users.filter((u) => u.role === 'supervisor').length})` },
    { v: 'therapist', label: `Alunos (${users.filter((u) => u.role === 'therapist').length})` },
  ];

  return (
    <div>
      <div className="page-header with-action">
        <div>
          <div className="eyebrow">Administração · Contas</div>
          <h2><Typewriter text="Gestão de " /><span className="accent"><Typewriter text="Contas" delayStart={420} /></span></h2>
          <p>Crie alunos, professores e administradores, e gerencie senhas.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={handleExport} disabled={exporting} title="Baixa um JSON com todos os dados do servidor.">
            {exporting ? 'Baixando…' : 'Exportar dados'}
          </button>
          <button className="btn btn-primary" onClick={openCreate}>+ Nova Conta</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {/* Avaliação: liga/desliga o avaliador (estrutura pronta). */}
      <div className="card settings-row">
        <div style={{ maxWidth: 640 }}>
          <div className="settings-row-title">
            Avaliação automática
            <span className={`pill-status ${evalEnabled ? 'on' : 'off'}`}>{evalEnabled ? 'LIGADA' : 'DESLIGADA'}</span>
          </div>
          <p className="settings-row-desc">
            Quando <strong>desligada</strong>, ao finalizar a sessão o aluno vê a tela de agradecimento e o log é salvo
            para análise humana. Quando <strong>ligada</strong>, a IA avalia a sessão (requer a <code>OPENAI_API_KEY</code>).
          </p>
          {evalError && <div className="alert error" style={{ marginTop: 8, marginBottom: 0 }}>{evalError}</div>}
        </div>
        <button className={`btn ${evalEnabled ? 'btn-outline' : 'btn-primary'}`} onClick={toggleEvaluator} disabled={evalSaving}>
          {evalSaving ? 'Salvando…' : (evalEnabled ? 'Desligar' : 'Ligar')}
        </button>
      </div>

      {/* Avaliação do visitante: custo de IA para sessões anônimas. Só faz efeito
          com a avaliação automática ligada. */}
      <div className="card settings-row">
        <div style={{ maxWidth: 640 }}>
          <div className="settings-row-title">
            Avaliar sessões de visitante
            <span className={`pill-status ${visitorEvalEnabled ? 'on' : 'off'}`}>{visitorEvalEnabled ? 'LIGADA' : 'DESLIGADA'}</span>
          </div>
          <p className="settings-row-desc">
            Visitantes têm sessão temporária e não pontuam. Por padrão eles <strong>não</strong> são avaliados,
            para não gastar chamadas de IA com acessos anônimos. Ligue para que também recebam a devolutiva.
            {!evalEnabled && <> Sem efeito enquanto a <strong>avaliação automática</strong> estiver desligada.</>}
          </p>
          {visitorEvalError && <div className="alert error" style={{ marginTop: 8, marginBottom: 0 }}>{visitorEvalError}</div>}
        </div>
        <button
          className={`btn ${visitorEvalEnabled ? 'btn-outline' : 'btn-primary'}`}
          onClick={toggleVisitorEvaluation}
          disabled={visitorEvalSaving}
        >
          {visitorEvalSaving ? 'Salvando…' : (visitorEvalEnabled ? 'Desligar' : 'Ligar')}
        </button>
      </div>

      <div className="filter-chips">
        {roleFilters.map((opt) => (
          <button key={opt.v} className={`btn btn-sm ${filterRole === opt.v ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilterRole(opt.v)}>{opt.label}</button>
        ))}
      </div>

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> <span style={{ marginLeft: 12 }}>Carregando…</span></div>
      ) : filteredUsers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-soft)' }}>Nenhuma conta nesta categoria.</div>
      ) : (
        <div className="card tight" style={{ padding: 0, overflow: 'auto' }}>
          <table className="admin-table">
            <thead><tr><th>Nome</th><th>Usuário</th><th>Função</th><th>Vínculo</th><th>Ações</th></tr></thead>
            <tbody>
              {filteredUsers.map((u) => {
                const isCurrent = u.id === currentUser.id;
                const teacher = u.teacherId ? teacherById[u.teacherId] : null;
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                      {u.name}{isCurrent && <span className="you-badge">(você)</span>}
                    </td>
                    <td><code>{u.username}</code></td>
                    <td>{ROLE_LABELS[u.role] || u.role}</td>
                    <td style={{ color: 'var(--text-soft)' }}>
                      {u.role === 'therapist'
                        ? (teacher ? `Professor: ${teacher.name}` : '—')
                        : u.role === 'supervisor'
                          ? `${users.filter((s) => s.teacherId === u.id).length} aluno(s)`
                          : '—'}
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>Editar</button>
                        <button className="btn btn-outline btn-sm" onClick={() => openResetPassword(u)}>Senha</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)} disabled={isCurrent}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal">
            <h3>{editingId ? 'Editar Conta' : 'Nova Conta'}</h3>
            <form className="admin-form" onSubmit={handleSubmit}>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor="username">Usuário</label>
                  <input id="username" name="username" value={form.username} onChange={handleChange} placeholder="ex: ana.silva" autoComplete="off" required />
                  <small className="field-hint">3 a 32 caracteres · letras, números, ponto, _ e -</small>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="role">Função</label>
                  <select id="role" name="role" value={form.role} onChange={handleChange}>
                    <option value="therapist">Aluno</option>
                    <option value="supervisor">Professor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="name">Nome completo</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} placeholder="Ex: Ana Silva" required />
              </div>
              <div>
                <label htmlFor="email">E-mail <em className="opt">(opcional)</em></label>
                <input id="email" name="email" type="email" value={form.email} onChange={handleChange} placeholder="ana@exemplo.com" />
              </div>
              {form.role === 'therapist' && (
                <div>
                  <label htmlFor="teacherId">Professor responsável <em className="opt">(opcional)</em></label>
                  <select id="teacherId" name="teacherId" value={form.teacherId} onChange={handleChange}>
                    <option value="">— nenhum —</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.username})</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="password">{editingId ? 'Nova senha' : 'Senha'}{editingId && <em className="opt"> (em branco para manter)</em>}</label>
                <input id="password" name="password" type="text" value={form.password} onChange={handleChange} placeholder={editingId ? '••••••' : 'Senha inicial (mínimo 6)'} autoComplete="new-password" />
              </div>
              {formError && <div className="alert error">{formError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={closeModal} disabled={saving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : editingId ? 'Salvar Alterações' : 'Criar Conta'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeResetPassword(); }}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Redefinir senha</h3>
            <p className="modal-text">Definir nova senha para <strong>{resetTarget.name}</strong> (<code>{resetTarget.username}</code>).</p>
            <form className="admin-form" onSubmit={handleResetPassword}>
              <div>
                <label htmlFor="newPwd">Nova senha</label>
                <input id="newPwd" type="text" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoComplete="new-password" autoFocus />
              </div>
              {resetError && <div className="alert error">{resetError}</div>}
              {resetSuccess && <div className="alert success">{resetSuccess}</div>}
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={closeResetPassword} disabled={resetSaving}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={resetSaving || !!resetSuccess}>{resetSaving ? 'Salvando…' : 'Redefinir senha'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
