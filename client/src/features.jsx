// Acesso a funcionalidades no client (demandas #3 e #4).
//
// ⚠ Isto é UX. Quem bloqueia de verdade é o servidor (`requireFeature` → 403). Aqui a
// gente só desenha o cadeado e abre o pop-up — se este arquivo mentir, o usuário no
// máximo vê um botão que não deveria, clica, e leva 403 da API.
//
// O catálogo (chaves, rótulos) vem do servidor em `GET /api/settings`. O client NÃO
// inventa chaves: se uma feature nova nascer no `server/features.js`, ela aparece aqui
// sozinha.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken } from './api';

const FeaturesContext = createContext(null);

/**
 * `userId` é a chave de recarga: ao entrar, sair ou trocar de conta, a matriz de
 * acesso muda (aluno e visitante têm colunas diferentes). Sem ele, quem fizesse
 * logout e entrasse com outro papel continuaria com a sidebar do papel anterior.
 */
export function FeaturesProvider({ userId, children }) {
  const [settings, setSettings] = useState(null);

  const reload = useCallback(() => {
    // `GET /api/settings` exige auth — sem token não há o que buscar (tela de login).
    if (!getToken()) { setSettings(null); return Promise.resolve(null); }
    return api.getSettings()
      .then((s) => { setSettings(s); return s; })
      .catch(() => { setSettings(null); return null; });
  }, []);

  useEffect(() => { reload(); }, [reload, userId]);

  return (
    <FeaturesContext.Provider value={{ settings, reload }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures() {
  const ctx = useContext(FeaturesContext);
  const settings = ctx?.settings || null;

  // Enquanto o /api/settings não responde, `my` é `{}` — e `can()` devolve **true**.
  //
  // Isto é deliberado: falhar ABERTO. Se falhássemos fechado, um hiccup de rede
  // desenharia a sidebar inteira cadeada, e o usuário legítimo acharia que perdeu o
  // acesso. Como o servidor barra de qualquer jeito, o pior caso aqui é ver um botão
  // que leva a um 403 — e não ficar trancado para fora do que é seu.
  const my = settings?.myFeatures || {};

  return {
    settings,
    reload: ctx?.reload,
    /** O usuário logado pode usar esta funcionalidade? */
    can: (key) => my[key] !== false,
    /** A mensagem única do cadeado (D6), definida pelo admin. */
    lockedMessage: settings?.lockedFeatureMessage
      || 'Esta funcionalidade não está liberada para o seu perfil.',
  };
}
