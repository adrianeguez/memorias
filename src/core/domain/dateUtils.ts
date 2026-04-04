export type DayLabel =
  | 'Lunes'
  | 'Martes'
  | 'Miercoles'
  | 'Jueves'
  | 'Viernes'
  | 'Sabado'
  | 'Domingo';

export interface MemoryRecord {
  uniqueKey: string;
  id: string;
  title: string;
  description: string;
  urls: string[];
  dateKey: string;
  createdAtIso: string;
  sheetId: string;
}

export interface WeekRange {
  start: Date;
  end: Date;
  startKey: string;
  endKey: string;
}

const DAY_LABELS: DayLabel[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function toDateAtMidnight(date: Date | string): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDateKey(date: Date | string): string {
  const d = toDateAtMidnight(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidSheetFileName(name: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(name);
}

export function sortMemoriesPresentToPast(memories: MemoryRecord[]): MemoryRecord[] {
  return [...memories].sort((a, b) => {
    const dateA = `${a.dateKey}T${a.createdAtIso || '00:00:00.000Z'}`;
    const dateB = `${b.dateKey}T${b.createdAtIso || '00:00:00.000Z'}`;
    return dateB.localeCompare(dateA);
  });
}

export function getWeekRangeMondaySunday(date: Date | string): WeekRange {
  const d = toDateAtMidnight(date);
  const day = d.getDay();
  const offsetToMonday = day === 0 ? 6 : day - 1;

  const start = new Date(d);
  start.setDate(d.getDate() - offsetToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start,
    end,
    startKey: formatDateKey(start),
    endKey: formatDateKey(end),
  };
}

export function groupMemoriesByDay(
  memories: MemoryRecord[],
  weekRange: WeekRange
): Record<DayLabel, MemoryRecord[]> {
  const grouped: Record<DayLabel, MemoryRecord[]> = {
    Lunes: [],
    Martes: [],
    Miercoles: [],
    Jueves: [],
    Viernes: [],
    Sabado: [],
    Domingo: [],
  };

  const startAt = weekRange.start.getTime();
  const endAt = weekRange.end.getTime();

  memories.forEach((memory) => {
    const d = toDateAtMidnight(new Date(`${memory.dateKey}T00:00:00`));
    const ts = d.getTime();
    if (ts < startAt || ts > endAt) return;

    const weekday = d.getDay();
    const index = weekday === 0 ? 6 : weekday - 1;
    const label = DAY_LABELS[index] as DayLabel;
    grouped[label].push(memory);
  });

  return grouped;
}
