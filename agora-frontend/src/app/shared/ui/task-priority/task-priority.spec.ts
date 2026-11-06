import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { TaskPriority } from '../../../core/api/tasks.types';
import { TaskPriorityPill } from './task-priority';

const render = (priority: TaskPriority): HTMLElement => {
  const fixture = TestBed.createComponent(TaskPriorityPill);

  fixture.componentRef.setInput('priority', priority);
  fixture.detectChanges();

  return fixture.nativeElement as HTMLElement;
};

describe('TaskPriorityPill', () => {
  it.each<[TaskPriority, string]>([
    ['LOW', 'Prioridad baja'],
    ['MEDIUM', 'Prioridad media'],
    ['HIGH', 'Prioridad alta'],
  ])('dice %s con palabras: el contorno no lleva la información', (priority, label) => {
    expect(render(priority).textContent?.trim()).toBe(label);
  });

  it('se distingue de la píldora de estado: es de contorno y no lleva relleno de color', () => {
    const { classList } = render('HIGH');

    expect(classList.contains('border')).toBe(true);
    expect(classList.contains('bg-superficie-00')).toBe(true);
    expect([...classList].some((name) => /^bg-(veril|baliza|estado|arrecife)/.test(name))).toBe(
      false,
    );
  });

  it('sube el contorno con la urgencia, solo con tokens que ya existen', () => {
    expect(render('LOW').classList.contains('border-borde')).toBe(true);
    expect(render('MEDIUM').classList.contains('border-veril-somero')).toBe(true);
    expect(render('HIGH').classList.contains('border-tinta')).toBe(true);
  });

  it('no usa baliza: ya es «Bloqueada» y «Atrasada»', () => {
    for (const priority of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      expect(render(priority).className).not.toContain('baliza');
    }
  });
});
