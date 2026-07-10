export function accidentalText(alter) {
  if (alter === 1) return '♯';
  if (alter === -1) return '♭';
  return '';
}
