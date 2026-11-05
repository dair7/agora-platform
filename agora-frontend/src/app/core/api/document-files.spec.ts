import { MAX_UPLOAD_BYTES, fileNameFromDisposition, uploadProblem } from './document-files';

describe('uploadProblem', () => {
  it('acepta justo el tope', () => {
    expect(uploadProblem({ name: 'a.pdf', size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it('rechaza un byte de más', () => {
    expect(uploadProblem({ name: 'a.pdf', size: MAX_UPLOAD_BYTES + 1 })).toBe(
      'El archivo no puede superar 20 MB.',
    );
  });

  it('rechaza el archivo vacío', () => {
    expect(uploadProblem({ name: 'a.pdf', size: 0 })).toBe('El archivo está vacío.');
  });

  it('rechaza un nombre demasiado largo', () => {
    expect(uploadProblem({ name: 'a'.repeat(256), size: 1 })).toContain('255');
  });
});

describe('fileNameFromDisposition', () => {
  it('saca las tildes de filename*', () => {
    const header = `attachment; filename="protocolo de acci_n.pdf"; filename*=UTF-8''protocolo%20de%20acci%C3%B3n.pdf`;

    expect(fileNameFromDisposition(header)).toBe('protocolo de acción.pdf');
  });

  it('sin filename*, usa el nombre simple', () => {
    expect(fileNameFromDisposition('attachment; filename="informe.pdf"')).toBe('informe.pdf');
  });

  it('con filename* mal codificado, usa el nombre simple', () => {
    expect(fileNameFromDisposition(`attachment; filename="a.pdf"; filename*=UTF-8''%E0%A4%A`)).toBe(
      'a.pdf',
    );
  });

  it('sin cabecera no inventa un nombre', () => {
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(fileNameFromDisposition('attachment')).toBeNull();
  });
});
