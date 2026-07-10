export function normalizeClef(clef) {
  const value = String(clef || '').toLowerCase();
  if (value === 'fa' || value === 'f' || value === 'bass') return 'fa';
  if (value === 'do' || value === 'c' || value === 'alto' || value === 'tenor') return 'do';
  return 'sol';
}

export function clefConfig(clef) {
  const normalized = normalizeClef(clef);
  if (normalized === 'fa') {
    return {
      key: 'fa',
      glyph: '𝄢',
      xmlSign: 'F',
      xmlLine: 4,
      reference: { step: 'G', octave: 2 }
    };
  }
  if (normalized === 'do') {
    return {
      key: 'do',
      glyph: '𝄡',
      xmlSign: 'C',
      xmlLine: 3,
      reference: { step: 'F', octave: 3 }
    };
  }
  return {
    key: 'sol',
    glyph: '𝄞',
    xmlSign: 'G',
    xmlLine: 2,
    reference: { step: 'E', octave: 4 }
  };
}
