const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const CLEF_PITCHES = {
  sol: {
    sharp: [
      { step: 'F', octave: 5 },
      { step: 'C', octave: 5 },
      { step: 'G', octave: 5 },
      { step: 'D', octave: 5 },
      { step: 'A', octave: 4 },
      { step: 'E', octave: 5 },
      { step: 'B', octave: 4 }
    ],
    flat: [
      { step: 'B', octave: 4 },
      { step: 'E', octave: 5 },
      { step: 'A', octave: 4 },
      { step: 'D', octave: 5 },
      { step: 'G', octave: 4 },
      { step: 'C', octave: 5 },
      { step: 'F', octave: 4 }
    ]
  },
  fa: {
    sharp: [
      { step: 'F', octave: 4 },
      { step: 'C', octave: 4 },
      { step: 'G', octave: 4 },
      { step: 'D', octave: 4 },
      { step: 'A', octave: 3 },
      { step: 'E', octave: 4 },
      { step: 'B', octave: 3 }
    ],
    flat: [
      { step: 'B', octave: 3 },
      { step: 'E', octave: 4 },
      { step: 'A', octave: 3 },
      { step: 'D', octave: 4 },
      { step: 'G', octave: 3 },
      { step: 'C', octave: 4 },
      { step: 'F', octave: 3 }
    ]
  },
  do: {
    sharp: [
      { step: 'F', octave: 4 },
      { step: 'C', octave: 4 },
      { step: 'G', octave: 4 },
      { step: 'D', octave: 4 },
      { step: 'A', octave: 3 },
      { step: 'E', octave: 4 },
      { step: 'B', octave: 3 }
    ],
    flat: [
      { step: 'B', octave: 3 },
      { step: 'E', octave: 4 },
      { step: 'A', octave: 3 },
      { step: 'D', octave: 4 },
      { step: 'G', octave: 3 },
      { step: 'C', octave: 4 },
      { step: 'F', octave: 3 }
    ]
  }
};

function normalizeFifths(fifths) {
  const numeric = Math.round(Number(fifths || 0));
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-7, Math.min(7, numeric));
}

export function keySignatureWidth(fifths, spacing = 10) {
  return Math.abs(normalizeFifths(fifths)) * Math.max(6, Number(spacing || 10));
}

export function keySignatureAccidentals(fifths, clef = 'sol') {
  const normalized = normalizeFifths(fifths);
  if (!normalized) return [];

  const direction = normalized > 0 ? 'sharp' : 'flat';
  const order = direction === 'sharp' ? SHARP_ORDER : FLAT_ORDER;
  const pitches = CLEF_PITCHES[clef] || CLEF_PITCHES.sol;
  const sign = direction === 'sharp' ? '♯' : '♭';

  return Array.from({ length: Math.abs(normalized) }, (_, index) => ({
    step: order[index],
    sign,
    pitch: {
      ...pitches[direction][index],
      alter: direction === 'sharp' ? 1 : -1
    }
  }));
}
