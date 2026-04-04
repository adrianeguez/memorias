import { describe, expect, it } from 'vitest';
import {
  formatDateKey,
  getWeekRangeMondaySunday,
  groupMemoriesByDay,
  isValidSheetFileName,
  sortMemoriesPresentToPast,
} from './dateUtils';
import type { MemoryRecord } from './dateUtils';

function memory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    uniqueKey: 'k1',
    id: 'id-1',
    title: 'titulo',
    description: 'descripcion',
    urls: [],
    dateKey: '2026-04-01',
    createdAtIso: '2026-04-01T08:00:00.000Z',
    sheetId: 'sheet-1',
    ...overrides,
  };
}

describe('dateUtils', () => {
  it('formatDateKey genera YYYY-MM-DD', () => {
    expect(formatDateKey(new Date('2026-04-02T18:20:00'))).toBe('2026-04-02');
  });

  it('isValidSheetFileName valida naming diario', () => {
    expect(isValidSheetFileName('2026-04-02')).toBe(true);
    expect(isValidSheetFileName('2026-4-2')).toBe(false);
    expect(isValidSheetFileName('notes')).toBe(false);
  });

  it('getWeekRangeMondaySunday calcula lunes a domingo', () => {
    const result = getWeekRangeMondaySunday(new Date('2026-04-03T10:00:00'));
    expect(formatDateKey(result.start)).toBe('2026-03-30');
    expect(formatDateKey(result.end)).toBe('2026-04-05');
  });

  it('sortMemoriesPresentToPast ordena descendente', () => {
    const sorted = sortMemoriesPresentToPast([
      memory({ uniqueKey: 'a', dateKey: '2026-04-01', createdAtIso: '2026-04-01T08:00:00.000Z' }),
      memory({ uniqueKey: 'b', dateKey: '2026-04-03', createdAtIso: '2026-04-03T08:00:00.000Z' }),
      memory({ uniqueKey: 'c', dateKey: '2026-04-02', createdAtIso: '2026-04-02T08:00:00.000Z' }),
    ]);

    expect(sorted.map((item) => item.dateKey)).toEqual(['2026-04-03', '2026-04-02', '2026-04-01']);
  });

  it('groupMemoriesByDay agrupa por dia de la semana', () => {
    const weekRange = getWeekRangeMondaySunday(new Date('2026-04-03T10:00:00'));
    const grouped = groupMemoriesByDay(
      [
        memory({ uniqueKey: 'a', dateKey: '2026-03-30' }),
        memory({ uniqueKey: 'b', dateKey: '2026-04-01' }),
        memory({ uniqueKey: 'c', dateKey: '2026-04-05' }),
      ],
      weekRange
    );

    expect(grouped.Lunes).toHaveLength(1);
    expect(grouped.Miercoles).toHaveLength(1);
    expect(grouped.Domingo).toHaveLength(1);
    expect(grouped.Viernes).toHaveLength(0);
  });

  it('getWeekRangeMondaySunday maneja semana que cruza Dic-Ene', () => {
    // Miercoles 1 enero 2025 → semana lun 30-dic-2024 a dom 5-ene-2025
    const result = getWeekRangeMondaySunday(new Date('2025-01-01T10:00:00'));
    expect(result.startKey).toBe('2024-12-30');
    expect(result.endKey).toBe('2025-01-05');
  });

  it('groupMemoriesByDay incluye recuerdo en semana que cruza anio', () => {
    const weekRange = getWeekRangeMondaySunday(new Date('2025-01-01T10:00:00'));
    const grouped = groupMemoriesByDay(
      [
        memory({ uniqueKey: 'a', dateKey: '2024-12-30' }),
        memory({ uniqueKey: 'b', dateKey: '2025-01-01' }),
      ],
      weekRange
    );
    expect(grouped.Lunes).toHaveLength(1);
    expect(grouped.Miercoles).toHaveLength(1);
  });

  it('sortMemoriesPresentToPast maneja createdAtIso vacio', () => {
    const sorted = sortMemoriesPresentToPast([
      memory({ uniqueKey: 'a', dateKey: '2026-04-01', createdAtIso: '' }),
      memory({ uniqueKey: 'b', dateKey: '2026-04-02', createdAtIso: '' }),
    ]);
    expect(sorted[0].dateKey).toBe('2026-04-02');
  });

  it('formatDateKey convierte string ISO correctamente', () => {
    expect(formatDateKey('2025-12-31')).toBe('2025-12-31');
  });
});
