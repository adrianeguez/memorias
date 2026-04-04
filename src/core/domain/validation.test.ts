import { describe, expect, it } from 'vitest';
import { validateMemoryInput } from './validation';

function createFile(name: string, type: string, sizeMb = 1): File {
  const blob = new Blob(['a'.repeat(sizeMb * 1024)], { type });
  return new File([blob], name, { type });
}

describe('validation', () => {
  it('acepta datos validos', () => {
    const result = validateMemoryInput({
      title: 'Paseo al parque',
      description: 'Fue una tarde tranquila y luminosa.',
      files: [createFile('foto.jpg', 'image/jpeg')],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rechaza mas de 5 archivos', () => {
    const files = Array.from({ length: 6 }, (_, index) =>
      createFile(`f${index}.jpg`, 'image/jpeg')
    );

    const result = validateMemoryInput({
      title: 'Titulo valido',
      description: 'Descripcion suficientemente larga.',
      files,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/hasta 5 archivos/);
  });

  it('rechaza tipos no permitidos', () => {
    const result = validateMemoryInput({
      title: 'Titulo valido',
      description: 'Descripcion suficientemente larga.',
      files: [createFile('doc.pdf', 'application/pdf')],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Tipo no permitido/);
  });
});
