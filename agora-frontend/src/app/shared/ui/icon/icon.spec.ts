import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName, type IconSize } from './icon';

const render = (name: IconName, size?: IconSize): SVGSVGElement => {
  const fixture = TestBed.createComponent(Icon);

  fixture.componentRef.setInput('name', name);

  if (size) {
    fixture.componentRef.setInput('size', size);
  }

  fixture.detectChanges();

  return (fixture.nativeElement as HTMLElement).querySelector('svg')!;
};

describe('Icon', () => {
  it.each<[IconName, number]>([
    ['bell', 2],
    ['folder', 1],
    ['house', 2],
    ['log-out', 3],
    ['message-circle', 1],
    ['user', 2],
  ])('dibuja %s con sus trazados, en el espacio de nombres de SVG', (name, shapes) => {
    const svg = render(name);

    expect(svg.children.length).toBe(shapes);
    expect(svg.children[0].namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('hereda el color de lo que tiene encima', () => {
    const svg = render('bell');

    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
  });

  it('es decorativo: el nombre lo pone quien lo usa', () => {
    expect(render('bell').getAttribute('aria-hidden')).toBe('true');
  });

  it('toma el tamaño de la escala de espaciado', () => {
    expect(render('bell').getAttribute('class')).toBe('size-espacio-5');
    expect(render('bell', 'espacio-4').getAttribute('class')).toBe('size-espacio-4');
  });
});
