import { useState, useEffect } from 'react';
import { api, assetUrl } from '../api';
import Typewriter from '../components/Typewriter';
import PhotoCropper from '../components/PhotoCropper';
import { canReopenInCropper } from '../cropMath';
import { ICONS } from '../icons';
import '../styles/Profile.css';

const ROLE_LABELS = { admin: 'Administrador', supervisor: 'Professor', therapist: 'Aluno' };

export default function Profile({ user, onUpdate }) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [photo, setPhoto] = useState(user.profilePhoto || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [showCropper, setShowCropper] = useState(false);

  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  // Avatares prontos servidos pelo backend (/profiles_icon).
  const [gallery, setGallery] = useState([]);

  // Conquistas, constância e título. Desde a demanda #2 o visitante tem tudo isso —
  // ele é um usuário real (users.json) com as mesmas permissões de aluno. A ÚNICA
  // diferença que sobra aqui: ele não tem senha (demanda #1), então não há o que trocar.
  const isVisitor = user.role === 'visitor';
  const [gamification, setGamification] = useState(null);
  const [activeTitle, setActiveTitle] = useState(user.activeTitle || '');
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleErr, setTitleErr] = useState('');

  useEffect(() => {
    api.getProfilePhotos().then(setGallery).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user.id) return;
    api.getGamification(user.id).then(setGamification).catch(() => {});
  }, [user.id]);

  const earned = (gamification?.achievements || []).filter((a) => a.earned);
  const streak = gamification?.streak;

  // O cropper devolve o recorte já enquadrado (JPEG 320×320). Nada é salvo aqui:
  // a foto só vai ao servidor quando o usuário clica em "Salvar perfil".
  function handleCropDone(dataUrl) {
    setPhoto(dataUrl);
    setShowCropper(false);
    setErr('');
  }

  // Clicar no título ativo remove (titleId vazio limpa no backend).
  // Ao limpar, o servidor OMITE `activeTitle` do usuário — por isso normalizamos
  // a chave para '' em vez de espalhar `updated` sobre o `user` antigo, o que
  // manteria o título anterior e deixaria o selo preso na barra lateral.
  async function selectTitle(id) {
    if (titleSaving) return;
    const next = id === activeTitle ? '' : id;
    setTitleSaving(true); setTitleErr('');
    try {
      const updated = await api.setMyTitle(next);
      setActiveTitle(updated.activeTitle || '');
      onUpdate({ ...user, ...updated, activeTitle: updated.activeTitle || '' });
    } catch (e2) {
      setTitleErr(e2.message || 'Erro ao definir o título.');
    } finally {
      setTitleSaving(false);
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSaving(true); setMsg(''); setErr('');
    try {
      const updated = await api.updateUser(user.id, { name: name.trim(), email: email.trim(), profilePhoto: photo });
      onUpdate({ ...user, ...updated });
      setMsg('Perfil atualizado.');
      setTimeout(() => setMsg(''), 3000);
    } catch (e2) {
      setErr(e2.message || 'Erro ao salvar perfil.');
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwdSaving(true); setPwdMsg(''); setPwdErr('');
    if (newPwd.length < 6) { setPwdErr('A nova senha deve ter ao menos 6 caracteres.'); setPwdSaving(false); return; }
    try {
      await api.changeMyPassword(curPwd, newPwd);
      setPwdMsg('Senha alterada com sucesso.');
      setCurPwd(''); setNewPwd('');
      setTimeout(() => setPwdMsg(''), 3000);
    } catch (e2) {
      setPwdErr(e2.message || 'Erro ao alterar a senha.');
    } finally {
      setPwdSaving(false);
    }
  }


  return (
    <div className="profile-page">
      <div className="page-header">
        <div className="eyebrow">Conta</div>
        <h2><Typewriter text="Meu " /><span className="accent"><Typewriter text="Perfil" delayStart={280} /></span></h2>
        <p>Gerencie seus dados, sua foto, seu título{isVisitor ? '' : ' e sua senha'}.</p>
        <div className="ornament" />
      </div>

      {(streak?.isAlive || earned.length > 0) && (
        <section className="card profile-achievements">
          <h3 className="card-title">Metas alcançadas</h3>

          {streak?.isAlive && (
            <div className={`streak-badge ${streak.status}`}>
              <span className="badge-flame">●</span>
              {streak.status === 'monthly' ? 'Constância mensal' : streak.status === 'weekly' ? 'Constância semanal' : 'Constância'}
              {' · '}
              {streak.current} {streak.current === 1 ? 'dia' : 'dias'}
            </div>
          )}

          {earned.length === 0 ? (
            <p className="muted" style={{ fontSize: 13.5 }}>
              Nenhuma meta alcançada ainda. Conclua os objetivos diários e mantenha a constância para registrar marcos.
            </p>
          ) : (
            <>
              <div className="profile-badges">
                {earned.map((a) => (
                  <div key={a.id} className={`profile-badge tier-${a.tier}`} title={a.description}>
                    <div className="profile-badge-icon">{a.icon}</div>
                    <div className="profile-badge-title">{a.title}</div>
                    {a.earnedAt && (
                      <div className="profile-badge-date">{new Date(a.earnedAt).toLocaleDateString('pt-BR')}</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="profile-title-picker">
                <h4>Título exibido</h4>
                <p className="muted" style={{ fontSize: 13.5, marginBottom: 12 }}>
                  Escolha um título desbloqueado para exibir sob o seu nome, no menu e no ranking.
                  Clique no ativo para remover.
                </p>
                {titleErr && <div className="alert error" style={{ marginBottom: 10 }}>{titleErr}</div>}
                <div className="title-chips">
                  <button
                    type="button"
                    className={`title-chip ${!activeTitle ? 'active' : ''}`}
                    onClick={() => selectTitle('')}
                    disabled={titleSaving || !activeTitle}
                  >
                    Nenhum
                  </button>
                  {earned.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`title-chip tier-${a.tier} ${activeTitle === a.id ? 'active' : ''}`}
                      onClick={() => selectTitle(a.id)}
                      disabled={titleSaving}
                      title={a.description}
                    >
                      {a.icon} {a.title}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      )}

      <div className="profile-grid">
        <form className="card admin-form" onSubmit={saveProfile}>
          <div className="profile-photo-row">
            <span className="profile-photo-avatar">
              {photo ? <img src={assetUrl(photo)} alt={name} /> : ICONS.user}
            </span>
            <div>
              <div className="profile-photo-name">{user.name}</div>
              <div className="muted">{ROLE_LABELS[user.role] || user.role}{user.teacherName ? ` · Professor: ${user.teacherName}` : ''}</div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCropper(true)}>
                  {photo ? 'Trocar foto' : 'Enviar foto'}
                </button>
                {photo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPhoto('')}>Remover</button>}
              </div>
            </div>
          </div>

          {gallery.length > 0 && (
            <div>
              <label>Ou escolha um avatar</label>
              <div className="photo-gallery">
                {gallery.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`photo-gallery-item ${photo === p ? 'active' : ''}`}
                    onClick={() => setPhoto(photo === p ? '' : p)}
                    title="Usar este avatar"
                  >
                    <img src={assetUrl(p)} alt="" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="pname">Nome</label>
            <input id="pname" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="pemail">E-mail</label>
            <input id="pemail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
          </div>
          <div>
            <label>Usuário</label>
            <input value={user.username} disabled />
          </div>
          {err && <div className="alert error">{err}</div>}
          {msg && <div className="alert success">{msg}</div>}
          <div><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar perfil'}</button></div>
        </form>

        {/* O visitante entra sem senha (demanda #1) — não há o que alterar. */}
        {!isVisitor && (
        <form className="card admin-form" onSubmit={savePassword}>
          <h3 className="card-title">Alterar senha</h3>
          <div>
            <label htmlFor="curpwd">Senha atual</label>
            <input id="curpwd" type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} autoComplete="current-password" required />
          </div>
          <div>
            <label htmlFor="newpwd">Nova senha</label>
            <input id="newpwd" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" placeholder="Mínimo 6 caracteres" required />
          </div>
          {pwdErr && <div className="alert error">{pwdErr}</div>}
          {pwdMsg && <div className="alert success">{pwdMsg}</div>}
          <div><button type="submit" className="btn btn-primary" disabled={pwdSaving}>{pwdSaving ? 'Salvando…' : 'Alterar senha'}</button></div>
        </form>
        )}
      </div>

      {/* Fora dos <form> de propósito: o cropper tem <button> e <input file>, que
          dentro de um form disparariam o submit. */}
      {showCropper && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCropper(false); }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3>Ajustar foto de perfil</h3>
            {/* `canReopenInCropper`: só reabrimos foto que já é data URL — um avatar
                da galeria tingiria o canvas (ver cropMath.js). */}
            <PhotoCropper
              onCrop={handleCropDone}
              onCancel={() => setShowCropper(false)}
              initialImage={canReopenInCropper(photo) ? photo : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
