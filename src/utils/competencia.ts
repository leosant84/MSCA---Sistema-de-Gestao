// Utilitários para manipulação e avanço de competências contábeis (ex: "out/26" ou "10/2026")

const MONTHS_PT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez'
];

/**
 * Converte uma competência em mês (0 a 11) e ano (ex: 2026)
 */
export function parseCompetencia(compStr: string): { month: number; year: number } {
  const clean = compStr.trim().toLowerCase();

  // Caso formato abreviado textual: "out/26" ou "out/2026"
  if (clean.includes('/')) {
    const [mPart, yPart] = clean.split('/');
    const monthIndex = MONTHS_PT.indexOf(mPart);
    if (monthIndex !== -1) {
      let y = parseInt(yPart, 10);
      if (y < 100) y += 2000;
      return { month: monthIndex, year: y };
    }

    // Caso numérico: "10/2026" ou "10/26"
    const numMonth = parseInt(mPart, 10);
    if (!isNaN(numMonth) && numMonth >= 1 && numMonth <= 12) {
      let y = parseInt(yPart, 10);
      if (y < 100) y += 2000;
      return { month: numMonth - 1, year: y };
    }
  }

  const now = new Date();
  return { month: now.getMonth(), year: now.getFullYear() };
}

/**
 * Formata mês e ano no mesmo padrão textual ou numérico
 */
export function formatCompetencia(month: number, year: number, useShortText = true): string {
  const shortYear = String(year).slice(-2);
  if (useShortText) {
    return `${MONTHS_PT[month]}/${shortYear}`;
  }
  const mNum = String(month + 1).padStart(2, '0');
  return `${mNum}/${year}`;
}

/**
 * Gera uma lista de N competências consecutivas a partir da inicial
 */
export function generateCompetenciaSequence(initialComp: string, count: number): string[] {
  const isShortText = MONTHS_PT.some((m) => initialComp.toLowerCase().startsWith(m));
  const { month, year } = parseCompetencia(initialComp);

  const sequence: string[] = [];
  let currentMonth = month;
  let currentYear = year;

  for (let i = 0; i < count; i++) {
    sequence.push(formatCompetencia(currentMonth, currentYear, isShortText));
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  return sequence;
}

/**
 * Extrai a data de vencimento estimada de um lançamento financeiro
 * 1. Procura "Vencimento dia X" na observação
 * 2. Caso contrário, adota o dia 10 do mês da competência
 */
export function getEntryDueDate(competencia: string, observacao?: string | null): Date {
  const { month, year } = parseCompetencia(competencia);
  let dueDay = 10; // Dia padrão de vencimento contábil

  if (observacao) {
    const match = observacao.match(/vencimento\s+(?:dia\s+)?(\d{1,2})/i);
    if (match && match[1]) {
      const parsedDay = parseInt(match[1], 10);
      if (parsedDay >= 1 && parsedDay <= 31) {
        dueDay = parsedDay;
      }
    }
  }

  // Cria a data no último dia válido do mês caso dueDay exceda (ex: dia 31 em fev)
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const finalDay = Math.min(dueDay, lastDayOfMonth);

  // Define como fim do dia de vencimento (23:59:59)
  return new Date(year, month, finalDay, 23, 59, 59, 999);
}

/**
 * Verifica se um lançamento "À RECEBER" está vencido (inadimplente)
 */
export function isEntryOverdue(entry: {
  status: string;
  competencia: string;
  observacao?: string | null;
}): boolean {
  if (entry.status !== 'À RECEBER') return false;
  const dueDate = getEntryDueDate(entry.competencia, entry.observacao);
  const now = new Date();
  return now.getTime() > dueDate.getTime();
}
