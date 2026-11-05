import { formatFileSize } from './file-size';

describe('formatFileSize', () => {
  it('escribe los bytes tal cual', () => {
    expect(formatFileSize(820)).toBe('820 B');
  });

  it('pasa a KB y a MB con coma decimal', () => {
    expect(formatFileSize(1536)).toBe('1,5 KB');
    expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3,5 MB');
  });

  it('el tope se lee como 20 MB', () => {
    expect(formatFileSize(20 * 1024 * 1024)).toBe('20 MB');
  });
});
