import { createSvg } from './svg.js';

export function drawBeams(groups) {
  const beamsGroup = createSvg('g', { class: 'partitura-beams' });
  for (const group of groups) {
    const beamSlope = Number.isFinite(group.beamSlope) ? group.beamSlope : (group[0]?.stemUp ? -0.35 : 0.35);
    const maxLevels = group.reduce((max, point) => Math.max(max, point.beams), 0);
    for (let level = 0; level < maxLevels; level++) {
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        if (a.beams <= level || b.beams <= level) continue;
        const offset = a.stemUp ? level * 8 : -level * 8;
        beamsGroup.appendChild(createSvg('line', {
          x1: a.stemX,
          y1: a.stemEnd + offset,
          x2: b.stemX,
          y2: b.stemEnd + offset,
          class: 'partitura-beam'
        }));
      }
    }

    for (let i = 0; i < group.length; i++) {
      const point = group[i];
      const leftShared = i > 0 ? Math.min(point.beams, group[i - 1].beams) : 0;
      const rightShared = i < group.length - 1 ? Math.min(point.beams, group[i + 1].beams) : 0;
      const sharedLevels = Math.max(leftShared, rightShared);
      const partialDirection = i === 0 ? 1 : -1;
      for (let level = sharedLevels; level < point.beams; level++) {
        const offset = point.stemUp ? level * 8 : -level * 8;
        const startY = point.stemUp ? point.stemEnd + offset : point.stemEnd - offset;
        const partialLength = 18;
        const endX = point.stemX + (partialDirection * partialLength);
        const endY = startY + (beamSlope * partialDirection * partialLength);
        beamsGroup.appendChild(createSvg('line', {
          x1: point.stemX,
          y1: startY,
          x2: endX,
          y2: endY,
          class: 'partitura-flag'
        }));
      }
    }
  }
  return beamsGroup;
}
