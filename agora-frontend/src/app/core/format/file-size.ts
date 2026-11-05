const number = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** «820 B», «14,2 KB», «3,5 MB». Con 1024, la misma cuenta que el tope de subida. */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  return kilobytes < 1024
    ? `${number.format(kilobytes)} KB`
    : `${number.format(kilobytes / 1024)} MB`;
};
