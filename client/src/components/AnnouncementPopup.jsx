// Pop-up de anúncio do admin (demanda #9). Aparece no primeiro login após o anúncio ser
// publicado; ao fechar, o usuário o "vê" (não reaparece) e ele continua na lista do sino.
//
// Mostra um anúncio de cada vez: se houver vários pendentes, o próximo abre ao fechar o
// atual. Recarrega quando o usuário muda (login/troca de conta).
import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import '../styles/AnnouncementPopup.css';

export default function AnnouncementPopup({ userId }) {
  const [fila, setFila] = useState([]);
  const [fechando, setFechando] = useState(false);

  const carregar = useCallback(() => {
    if (!userId) { setFila([]); return; }
    api.getPendingAnnouncements()
      .then((list) => setFila(Array.isArray(list) ? list : []))
      .catch(() => setFila([]));
  }, [userId]);

  useEffect(() => { carregar(); }, [carregar]);

  const atual = fila[0];
  if (!atual) return null;

  async function fechar() {
    if (fechando) return;
    setFechando(true);
    // Otimista: tira da fila já; se a confirmação falhar, ele reaparece no próximo login
    // (o servidor é a fonte da verdade). Melhor isso do que travar o pop-up.
    setFila((f) => f.slice(1));
    try { await api.markAnnouncementSeen(atual.id); } catch { /* reaparece depois */ }
    setFechando(false);
  }

  return (
    <div className="modal-overlay announcement-overlay" role="dialog" aria-modal="true" aria-labelledby="ann-title">
      <div className="modal announcement-modal">
        <div className="announcement-badge" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 0 1-5.8-1.6" />
          </svg>
        </div>

        <h3 id="ann-title">{atual.title}</h3>
        {/* O texto é livre (o admin digita) — respeita as quebras de linha dele. */}
        <p className="announcement-body">{atual.body}</p>

        <div className="announcement-actions">
          {fila.length > 1 && (
            <span className="announcement-count">{fila.length} avisos</span>
          )}
          <button type="button" className="btn btn-primary" onClick={fechar} disabled={fechando} autoFocus>
            {fila.length > 1 ? 'Próximo' : 'Entendi'}
          </button>
        </div>
      </div>
    </div>
  );
}
