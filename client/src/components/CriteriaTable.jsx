import { CRITERIA_LABELS, baseKey, criteriaEntries } from '../logFiles';
import '../styles/CriteriaTable.css';

// Tabela de notas por critério do avaliador clínico (chaves "1".."6").
// DESTINADA SÓ A PROFESSOR/ADMIN — nunca ao aluno. No Genus, api.evaluate() só
// devolve `criteriaScores` para supervisor/admin, e o servidor também o remove
// dos logs do aluno. Tolera o prefixo A/B do avaliador comparativo (duelo).
//
// Os rótulos e a ordenação moram em `logFiles.js` porque o .txt exportado monta
// a mesma lista — uma fonte só evita as duas divergirem.
export default function CriteriaTable({ criteriaScores }) {
  const entries = criteriaEntries(criteriaScores);
  if (entries.length === 0) return null;
  return (
    <div className="criteria-table">
      <div className="criteria-table-title">
        Notas por critério <span className="criteria-table-note">(visível só ao professor/admin)</span>
      </div>
      <div className="criteria-grid">
        {entries.map(([k, v]) => (
          <div key={k} className="criterion-item">
            <span className="criterion-label">{CRITERIA_LABELS[baseKey(k)] || `Critério ${k}`}</span>
            <span className="criterion-score">
              {Number(v)}<span className="criterion-score-max">/10</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
