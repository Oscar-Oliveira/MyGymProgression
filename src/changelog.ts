// "What's new", newest first. Add an entry for each published change (the version goes up on deploy).
export interface ChangeEntry {
  date: string;
  pt: string[];
  en: string[];
}

export const CHANGELOG: ChangeEntry[] = [
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
