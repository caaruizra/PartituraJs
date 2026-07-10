export function durationType(duration) {
  if (duration >= 4) return 'whole';
  if (duration >= 2) return 'half';
  if (duration >= 1) return 'quarter';
  if (duration >= 0.5) return 'eighth';
  if (duration >= 0.25) return '16th';
  if (duration >= 0.125) return '32nd';
  return '64th';
}

export function durationFlagCount(duration) {
  if (duration >= 1) return 0;
  if (duration >= 0.5) return 1;
  if (duration >= 0.25) return 2;
  if (duration >= 0.125) return 3;
  return 4;
}

export function isDottedDuration(duration) {
  const epsilon = 1e-6;
  const baseDurations = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625];
  return baseDurations.some((base) => Math.abs(duration - (base * 1.5)) <= epsilon);
}

export function toggleDottedDuration(duration) {
  return isDottedDuration(duration) ? (duration / 1.5) : (duration * 1.5);
}

export function restGlyph(duration) {
  if (duration >= 4) return '𝄻';
  if (duration >= 2) return '𝄼';
  if (duration >= 1) return '𝄽';
  if (duration >= 0.5) return '𝄾';
  if (duration >= 0.25) return '𝄿';
  if (duration >= 0.125) return '𝅀';
  return '𝅁';
}
