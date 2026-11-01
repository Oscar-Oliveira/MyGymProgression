// "What's new", newest first. Add an entry for each published change (the version goes up on deploy).
export interface ChangeEntry {
  date: string;
  pt: string[];
  en: string[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    date: '2026-11-01',
    pt: [
      'Progressão mais segura: uma decisão antiga ou a correção de um treino antigo já não apagam progresso mais recente; se corrigires um treino e a subida deixar de se justificar, a app pergunta se a anula.',
      'Só pode haver um treino em curso de cada vez.',
      'Exercícios: a pesquisa e os filtros mantêm-se quando voltas de um exercício. Desafio semanal com páginas.',
      'Plano: aviso ao sair sem guardar. Circuito marcado como feito por engano pode ser desfeito.',
      'Análise: períodos em semanas completas e datas locais. Velocidade em mph quando usas milhas.',
      'Treinar: o próximo dia de cada plano tem a etiqueta "próximo"; todos os dias usam a cor do plano.',
      'Todos os textos em português tratam-te por tu.',
    ],
    en: [
      'Safer progression: an old decision or a correction of an old workout no longer overwrites newer progress; when a correction no longer supports an increase, the app asks whether to undo it.',
      'Only one workout can be in progress at a time.',
      'Exercises: the search and filters stay when you come back from an exercise. The weekly challenge history has pages.',
      'Plan: a warning when you leave without saving. A circuit marked done by mistake can be undone.',
      'Analysis: periods in whole weeks and local dates. Speed in mph when you use miles.',
      'Train: the next day of each plan has a "next" label; every day uses the plan colour.',
    ],
  },
  {
    date: '2026-10-31',
    pt: ['Atualizações mais seguras: uma página antiga da app recarrega sozinha, e um aviso pede para a fechar quando bloqueia a atualização.'],
    en: ['Safer updates: an old page of the app reloads by itself, and a notice asks to close it when it blocks the update.'],
  },
  {
    date: '2026-10-31',
    pt: [
      'Jogos com os personal trainers (Mais → Jogos): Memória, Whack-a-PT, Adivinha o músculo, Flappy Halter, PT Runner e Starship, com recordes que podes repor.',
      'Desafio semanal (liga-o nas Definições): um objetivo novo todas as semanas no Início, feito a partir dos teus treinos, com histórico.',
    ],
    en: [
      'Games with the personal trainers (More → Games): Memory, Whack-a-PT, Guess the muscle, Flappy Dumbbell, PT Runner and Starship, with records you can reset.',
      'Weekly challenge (turn it on in Settings): a new goal every week on Home, made from your workouts, with a history.',
    ],
  },
  {
    date: '2026-10-31',
    pt: [
      'Início: o próximo treino respeita os dias da semana definidos nos planos (o de hoje primeiro).',
      'Desliza para a esquerda ou direita para mudar de separador.',
      'Ecrã inteiro na app instalada (Android).',
      'Personal trainer: escolhe homem ou mulher, novo estilo Energético e muitas frases novas.',
      'Os personal trainers aparecem no ecrã de arranque.',
      'Página do exercício: botão "Adicionar a plano" para o pôr num dia de um plano.',
    ],
    en: [
      'Home: the next workout follows the weekdays set in the plans (today first).',
      'Swipe left or right to change tab.',
      'Full screen in the installed app (Android).',
      'Personal trainer: choose a man or a woman, a new Energetic style and many new messages.',
      'The personal trainers appear on the start screen.',
      'Exercise page: "Add to plan" button to put it in a plan day.',
    ],
  },
  {
    date: '2026-10-30',
    pt: ['Personal trainer também fora do treino: bom dia/boa tarde no Início e comentários no fim do treino, na Análise e no Histórico (uma vez por dia; podes desligar nas Definições).'],
    en: ['Personal trainer outside the workout too: a greeting on Home and comments at the end of a workout, in Analysis and in History (once a day; can be switched off in Settings).'],
  },
  {
    date: '2026-10-30',
    pt: [
      'Definições redesenhadas: cópia e restauro juntos, ações com descrição, interruptores.',
      'Treino: botão "Pausar" visível no topo e no menu.',
      'Retomar o último treino em pausa ou interrompido, no Histórico ou no resumo.',
      'Corrigir treino: mudar o estado; séries e exercícios por fazer destacados.',
    ],
    en: [
      'Settings redesigned: backup and restore together, actions with a description, switches.',
      'Workout: a visible "Pause" button at the top and in the menu.',
      'Resume the last paused or interrupted workout, from History or the summary.',
      'Correct a workout: change its status; sets and exercises not done stand out.',
    ],
  },
  {
    date: '2026-10-30',
    pt: [
      'Durante o treino o ecrã fica ligado e o telemóvel vibra ao concluir uma série.',
      'Cópia de segurança pelo menu de partilha do telemóvel (Drive, email…); aviso no Início após 7 dias sem cópia.',
      'Novos recordes no resumo do treino.',
      'Análise: séries por músculo por semana (referência 10–20) e comparação com o período anterior.',
      'Partilhar um plano por ficheiro ou link.',
      'Biblioteca aberta: cerca de 870 exercícios com fotos, instalada a partir das Definições.',
    ],
    en: [
      'During a workout the screen stays on and the phone vibrates when a set is done.',
      'Backup through the phone share menu (Drive, email…); a warning on Home after 7 days without a backup.',
      'New records in the workout summary.',
      'Analysis: sets per muscle per week (10–20 guideline) and comparison with the previous period.',
      'Share a plan as a file or a link.',
      'Open library: about 870 exercises with photos, installed from Settings.',
    ],
  },
  {
    date: '2026-10-30',
    pt: ['Início: tocar numa data abre o dia — treinos feitos ou dias do plano para esse dia da semana, com Começar.', 'Personal trainer com avatar próprio para cada estilo, que "fala" quando aparece.'],
    en: ['Home: tap a date to open the day — workouts done, or the plan days set to that weekday, with Start.', 'Personal trainer has its own face for each style, which "talks" when it appears.'],
  },
  {
    date: '2026-10-30',
    pt: [
      'Botões e destaques usam a cor do dia ou, se o dia não tiver, a do plano.',
      'Planos de força começam em 5×5; o intervalo de reps define-se em cada exercício.',
      'Personal trainer também entre exercícios: às vezes, sempre ou só no início.',
      'Análise: período com datas e gráfico de treinos por semana.',
    ],
    en: [
      'Buttons and highlights use the day colour or, if none, the plan colour.',
      'Strength plans start at 5×5; the rep range is set per exercise.',
      'Personal trainer between exercises too: sometimes, always or only at the start.',
      'Analysis: period with dates and a workouts-per-week chart.',
    ],
  },
  {
    date: '2026-10-30',
    pt: [
      'Novo visual escuro, com cores por plano e por dia.',
      'Circuitos: exercícios seguidos, sem descanso, com um só "feito" no fim.',
      'Personal trainer opcional com mensagens motivadoras (4 estilos).',
      'Juntar exercícios duplicados, com o histórico todo.',
      'Editor de planos em lista compacta; ecrã de abertura e página Sobre.',
    ],
    en: [
      'New dark look, with colours per plan and per day.',
      'Circuits: exercises back to back, no rest, one "done" at the end.',
      'Optional personal trainer with motivating messages (4 styles).',
      'Join duplicate exercises, with their whole history.',
      'Plan editor as a compact list; splash screen and About page.',
    ],
  },
  {
    date: '2026-10-29',
    pt: ['Histórico paginado, mensagens da app consistentes, ícone, importação de biblioteca por ficheiro, tipo por dia nos planos mistos.'],
    en: ['Paginated history, consistent in-app messages, icon, library import from a file, type per day in mixed plans.'],
  },
];
