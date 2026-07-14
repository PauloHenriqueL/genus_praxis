// Matriz de acesso: funcionalidade × papel (demanda #4) + a mensagem do cadeado (#3).
//
// O catálogo (chaves, rótulos, descrições) vem do SERVIDOR (`GET /api/settings`), que é a
// fonte única. Esta tela não conhece nenhuma feature por nome — adicionar uma em
// `server/features.js` a faz aparecer aqui sozinha.
import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFeatures } from '../features';
import Typewriter from '../components/Typewriter';
import '../styles/Admin.css';

const ROLE_LABEL = { aluno: 'Aluno', visitante: 'Visitante' };

export default function AdminFeatures() {
  const { reload } = useFeatures();

  const [catalog, setCatalog] = useState([]);
  const [roles, setRoles] = useState([]);
  const [access, setAccess] = useState({});
  const [message, setMessage] = useState('');
  // Demanda #8: a duração padrão do acesso de visitante.
  // Estado da CHAVE MESTRA da avaliação (o toggle "Avaliação automática", em Contas).
  // Sem ela, as caixas de "Avaliação por IA" não têm efeito — e o admin precisa saber
  // disso na hora, senão marca a caixa e acha que o sistema ignorou.
  const [evaluatorEnabled, setEvaluatorEnabled] = useState(true);
  const [durations, setDurations] = useState([]);
  const [duration, setDuration] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        setCatalog(s.features || []);
        setRoles(s.featureRoles || []);
        setAccess(s.featureAccess || {});
        setMessage(s.lockedFeatureMessage || '');
        setDurations(s.visitorDurations || []);
        setDuration(s.visitorAccessDuration || '');
        setEvaluatorEnabled(!!s.evaluatorEnabled);
      })
      .catch((e) => setErr(e.message || 'Erro ao carregar as configurações.'))
      .finally(() => setLoading(false));
  }, []);

  function toggle(key, role) {
    setOk('');
    setAccess((a) => ({ ...a, [key]: { ...a[key], [role]: !a[key]?.[role] } }));
  }

  async function save() {
    setSaving(true); setErr(''); setOk('');
    try {
      const saved = await api.adminUpdateSettings({
        featureAccess: access,
        lockedFeatureMessage: message,
        visitorAccessDuration: duration,
      });
      setAccess(saved.featureAccess || access);
      setMessage(saved.lockedFeatureMessage || '');
      if (saved.visitorAccessDuration) setDuration(saved.visitorAccessDuration);
      // A sidebar do PRÓPRIO admin lê a mesma matriz — recarrega para não ficar velha.
      if (reload) await reload();
      setOk('Configurações salvas.');
    } catch (e) {
      setErr(e.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="admin-page"><p>Carregando…</p></div>;

  return (
    <div className="admin-page">
      <div className="page-header">
        <div className="eyebrow">Administração</div>
        <h2><Typewriter text="Acesso às " /><span className="accent"><Typewriter text="funcionalidades" delayStart={280} /></span></h2>
        <div className="ornament" />
      </div>

      {/* O usuário pediu explicitamente: o admin tem que entender, ao abrir esta tela,
          que ele NÃO está mexendo em algo visual — está mudando o sistema. */}
      <div className="card feature-warning">
        <h3 className="card-title">Isto não é um ajuste visual</h3>
        <p>
          Desmarcar uma caixa <strong>desliga a funcionalidade de verdade</strong> para aquele perfil.
          A pessoa continua vendo o item no menu, mas ele aparece com um <strong>cadeado</strong>: clicar
          abre um aviso em vez de entrar. E o bloqueio <strong>não é só da tela</strong> — o servidor recusa
          o acesso mesmo que ela digite o endereço na mão ou use uma versão antiga do site.
        </p>
        <p>
          Consequências que costumam passar despercebidas:
        </p>
        <ul>
          <li>
            <strong>Duelo desligado</strong> não cancela os duelos já aceitos — eles continuam podendo ser
            jogados até o fim. O que fica bloqueado é <em>criar</em> e <em>aceitar</em> novos.
          </li>
          <li>
            <strong>Competitivo desligado</strong> tira o acesso ao MMR; as partidas em treino seguem normais.
          </li>
          <li>
            <strong>Avaliação por IA</strong> é a única que custa dinheiro: cada sessão avaliada é uma chamada
            paga. Ela nasce desligada para o visitante de propósito — um lead pode entrar aos montes.
          </li>
        </ul>
        <p className="feature-warning-note">
          Administradores e professores não aparecem aqui: o acesso deles vem do papel e não é bloqueável.
        </p>
      </div>

      {!evaluatorEnabled && (
        <div className="alert" style={{ marginBottom: 18 }}>
          A <strong>Avaliação automática</strong> está <strong>desligada</strong> em{' '}
          <Link to="/admin/contas">Contas</Link> — é a chave mestra. Enquanto ela estiver desligada,
          <strong> ninguém é avaliado</strong>, marque o que marcar na linha "Avaliação por IA" abaixo.
        </div>
      )}

      <div className="card">
        <h3 className="card-title">Quem pode usar o quê</h3>
        <div className="table-wrap">
          <table className="feature-matrix">
            <thead>
              <tr>
                <th>Funcionalidade</th>
                {roles.map((r) => <th key={r} className="feature-matrix-role">{ROLE_LABEL[r] || r}</th>)}
              </tr>
            </thead>
            <tbody>
              {catalog.map((f) => (
                <tr key={f.key}>
                  <td>
                    <div className="feature-matrix-name">{f.label}</div>
                    <div className="feature-matrix-desc">{f.description}</div>
                  </td>
                  {roles.map((r) => (
                    <td key={r} className="feature-matrix-cell">
                      <label className="feature-check">
                        <input
                          type="checkbox"
                          checked={!!access[f.key]?.[r]}
                          onChange={() => toggle(f.key, r)}
                        />
                        <span className="sr-only">{`${f.label} para ${ROLE_LABEL[r] || r}`}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">Mensagem do cadeado</h3>
        <p className="settings-row-desc">
          É a <strong>mesma mensagem para todas</strong> as funcionalidades bloqueadas — ela aparece no aviso
          que abre quando a pessoa clica num item cadeado. Deixe em branco para usar o texto padrão.
        </p>
        <textarea
          rows={4}
          value={message}
          onChange={(e) => { setMessage(e.target.value); setOk(''); }}
          placeholder="Ex.: Esta funcionalidade está disponível apenas para alunos matriculados. Fale com a secretaria."
          maxLength={600}
        />
      </div>

      <div className="card">
        <h3 className="card-title">Duração do acesso de visitante</h3>
        <p className="settings-row-desc">
          Quanto tempo um visitante novo pode usar a plataforma antes de o acesso expirar.
          Depois disso ele é bloqueado até um administrador renovar, em <strong>Contas</strong>.
        </p>
        <select
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setOk(''); }}
          style={{ maxWidth: 260 }}
        >
          {durations.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <p className="settings-row-desc" style={{ marginTop: 10 }}>
          <strong>Mudar isto afeta só os visitantes novos.</strong> Quem já se cadastrou mantém
          o prazo combinado no cadastro dele. Ao <strong>renovar</strong> um visitante em Contas,
          ele passa a valer a duração escolhida aqui.
        </p>
      </div>

      {err && <div className="alert error">{err}</div>}
      {ok && <div className="alert success">{ok}</div>}

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? 'Salvando…' : 'Salvar configurações'}
      </button>
    </div>
  );
}
