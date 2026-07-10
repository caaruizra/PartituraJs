import { clefConfig } from '../music/clef.js';
import { createSvg } from './svg.js';

export function drawScore(editor) {
  editor.svg.innerHTML = '';
  const s = editor.options;
  const score = editor.model.score;
  const left = s.staffLeft;
  editor.measureLayout = editor.buildMeasureLayout();
  const measureValidation = editor.model.measureValidation();
  const systems = editor.measureLayout.systems || [];
  const staffRight = editor.measureLayout.staffRight;
  const canvasWidth = Math.max(editor.canvas?.clientWidth || editor.options.width, staffRight + 40);
  const lastSystem = systems.at(-1) || { staffTop: s.staffTop };
  const height = lastSystem.staffTop + s.staffHeight + 50;
  const width = canvasWidth;
  editor.svg.setAttribute('width', width);
  editor.svg.setAttribute('height', height);
  editor.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const titleNode = createSvg('text', {
    x: left,
    y: 26,
    class: 'partitura-title'
  }, score.title || '');
  titleNode.addEventListener('dblclick', () => editor.editTitle());
  editor.svg.appendChild(titleNode);

  if (score.composer) {
    editor.svg.appendChild(createSvg('text', {
      x: staffRight,
      y: 26,
      class: 'partitura-composer',
      'text-anchor': 'end'
    }, score.composer));
  }

  for (const system of systems) {
    const top = system.staffTop;
    const bottomLine = editor.bottomLineY(top);
    const systemMeasures = system.measureIndices;
    const beamLayout = editor.buildBeamLayout(top, systemMeasures);
    const systemStart = systemMeasures[0];
    const systemEnd = systemMeasures[systemMeasures.length - 1];
    const systemRight = editor.measureLayout.starts[systemEnd] + editor.measureLayout.widths[systemEnd];

    if (editor.selectedMeasure !== null && systemMeasures.includes(editor.selectedMeasure)) {
      editor.svg.appendChild(createSvg('rect', {
        x: editor.measureLayout.starts[editor.selectedMeasure] + 1,
        y: top - 4,
        width: editor.measureLayout.widths[editor.selectedMeasure] - 2,
        height: 4 * s.staffSpacing + 8,
        class: 'partitura-measure-selected'
      }));
    }

    for (const measure of systemMeasures) {
      if (!measureValidation[measure]?.invalid) continue;
      editor.svg.appendChild(createSvg('rect', {
        x: editor.measureLayout.starts[measure] + 1,
        y: top - 4,
        width: editor.measureLayout.widths[measure] - 2,
        height: 4 * s.staffSpacing + 8,
        class: 'partitura-measure-invalid'
      }));
    }

    for (let line = 0; line < 5; line++) {
      editor.svg.appendChild(createSvg('line', {
        x1: left,
        y1: top + line * s.staffSpacing,
        x2: systemRight,
        y2: top + line * s.staffSpacing,
        class: 'partitura-staff-line'
      }));
    }

    for (const measure of systemMeasures) {
      editor.svg.appendChild(createSvg('line', {
        x1: editor.measureLayout.starts[measure],
        y1: top,
        x2: editor.measureLayout.starts[measure],
        y2: top + 4 * s.staffSpacing,
        class: 'partitura-bar-line'
      }));
    }
    editor.svg.appendChild(createSvg('line', {
      x1: systemRight,
      y1: top,
      x2: systemRight,
      y2: top + 4 * s.staffSpacing,
      class: 'partitura-bar-line'
    }));

    editor.svg.appendChild(createSvg('text', {
      x: editor.measureLayout.starts[systemStart] + 55,
      y: top + 48,
      'text-anchor': 'middle',
      class: 'partitura-clef'
    }, clefConfig(score.clef).glyph));

    editor.svg.appendChild(createSvg('text', {
      x: editor.measureLayout.starts[systemStart] + 48,
      y: top + 25,
      class: 'partitura-time'
    }, String(score.timeSignature.beats)));
    editor.svg.appendChild(createSvg('text', {
      x: editor.measureLayout.starts[systemStart] + 48,
      y: top + 44,
      class: 'partitura-time'
    }, String(score.timeSignature.beatType)));

    const beatGuideGroup = createSvg('g', { class: 'partitura-beat-guides' });
    for (const measure of systemMeasures) {
      for (let b = 1; b < score.timeSignature.beats; b++) {
        const x = editor.beatToX(measure, b);
        beatGuideGroup.appendChild(createSvg('line', {
          x1: x,
          y1: top - 6,
          x2: x,
          y2: top + 4 * s.staffSpacing + 6,
          class: 'partitura-beat-guide'
        }));
      }
    }
    editor.svg.appendChild(beatGuideGroup);

    const hit = createSvg('rect', {
      x: left,
      y: top - 28,
      width: systemRight - left,
      height: s.staffHeight,
      fill: 'transparent',
      class: 'partitura-hit-area'
    });
    hit.addEventListener('pointerdown', (event) => editor.onCanvasPointerDown(event));
    hit.addEventListener('contextmenu', (event) => editor.onCanvasContextMenu(event));
    hit.addEventListener('dragover', (event) => {
      event.preventDefault();
    });
    hit.addEventListener('drop', (event) => editor.onCanvasDrop(event));
    editor.svg.appendChild(hit);

    const notesGroup = createSvg('g', { class: 'partitura-notes' });
    for (const measure of systemMeasures) {
      for (const note of score.notes) {
        if (note.measure !== measure) continue;
        notesGroup.appendChild(editor.drawNote(note, bottomLine, beamLayout.noteBeamInfo, top));
      }
    }
    notesGroup.appendChild(editor.drawBeams(beamLayout.groups));
    editor.svg.appendChild(notesGroup);
  }

  if (editor.selectionBox) {
    editor.svg.appendChild(createSvg('rect', {
      x: editor.selectionBox.x,
      y: editor.selectionBox.y,
      width: editor.selectionBox.width,
      height: editor.selectionBox.height,
      class: 'partitura-marquee-selection'
    }));
  }

  if (editor.playback) editor.updatePlaybackCursor();
}
