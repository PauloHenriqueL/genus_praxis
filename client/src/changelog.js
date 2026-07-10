// Notas de atualização do Genus Práxis — exibidas no painel "Atualizações do
// sistema" (ícone de bloco de notas com exclamação, ao lado das notificações).
//
// Uma entrada por dia. Mais recente primeiro.
// `date` em ISO (YYYY-MM-DD); `body` aceita quebras de linha (renderizado em
// pre-wrap).

export const CHANGELOG = [
  {
    date: '2026-07-08',
    title: 'Duelo, Ranking e Progressão ⚔️',
    body: `Olá, pessoal! Chegou um pacote grande de recursos ao Genus Práxis. Segue o resumo do que já está disponível:

🔹 Competitivo e Ranking:

    Calibração de Nível: são necessárias 5 sessões para calibrar e definir seu nível inicial no sistema.

    Ranking global: sua nota geral e sua colocação passam a ser calculadas com base no histórico acumulado de vários atendimentos, com títulos por faixa de habilidade.

    Pacientes dinâmicos: a dificuldade dos pacientes de simulação se ajusta de forma adaptativa conforme as tentativas de atendimento.

🔹 Duelo:

    Duelo entre alunos com avaliação cruzada: dois participantes atendem o mesmo paciente e uma avaliação comparativa aponta o vencedor.

    Modo Treino x Competitivo: no Treino nada afeta o ranking; no Competitivo o resultado vale MMR. Convites por link ou pelas notificações internas.

    Logs Sociais: acompanhe seus duelos por oponente, baixe o log completo (avaliação cruzada + notas + as duas sessões). Cada pessoa só acessa os próprios duelos, apagados automaticamente 30 dias após a criação.

🔹 Progressão:

    Trilha de Progressão: reatenda um paciente já visto e receba uma avaliação que compara o segundo atendimento com o primeiro, mostrando sua evolução.

🔹 Sistema e Perfil:

    Central de notificações: convites e resultados de duelo chegam pelo sino.

    Objetivos diários e conquistas, com títulos exibidos no perfil.

    Alteração de senha liberada (RECOMENDADO).

Continuem enviando os feedbacks com base na prática de vocês!`,
  },
  {
    date: '2026-06-24',
    title: 'Objetivos, conquistas e títulos',
    body: `• Objetivos diários chegaram à plataforma, junto de um conjunto de conquistas por prática (Simulação e Simulação Livre).
• Títulos por faixa de habilidade agora aparecem no seu perfil.
• "Minhas Sessões" reorganizada (visões de aluno, professor e admin), exibindo a sua maior nota em cada paciente.`,
  },
  {
    date: '2026-06-10',
    title: 'Simulação Livre e mapa de habilidades',
    body: `• Simulação Livre: prática pura, sem nota ao final — apenas o log da sessão, com foto de paciente personalizável.
• Mapa de Habilidades para visualizar sua evolução por competência.
• Avaliador clínico reformulado, com melhor experiência de pós-sessão e de supervisão.`,
  },
  {
    date: '2026-05-27',
    title: 'Supervisão e avaliação por critério',
    body: `• Aba de supervisão para o Professor acompanhar os alunos.
• A avaliação de sessão passa a detalhar as notas por critério (visíveis a professor e admin).
• Ajustes na foto de perfil padrão e na apresentação do log.`,
  },
  {
    date: '2026-05-13',
    title: 'Backup de dados e acesso em rede local',
    body: `• Administração: exportação completa dos dados para backup/migração.
• Melhorias de acesso pela rede local, facilitando os testes pelo celular.`,
  },
  {
    date: '2026-05-06',
    title: 'Modo visitante e login seguro',
    body: `• Modo visitante: dá pra experimentar a plataforma sem cadastro.
• Login seguro com senha (bcrypt + JWT) e gestão de contas pelo administrador.
• Sessões em andamento passam a ser salvas automaticamente (dá pra sair e voltar).
• Interface mobile aprimorada.`,
  },
  {
    date: '2026-04-22',
    title: 'Lançamento do Genus Práxis',
    body: `Primeira versão do Genus Práxis — a plataforma de simulação clínica para prática deliberada, começando pela Simulação de pacientes.`,
  },
];

// Data da atualização mais recente (pra marcar "novidades" não vistas).
export const LATEST_UPDATE = CHANGELOG.length ? CHANGELOG[0].date : null;
