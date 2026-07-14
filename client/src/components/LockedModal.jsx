// Pop-up do cadeado (demanda #3). A mensagem é UMA SÓ para todas as funcionalidades
// (D6) e vem do servidor — o admin a edita na tela de Contas.
import '../styles/LockedModal.css';

export default function LockedModal({ featureLabel, message, onClose }) {
  return (
    <div
      className="modal-overlay locked-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal locked-modal" role="dialog" aria-modal="true" aria-labelledby="locked-title">
        <span className="locked-modal-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>

        <h3 id="locked-title">{featureLabel || 'Funcionalidade bloqueada'}</h3>
        <p className="locked-modal-text">{message}</p>

        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          Entendi
        </button>
      </div>
    </div>
  );
}
