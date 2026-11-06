import { describe, expect, it } from 'vitest';
import { formatCompleted, formatCount, formatOverdue } from './task-figures';

describe('formatCompleted', () => {
  it('sin tareas no hay cifra, y tampoco un 0%', () => {
    const text = formatCompleted({ total: 0, completed: 0, completedPercent: null, overdue: 0 });

    expect(text).toBe('Sin tareas');
  });

  it('con tareas sin terminar sí hay un 0%: es un dato, no una ausencia', () => {
    const text = formatCompleted({ total: 8, completed: 0, completedPercent: 0, overdue: 0 });

    expect(text).toBe('0 de 8 completadas (0%)');
  });

  it('una sola tarea va en singular', () => {
    const text = formatCompleted({ total: 1, completed: 1, completedPercent: 100, overdue: 0 });

    expect(text).toBe('1 de 1 completada (100%)');
  });

  it('separa los miles como en Colombia', () => {
    const text = formatCompleted({ total: 1535, completed: 504, completedPercent: 33, overdue: 0 });

    expect(text).toBe('504 de 1.535 completadas (33%)');
  });
});

describe('formatOverdue', () => {
  it('una sola va en singular', () => {
    expect(formatOverdue(1)).toBe('1 atrasada');
  });

  it('varias, en plural', () => {
    expect(formatOverdue(17)).toBe('17 atrasadas');
  });
});

describe('formatCount', () => {
  it('no separa por debajo de mil', () => {
    expect(formatCount(453)).toBe('453');
  });
});
