export interface MemoryInput {
  title: string;
  description: string;
  files: File[];
}

export interface MemoryValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMemoryInput({ title, description, files }: MemoryInput): MemoryValidationResult {
  const errors: string[] = [];

  if (!title || title.trim().length < 3) {
    errors.push('El titulo debe tener al menos 3 caracteres.');
  }

  if (!description || description.trim().length < 10) {
    errors.push('La descripcion debe tener al menos 10 caracteres.');
  }

  if (files.length > 5) {
    errors.push('Solo se permiten hasta 5 archivos por recuerdo.');
  }

  for (const file of files) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      errors.push(`Tipo no permitido: ${file.name}`);
    }

    if (file.size > 500 * 1024 * 1024) {
      errors.push(`Archivo demasiado grande (max 500MB): ${file.name}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
