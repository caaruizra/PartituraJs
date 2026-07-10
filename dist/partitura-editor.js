/*
 * PartituraJS - editor básico de partituras en SVG para navegador.
 * Sin dependencias. Licencia MIT.
 */
(function (global) {
  'use strict';

  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const STEP_TO_INDEX = Object.fromEntries(STEPS.map((s, i) => [s, i]));
  const MEASURE_EPSILON = 1e-6;

  function uid(prefix = 'n') {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function roundToGrid(value, grid) {
    return Math.round(value / grid) * grid;
  }

  function clone(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function normalizeClef(clef) {
    const value = String(clef || '').toLowerCase();
    if (value === 'fa' || value === 'f' || value === 'bass') return 'fa';
    if (value === 'do' || value === 'c' || value === 'alto' || value === 'tenor') return 'do';
    return 'sol';
  }

  function clefConfig(clef) {
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

  function pitchToDiatonicIndex(pitch) {
    const step = pitch.step || 'C';
    const octave = Number.isFinite(pitch.octave) ? pitch.octave : 4;
    return octave * 7 + (STEP_TO_INDEX[step] ?? 0);
  }

  function diatonicIndexToPitch(index) {
    const normalized = ((index % 7) + 7) % 7;
    const octave = Math.floor(index / 7);
    return { step: STEPS[normalized], octave, alter: 0 };
  }

  function pitchToMidi(pitch) {
    const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    return (pitch.octave + 1) * 12 + semis[pitch.step] + (pitch.alter || 0);
  }

  function midiToPitch(midi) {
    const names = [
      ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
      ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]
    ];
    const octave = Math.floor(midi / 12) - 1;
    const [step, alter] = names[((midi % 12) + 12) % 12];
    return { step, octave, alter };
  }

  function normalizeScore(score = {}) {
    const measures = Math.max(1, Number(score.measures || 4));
    const timeSignature = score.timeSignature || { beats: 4, beatType: 4 };
    return {
      title: score.title || 'Sin título',
      composer: score.composer || '',
      clef: normalizeClef(score.clef),
      key: score.key || { fifths: 0 },
      tempo: Number(score.tempo || 90),
      measures,
      timeSignature: {
        beats: Number(timeSignature.beats || 4),
        beatType: Number(timeSignature.beatType || 4)
      },
      notes: Array.isArray(score.notes) ? score.notes.map((note) => ({
        id: note.id || uid(),
        measure: Number(note.measure || 0),
        beat: Number(note.beat || 0),
        duration: Number(note.duration || 1),
        pitch: note.pitch ? {
          step: note.pitch.step || 'C',
          octave: Number.isFinite(note.pitch.octave) ? note.pitch.octave : 4,
          alter: Number(note.pitch.alter || 0)
        } : null,
        lyric: note.lyric || '',
        velocity: Number(note.velocity || 80)
      })) : []
    };
  }

  class ScoreModel {
    constructor(score) {
      this.score = normalizeScore(score);
      this.normalizeAllMeasureBeats();
    }

    measureNotes(measure) {
      return this.score.notes
        .filter((note) => note.measure === measure)
        .sort((a, b) => (a.beat - b.beat) || (pitchToMidi(a.pitch) - pitchToMidi(b.pitch)));
    }

    normalizeMeasureBeats(measure) {
      const notes = this.measureNotes(measure);
      const maxBeat = this.score.timeSignature.beats - 0.25;
      let cursor = 0;
      for (const note of notes) {
        note.beat = clamp(cursor, 0, maxBeat);
        cursor += note.duration;
      }
    }

    normalizeAllMeasureBeats() {
      for (let measure = 0; measure < this.score.measures; measure++) {
        this.normalizeMeasureBeats(measure);
      }
      this.sort();
    }

    measureTotal(measure, excludeId = null) {
      return this.score.notes
        .filter((note) => note.measure === measure && note.id !== excludeId)
        .reduce((sum, note) => sum + note.duration, 0);
    }

    canFitInMeasure(measure, duration, excludeId = null) {
      const beats = this.score.timeSignature.beats;
      const total = this.measureTotal(measure, excludeId);
      return total + duration <= beats + MEASURE_EPSILON;
    }

    measureValidation() {
      const beats = this.score.timeSignature.beats;
      return Array.from({ length: this.score.measures }, (_, measure) => {
        const total = this.measureTotal(measure);
        const exceeds = total > beats + MEASURE_EPSILON;
        const complete = Math.abs(total - beats) <= MEASURE_EPSILON;
        return {
          measure,
          total,
          exceeds,
          complete,
          invalid: !complete
        };
      });
    }

    shiftNotesOnInsert(measure, fromBeat, delta) {
      if (delta <= 0) return;
      const maxBeat = this.score.timeSignature.beats - 0.25;
      const notesInMeasure = this.score.notes
        .filter((note) => note.measure === measure && note.beat >= fromBeat)
        .sort((a, b) => b.beat - a.beat);
      for (const note of notesInMeasure) {
        note.beat = clamp(note.beat + delta, 0, maxBeat);
      }
    }

    addNote(note) {
      const next = {
        id: note.id || uid(),
        measure: clamp(Number(note.measure || 0), 0, this.score.measures - 1),
        beat: Math.max(0, Number(note.beat || 0)),
        duration: Math.max(0.0625, Number(note.duration || 1)),
        pitch: note.pitch ? {
          step: note.pitch.step || 'C',
          octave: Number.isFinite(note.pitch.octave) ? note.pitch.octave : 4,
          alter: Number(note.pitch.alter || 0)
        } : { step: 'C', octave: 4, alter: 0 },
        lyric: note.lyric || '',
        velocity: Number(note.velocity || 80)
      };
      next.beat = clamp(next.beat, 0, this.score.timeSignature.beats - 0.25);
      if (!this.canFitInMeasure(next.measure, next.duration)) return null;
      this.shiftNotesOnInsert(next.measure, next.beat, next.duration);
      this.score.notes.push(next);
      this.normalizeMeasureBeats(next.measure);
      this.sort();
      return next;
    }

    updateNote(id, patch) {
      const note = this.getNote(id);
      if (!note) return null;
      const previousMeasure = note.measure;
      const nextMeasure = clamp(
        Number(Object.prototype.hasOwnProperty.call(patch, 'measure') ? patch.measure : note.measure),
        0,
        this.score.measures - 1
      );
      const nextBeat = clamp(
        Number(Object.prototype.hasOwnProperty.call(patch, 'beat') ? patch.beat : note.beat),
        0,
        this.score.timeSignature.beats - 0.25
      );
      const nextDuration = Math.max(
        0.0625,
        Number(Object.prototype.hasOwnProperty.call(patch, 'duration') ? patch.duration : note.duration || 1)
      );
      if (!this.canFitInMeasure(nextMeasure, nextDuration, id)) return null;

      Object.assign(note, patch);
      if (patch.pitch) note.pitch = { ...note.pitch, ...patch.pitch };
      note.measure = nextMeasure;
      note.beat = nextBeat;
      note.duration = nextDuration;
      this.normalizeMeasureBeats(nextMeasure);
      if (previousMeasure !== nextMeasure) this.normalizeMeasureBeats(previousMeasure);
      this.sort();
      return note;
    }

    removeNote(id) {
      const note = this.getNote(id);
      if (!note) return false;
      const measure = note.measure;
      const before = this.score.notes.length;
      this.score.notes = this.score.notes.filter((note) => note.id !== id);
      if (this.score.notes.length !== before) {
        this.normalizeMeasureBeats(measure);
        return true;
      }
      return false;
    }

    removeNotes(ids) {
      const measures = new Set(
        this.score.notes
          .filter((note) => ids.includes(note.id))
          .map((note) => note.measure)
      );
      const set = new Set(ids);
      this.score.notes = this.score.notes.filter((note) => !set.has(note.id));
      for (const measure of measures) this.normalizeMeasureBeats(measure);
    }

    getNote(id) {
      return this.score.notes.find((note) => note.id === id) || null;
    }

    setScore(score) {
      this.score = normalizeScore(score);
      this.normalizeAllMeasureBeats();
    }

    setClef(clef) {
      this.score.clef = normalizeClef(clef);
      return this.score.clef;
    }

    insertMeasure(index) {
      const insertAt = clamp(Number(index || 0), 0, this.score.measures);
      for (const note of this.score.notes) {
        if (note.measure >= insertAt) note.measure += 1;
      }
      this.score.measures += 1;
      this.sort();
      return insertAt;
    }

    removeMeasure(index) {
      if (this.score.measures <= 1) return false;
      const removeAt = clamp(Number(index || 0), 0, this.score.measures - 1);
      this.score.notes = this.score.notes.filter((note) => note.measure !== removeAt);
      for (const note of this.score.notes) {
        if (note.measure > removeAt) note.measure -= 1;
      }
      this.score.measures -= 1;
      this.normalizeAllMeasureBeats();
      return true;
    }

    toJSON() {
      return clone(this.score);
    }

    sort() {
      this.score.notes.sort((a, b) => (a.measure - b.measure) || (a.beat - b.beat) || (pitchToMidi(a.pitch) - pitchToMidi(b.pitch)));
    }
  }

  function durationType(duration) {
    if (duration >= 4) return 'whole';
    if (duration >= 2) return 'half';
    if (duration >= 1) return 'quarter';
    if (duration >= 0.5) return 'eighth';
    if (duration >= 0.25) return '16th';
    if (duration >= 0.125) return '32nd';
    return '64th';
  }

  function durationFlagCount(duration) {
    if (duration >= 1) return 0;
    if (duration >= 0.5) return 1;
    if (duration >= 0.25) return 2;
    if (duration >= 0.125) return 3;
    return 4;
  }

  function isDottedDuration(duration) {
    const epsilon = 1e-6;
    const baseDurations = [4, 2, 1, 0.5, 0.25, 0.125, 0.0625];
    return baseDurations.some((base) => Math.abs(duration - (base * 1.5)) <= epsilon);
  }

  function toggleDottedDuration(duration) {
    return isDottedDuration(duration) ? (duration / 1.5) : (duration * 1.5);
  }

  function clampSlope(value, maxAbs) {
    return clamp(value, -Math.abs(maxAbs), Math.abs(maxAbs));
  }

  function accidentalText(alter) {
    if (alter === 1) return '♯';
    if (alter === -1) return '♭';
    return '';
  }

  function exportMusicXML(scoreInput) {
    const score = normalizeScore(scoreInput);
    const divisions = 4;
    const escapeXml = (text = '') => String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');

    const notesByMeasure = Array.from({ length: score.measures }, () => []);
    for (const note of score.notes) {
      if (note.measure >= 0 && note.measure < score.measures) notesByMeasure[note.measure].push(note);
    }

    const xmlMeasures = notesByMeasure.map((notes, measureIndex) => {
      const clef = clefConfig(score.clef);
      const attributes = measureIndex === 0 ? `
      <attributes>
        <divisions>${divisions}</divisions>
        <key><fifths>${score.key.fifths || 0}</fifths></key>
        <time><beats>${score.timeSignature.beats}</beats><beat-type>${score.timeSignature.beatType}</beat-type></time>
        <clef><sign>${clef.xmlSign}</sign><line>${clef.xmlLine}</line></clef>
      </attributes>` : '';

      const xmlNotes = notes.map((note) => {
        const dur = Math.max(1, Math.round(note.duration * divisions));
        const type = durationType(note.duration);
        const pitch = note.pitch;
        const alter = pitch.alter ? `<alter>${pitch.alter}</alter>` : '';
        const lyric = note.lyric ? `<lyric><text>${escapeXml(note.lyric)}</text></lyric>` : '';
        return `
      <note>
        <pitch><step>${pitch.step}</step>${alter}<octave>${pitch.octave}</octave></pitch>
        <duration>${dur}</duration>
        <type>${type}</type>${lyric}
      </note>`;
      }).join('');

      return `
    <measure number="${measureIndex + 1}">${attributes}${xmlNotes}
    </measure>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>${escapeXml(score.title)}</work-title></work>
  <identification><creator type="composer">${escapeXml(score.composer)}</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">${xmlMeasures}
  </part>
</score-partwise>`;
  }

  class ScoreEditor {
    constructor(container, options = {}) {
      const element = typeof container === 'string' ? document.querySelector(container) : container;
      if (!element) throw new Error('ScoreEditor necesita un contenedor válido.');

      this.container = element;
      this.options = {
        width: options.width || 960,
        staffHeight: options.staffHeight || 150,
        staffSpacing: options.staffSpacing || 12,
        measureWidth: options.measureWidth || 180,
        staffLeft: options.staffLeft || 58,
        staffTop: options.staffTop || 60,
        noteDuration: options.noteDuration || 1,
        snap: options.snap || 0.25,
        mode: options.mode || 'write',
        readonly: !!options.readonly,
        showToolbar: options.showToolbar !== false,
        onChange: options.onChange || null,
        onSelect: options.onSelect || null,
        onPlayNote: options.onPlayNote || null
      };
      this.model = new ScoreModel(options.score || {
        title: options.title,
        measures: options.measures || 4,
        timeSignature: options.timeSignature || { beats: 4, beatType: 4 },
        notes: options.notes || []
      });
      this.selectedIds = new Set();
      this.selectedMeasure = null;
      this.undoStack = [];
      this.redoStack = [];
      this.drag = null;
      this.selectionBox = null;
      this.canvas = null;
      this.measureLayout = null;
      this.audioContext = null;
      this.playback = null;
      this.playbackFrame = null;
      this.playbackNodes = [];
      this.playbackLine = null;
      this.playbackLineBase = null;
      this.contextMenuMeasure = null;
      this.contextMenuNote = null;
      this.contextMenu = null;
      this.boundHideContextMenu = (event) => {
        if (!this.contextMenu || this.contextMenu.hidden) return;
        if (event.target.closest('.partitura-context-menu')) return;
        this.hideContextMenu();
      };
      document.addEventListener('pointerdown', this.boundHideContextMenu);
      this.render();
      this.pushHistory();
    }

    render() {
      this.container.innerHTML = '';
      this.container.classList.add('partitura-editor');
      this.container.tabIndex = 0;

      this.renderMeasureToolbar();

      const layout = document.createElement('div');
      layout.className = 'partitura-layout';
      this.container.appendChild(layout);

      if (this.options.showToolbar) this.renderToolbar(layout);

      const canvas = document.createElement('div');
      canvas.className = 'partitura-canvas';
      layout.appendChild(canvas);

      this.renderContextMenu();

      const height = this.options.staffTop + this.options.staffHeight + 50;
      const width = Math.max(this.options.width, this.options.staffLeft + this.model.score.measures * this.options.measureWidth + 40);
      this.svg = createSvg('svg', { class: 'partitura-svg', width, height, viewBox: `0 0 ${width} ${height}` });
      canvas.appendChild(this.svg);
      this.canvas = canvas;
      this.drawScore();
      this.bindKeyboard();
    }

    renderContextMenu() {
      const menu = document.createElement('div');
      menu.className = 'partitura-context-menu';
      menu.hidden = true;
      menu.innerHTML = `
        <div class="partitura-context-menu-group" data-context-group="measure">
          <button type="button" data-action="measure-insert-before">Agregar compás antes</button>
          <button type="button" data-action="measure-insert-after">Agregar compás después</button>
          <button type="button" data-action="measure-delete">Eliminar compás</button>
        </div>
        <div class="partitura-context-menu-divider"></div>
        <div class="partitura-context-menu-group" data-context-group="note">
          <button type="button" data-action="note-delete">Eliminar nota</button>
          <button type="button" data-action="note-toggle-dot">Agregar puntillo</button>
        </div>
      `;
      menu.addEventListener('click', (event) => {
        const action = event.target.closest('button')?.dataset.action;
        if (!action) return;
        if (action.startsWith('measure-') && this.contextMenuMeasure === null) return;
        if (action === 'measure-insert-before') this.insertMeasureAt(this.contextMenuMeasure);
        if (action === 'measure-insert-after') this.insertMeasureAt(this.contextMenuMeasure + 1);
        if (action === 'measure-delete') this.removeMeasureAt(this.contextMenuMeasure);
        if (action === 'note-delete' && this.contextMenuNote) {
          this.pushHistory();
          const removed = this.model.removeNote(this.contextMenuNote);
          if (removed) {
            this.selectedIds.delete(this.contextMenuNote);
            this.emitChange();
            this.drawScore();
          } else {
            this.undoStack.pop();
          }
        }
        if (action === 'note-toggle-dot' && this.contextMenuNote) {
          const note = this.model.getNote(this.contextMenuNote);
          if (!note) {
            this.hideContextMenu();
            return;
          }
          this.pushHistory();
          const updated = this.model.updateNote(note.id, { duration: toggleDottedDuration(note.duration) });
          if (updated) {
            this.emitChange();
            this.updateToolbar();
            this.updateMeasureToolbar();
            this.drawScore();
          } else {
            this.undoStack.pop();
          }
        }
        this.hideContextMenu();
      });
      this.container.appendChild(menu);
      this.contextMenu = menu;
    }

    showContextMenu(measure, event) {
      if (!this.contextMenu) return;
      this.contextMenuNote = null;
      this.contextMenuMeasure = clamp(Number(measure), 0, this.model.score.measures - 1);
      this.setSelectedMeasure(this.contextMenuMeasure);
      const measureGroup = this.contextMenu.querySelector('[data-context-group="measure"]');
      const noteGroup = this.contextMenu.querySelector('[data-context-group="note"]');
      if (measureGroup) measureGroup.hidden = false;
      if (noteGroup) noteGroup.hidden = true;
      const deleteButton = this.contextMenu.querySelector('[data-action="measure-delete"]');
      if (deleteButton) deleteButton.disabled = this.model.score.measures <= 1;

      this.contextMenu.hidden = false;
      const containerRect = this.container.getBoundingClientRect();
      const left = event.clientX - containerRect.left;
      const top = event.clientY - containerRect.top;
      this.contextMenu.style.left = `${left}px`;
      this.contextMenu.style.top = `${top}px`;

      requestAnimationFrame(() => {
        if (!this.contextMenu || this.contextMenu.hidden) return;
        const menuRect = this.contextMenu.getBoundingClientRect();
        const maxLeft = this.container.clientWidth - menuRect.width - 8;
        const maxTop = this.container.clientHeight - menuRect.height - 8;
        const clampedLeft = clamp(left, 8, Math.max(8, maxLeft));
        const clampedTop = clamp(top, 8, Math.max(8, maxTop));
        this.contextMenu.style.left = `${clampedLeft}px`;
        this.contextMenu.style.top = `${clampedTop}px`;
      });
    }

    showNoteContextMenu(noteId, event) {
      if (!this.contextMenu) return;
      const note = this.model.getNote(noteId);
      if (!note) return;
      this.contextMenuMeasure = note.measure;
      this.contextMenuNote = noteId;
      this.selectedIds.clear();
      this.selectedIds.add(noteId);
      this.setSelectedMeasure(note.measure);
      this.emitSelect();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
      const measureGroup = this.contextMenu.querySelector('[data-context-group="measure"]');
      const noteGroup = this.contextMenu.querySelector('[data-context-group="note"]');
      if (measureGroup) measureGroup.hidden = false;
      if (noteGroup) noteGroup.hidden = false;
      const noteDotButton = this.contextMenu.querySelector('[data-action="note-toggle-dot"]');
      if (noteDotButton) {
        noteDotButton.hidden = false;
        noteDotButton.textContent = isDottedDuration(note.duration) ? 'Quitar puntillo' : 'Agregar puntillo';
      }

      this.contextMenu.hidden = false;
      const containerRect = this.container.getBoundingClientRect();
      const left = event.clientX - containerRect.left;
      const top = event.clientY - containerRect.top;
      this.contextMenu.style.left = `${left}px`;
      this.contextMenu.style.top = `${top}px`;

      requestAnimationFrame(() => {
        if (!this.contextMenu || this.contextMenu.hidden) return;
        const menuRect = this.contextMenu.getBoundingClientRect();
        const maxLeft = this.container.clientWidth - menuRect.width - 8;
        const maxTop = this.container.clientHeight - menuRect.height - 8;
        const clampedLeft = clamp(left, 8, Math.max(8, maxLeft));
        const clampedTop = clamp(top, 8, Math.max(8, maxTop));
        this.contextMenu.style.left = `${clampedLeft}px`;
        this.contextMenu.style.top = `${clampedTop}px`;
      });
    }

    hideContextMenu() {
      if (!this.contextMenu) return;
      this.contextMenu.hidden = true;
      this.contextMenuMeasure = null;
      this.contextMenuNote = null;
    }

    renderMeasureToolbar() {
      const toolbar = document.createElement('div');
      toolbar.className = 'partitura-measure-toolbar';
      toolbar.innerHTML = `
        <div class="partitura-measure-toolbar-group">
          <button type="button" data-action="mode-write" title="Agregar notas">✎ Insertar</button>
          <button type="button" data-action="mode-select" title="Seleccionar y mover">↖ Seleccionar</button>
          <button type="button" data-action="delete" title="Borrar selección">Borrar</button>
          <button type="button" data-action="undo" title="Deshacer">↶ Deshacer</button>
          <button type="button" data-action="redo" title="Rehacer">↷ Rehacer</button>
          <button type="button" data-action="play" title="Reproducir">▶ Reproducir</button>
          <button type="button" data-action="stop" title="Detener" hidden>■ Detener</button>
        </div>
      `;
      toolbar.addEventListener('click', (event) => {
        const action = event.target.closest('button')?.dataset.action;
        if (!action) return;
        if (action === 'mode-write') this.setMode('write');
        if (action === 'mode-select') this.setMode('select');
        if (action === 'delete') this.removeSelected();
        if (action === 'undo') this.undo();
        if (action === 'redo') this.redo();
        if (action === 'play') this.play();
        if (action === 'stop') this.stopPlayback();
        this.container.focus();
      });
      this.container.appendChild(toolbar);
      this.measureToolbar = toolbar;
      this.updateMeasureToolbar();
    }

    renderToolbar(layout) {
      const toolbar = document.createElement('div');
      toolbar.className = 'partitura-toolbar';
      toolbar.innerHTML = `
        <div class="partitura-toolbar-group partitura-toolbar-durations" aria-label="Duración de nota">
          <button type="button" data-action="duration-4" title="Redonda" aria-label="Redonda"><span class="partitura-music-glyph">𝅝</span></button>
          <button type="button" data-action="duration-2" title="Blanca" aria-label="Blanca"><span class="partitura-music-glyph">𝅗𝅥</span></button>
          <button type="button" data-action="duration-1" title="Negra" aria-label="Negra"><span class="partitura-music-glyph">𝅘𝅥</span></button>
          <button type="button" data-action="duration-0.5" title="Corchea" aria-label="Corchea"><span class="partitura-music-glyph">𝅘𝅥𝅮</span></button>
          <button type="button" data-action="duration-0.25" title="Semicorchea" aria-label="Semicorchea"><span class="partitura-music-glyph">𝅘𝅥𝅯</span></button>
          <button type="button" data-action="duration-0.125" title="Fusa" aria-label="Fusa"><span class="partitura-music-glyph">𝅘𝅥𝅰</span></button>
          <button type="button" data-action="duration-0.0625" title="Semifusa" aria-label="Semifusa"><span class="partitura-music-glyph">𝅘𝅥𝅱</span></button>
        </div>
        <div class="partitura-toolbar-footer" aria-label="Otras opciones">
          <div class="partitura-toolbar-group partitura-toolbar-clefs" aria-label="Clave">
            <button type="button" data-action="clef-sol" data-clef="sol" draggable="true" title="Clave de Sol" aria-label="Clave de Sol"><span class="partitura-music-glyph">𝄞</span><span>Sol</span></button>
            <button type="button" data-action="clef-fa" data-clef="fa" draggable="true" title="Clave de Fa" aria-label="Clave de Fa"><span class="partitura-music-glyph">𝄢</span><span>Fa</span></button>
            <button type="button" data-action="clef-do" data-clef="do" draggable="true" title="Clave de Do" aria-label="Clave de Do"><span class="partitura-music-glyph">𝄡</span><span>Do</span></button>
          </div>
        </div>
      `;
      toolbar.addEventListener('click', (event) => {
        const action = event.target.closest('button')?.dataset.action;
        if (!action) return;
        if (action.startsWith('duration-')) this.options.noteDuration = Number(action.replace('duration-', ''));
        if (action.startsWith('clef-')) this.setClef(event.target.closest('button')?.dataset.clef);
        if (action === 'play') this.play();
        this.container.focus();
      });
      toolbar.addEventListener('dragstart', (event) => {
        const button = event.target.closest('button[data-clef]');
        if (!button || !event.dataTransfer) return;
        event.dataTransfer.setData('text/plain', button.dataset.clef || '');
        event.dataTransfer.effectAllowed = 'copy';
      });
      layout.appendChild(toolbar);
      this.toolbar = toolbar;
      this.updateToolbar();
    }

    updateToolbar() {
      if (!this.toolbar) return;
      for (const button of this.toolbar.querySelectorAll('button')) button.classList.remove('is-active');
      const mode = this.toolbar.querySelector(`[data-action="mode-${this.options.mode}"]`);
      if (mode) mode.classList.add('is-active');
      const selectedNote = this.selectedIds.size === 1
        ? this.model.getNote([...this.selectedIds][0])
        : null;
      const activeDuration = selectedNote?.duration ?? this.options.noteDuration;
      const dur = this.toolbar.querySelector(`[data-action="duration-${activeDuration}"]`);
      if (dur) dur.classList.add('is-active');
      const clef = this.toolbar.querySelector(`[data-action="clef-${this.model.score.clef}"]`);
      if (clef) clef.classList.add('is-active');
    }

    updateMeasureToolbar() {
      if (!this.measureToolbar) return;
      const needsSelection = this.selectedMeasure === null;
      const hasNoteSelection = this.selectedIds.size === 0;
      const undoButton = this.measureToolbar.querySelector('[data-action="undo"]');
      const redoButton = this.measureToolbar.querySelector('[data-action="redo"]');
      const deleteButton = this.measureToolbar.querySelector('[data-action="delete"]');
      const playButton = this.measureToolbar.querySelector('[data-action="play"]');
      const stopButton = this.measureToolbar.querySelector('[data-action="stop"]');
      if (undoButton) undoButton.disabled = this.undoStack.length <= 1;
      if (redoButton) redoButton.disabled = this.redoStack.length === 0;
      if (deleteButton) deleteButton.disabled = hasNoteSelection;
      if (playButton) playButton.hidden = !!this.playback;
      if (stopButton) stopButton.hidden = !this.playback;
      const before = this.measureToolbar.querySelector('[data-action="measure-before-selected"]');
      const after = this.measureToolbar.querySelector('[data-action="measure-after-selected"]');
      if (before) before.disabled = needsSelection;
      if (after) after.disabled = needsSelection;
    }

    setSelectedMeasure(measure) {
      if (measure === null || measure === undefined) {
        this.selectedMeasure = null;
      } else {
        this.selectedMeasure = clamp(Number(measure), 0, this.model.score.measures - 1);
      }
      this.updateMeasureToolbar();
    }

    insertMeasureAt(index) {
      this.pushHistory();
      const insertedAt = this.model.insertMeasure(index);
      if (this.selectedMeasure !== null && this.selectedMeasure >= insertedAt) this.selectedMeasure += 1;
      this.setSelectedMeasure(insertedAt);
      this.emitChange();
      this.drawScore();
    }

    removeMeasureAt(index) {
      this.pushHistory();
      const removed = this.model.removeMeasure(index);
      if (!removed) {
        this.undoStack.pop();
        return;
      }
      if (this.selectedMeasure !== null) {
        if (this.selectedMeasure > index) this.selectedMeasure -= 1;
        if (this.selectedMeasure >= this.model.score.measures) this.selectedMeasure = this.model.score.measures - 1;
      }
      this.setSelectedMeasure(this.selectedMeasure);
      this.emitChange();
      this.drawScore();
    }

    drawScore() {
      this.svg.innerHTML = '';
      const s = this.options;
      const score = this.model.score;
      const left = s.staffLeft;
      this.measureLayout = this.buildMeasureLayout();
      const measureValidation = this.model.measureValidation();
      const systems = this.measureLayout.systems || [];
      const staffRight = this.measureLayout.staffRight;
      const canvasWidth = Math.max(this.canvas?.clientWidth || this.options.width, staffRight + 40);
      const lastSystem = systems[systems.length - 1] || { staffTop: s.staffTop };
      const height = lastSystem.staffTop + s.staffHeight + 50;
      const width = canvasWidth;
      this.svg.setAttribute('width', width);
      this.svg.setAttribute('height', height);
      this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

      const titleNode = createSvg('text', {
        x: left,
        y: 26,
        class: 'partitura-title'
      }, score.title || '');
      titleNode.addEventListener('dblclick', () => this.editTitle());
      this.svg.appendChild(titleNode);

      if (score.composer) {
        this.svg.appendChild(createSvg('text', {
          x: staffRight,
          y: 26,
          class: 'partitura-composer',
          'text-anchor': 'end'
        }, score.composer));
      }

      for (const system of systems) {
        const top = system.staffTop;
        const bottomLine = this.bottomLineY(top);
        const systemMeasures = system.measureIndices;
        const beamLayout = this.buildBeamLayout(top, systemMeasures);
        const systemStart = systemMeasures[0];
        const systemEnd = systemMeasures[systemMeasures.length - 1];
        const systemRight = this.measureLayout.starts[systemEnd] + this.measureLayout.widths[systemEnd];

        if (this.selectedMeasure !== null && systemMeasures.includes(this.selectedMeasure)) {
          this.svg.appendChild(createSvg('rect', {
            x: this.measureLayout.starts[this.selectedMeasure] + 1,
            y: top - 4,
            width: this.measureLayout.widths[this.selectedMeasure] - 2,
            height: 4 * s.staffSpacing + 8,
            class: 'partitura-measure-selected'
          }));
        }

        for (const measure of systemMeasures) {
          if (!measureValidation[measure]?.invalid) continue;
          this.svg.appendChild(createSvg('rect', {
            x: this.measureLayout.starts[measure] + 1,
            y: top - 4,
            width: this.measureLayout.widths[measure] - 2,
            height: 4 * s.staffSpacing + 8,
            class: 'partitura-measure-invalid'
          }));
        }

        for (let line = 0; line < 5; line++) {
          this.svg.appendChild(createSvg('line', {
            x1: left,
            y1: top + line * s.staffSpacing,
            x2: systemRight,
            y2: top + line * s.staffSpacing,
            class: 'partitura-staff-line'
          }));
        }

        for (const measure of systemMeasures) {
          this.svg.appendChild(createSvg('line', {
            x1: this.measureLayout.starts[measure],
            y1: top,
            x2: this.measureLayout.starts[measure],
            y2: top + 4 * s.staffSpacing,
            class: 'partitura-bar-line'
          }));
        }
        this.svg.appendChild(createSvg('line', {
          x1: systemRight,
          y1: top,
          x2: systemRight,
          y2: top + 4 * s.staffSpacing,
          class: 'partitura-bar-line'
        }));

        this.svg.appendChild(createSvg('text', {
          x: this.measureLayout.starts[systemStart] + 55,
          y: top + 48,
          'text-anchor': 'middle',
          class: 'partitura-clef'
        }, clefConfig(score.clef).glyph));

        this.svg.appendChild(createSvg('text', {
          x: this.measureLayout.starts[systemStart] + 48,
          y: top + 25,
          class: 'partitura-time'
        }, String(score.timeSignature.beats)));
        this.svg.appendChild(createSvg('text', {
          x: this.measureLayout.starts[systemStart] + 48,
          y: top + 44,
          class: 'partitura-time'
        }, String(score.timeSignature.beatType)));

        const beatGuideGroup = createSvg('g', { class: 'partitura-beat-guides' });
        for (const measure of systemMeasures) {
          for (let b = 1; b < score.timeSignature.beats; b++) {
            const x = this.beatToX(measure, b);
            beatGuideGroup.appendChild(createSvg('line', {
              x1: x,
              y1: top - 6,
              x2: x,
              y2: top + 4 * s.staffSpacing + 6,
              class: 'partitura-beat-guide'
            }));
          }
        }
        this.svg.appendChild(beatGuideGroup);

        const hit = createSvg('rect', {
          x: left,
          y: top - 28,
          width: systemRight - left,
          height: s.staffHeight,
          fill: 'transparent',
          class: 'partitura-hit-area'
        });
        hit.addEventListener('pointerdown', (event) => this.onCanvasPointerDown(event));
        hit.addEventListener('contextmenu', (event) => this.onCanvasContextMenu(event));
        hit.addEventListener('dragover', (event) => {
          event.preventDefault();
        });
        hit.addEventListener('drop', (event) => this.onCanvasDrop(event));
        this.svg.appendChild(hit);

        const notesGroup = createSvg('g', { class: 'partitura-notes' });
        for (const measure of systemMeasures) {
          for (const note of score.notes) {
            if (note.measure !== measure) continue;
            notesGroup.appendChild(this.drawNote(note, bottomLine, beamLayout.noteBeamInfo, top));
          }
        }
        notesGroup.appendChild(this.drawBeams(beamLayout.groups));
        this.svg.appendChild(notesGroup);
      }

      if (this.selectionBox) {
        this.svg.appendChild(createSvg('rect', {
          x: this.selectionBox.x,
          y: this.selectionBox.y,
          width: this.selectionBox.width,
          height: this.selectionBox.height,
          class: 'partitura-marquee-selection'
        }));
      }

      if (this.playback) this.updatePlaybackCursor();
    }

    buildBeamLayout(staffTop, measureFilter = null) {
      const score = this.model.score;
      const beatUnit = 4 / score.timeSignature.beatType;
      const epsilon = 1e-6;
      const notesByMeasure = Array.from({ length: score.measures }, () => []);
      const noteBeamInfo = new Map();
      const groups = [];

      for (const note of score.notes) {
        if (durationFlagCount(note.duration) < 1) continue;
        if (Array.isArray(measureFilter) && !measureFilter.includes(note.measure)) continue;
        if (note.measure >= 0 && note.measure < score.measures) notesByMeasure[note.measure].push(note);
      }

      for (let measure = 0; measure < score.measures; measure++) {
        const notes = notesByMeasure[measure]
          .sort((a, b) => (a.beat - b.beat) || (pitchToMidi(a.pitch) - pitchToMidi(b.pitch)));
        if (!notes.length) continue;

        const chunks = [];
        let chunk = [];
        let chunkBeatSlot = -1;
        let previousEnd = -1;

        const flushChunk = () => {
          if (chunk.length >= 2) chunks.push(chunk);
          chunk = [];
          chunkBeatSlot = -1;
          previousEnd = -1;
        };

        for (const current of notes) {
          const start = current.beat;
          const end = current.beat + current.duration;
          const beatSlot = Math.floor((start + epsilon) / beatUnit);
          const slotEnd = (beatSlot + 1) * beatUnit;
          const crossesBeat = end > slotEnd + epsilon;

          if (crossesBeat) {
            flushChunk();
            continue;
          }

          if (!chunk.length) {
            chunk = [current];
            chunkBeatSlot = beatSlot;
            previousEnd = end;
            continue;
          }

          const contiguous = Math.abs(start - previousEnd) <= 0.125 + epsilon;
          if (beatSlot !== chunkBeatSlot || !contiguous) {
            flushChunk();
            chunk = [current];
            chunkBeatSlot = beatSlot;
            previousEnd = end;
            continue;
          }

          chunk.push(current);
          previousEnd = end;
        }
        flushChunk();

        for (const group of chunks) {
          const points = group.map((note) => ({
            id: note.id,
            x: this.noteToX(note),
            y: this.pitchToY(note.pitch, staffTop),
            beams: durationFlagCount(note.duration)
          }));
          const avgY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
          const stemUp = avgY >= staffTop + 2 * this.options.staffSpacing;
          const naturalStart = stemUp ? points[0].y - 36 : points[0].y + 36;
          const naturalEnd = stemUp ? points[points.length - 1].y - 36 : points[points.length - 1].y + 36;
          const deltaX = Math.max(1, points[points.length - 1].x - points[0].x);
          const slope = clampSlope((naturalEnd - naturalStart) / deltaX, 0.35);
          const stemPoints = points.map((point) => {
            const beamY = naturalStart + slope * (point.x - points[0].x);
            return {
              ...point,
              stemUp,
              stemX: stemUp ? point.x + 7 : point.x - 7,
              stemEnd: beamY
            };
          });
          stemPoints.beamSlope = slope;
          stemPoints.stemUp = stemUp;

          for (const point of stemPoints) {
            noteBeamInfo.set(point.id, {
              beamed: true,
              stemUp: point.stemUp,
              stemX: point.stemX,
              stemEnd: point.stemEnd,
              beams: point.beams,
              beamSlope: slope
            });
          }
          groups.push(stemPoints);
        }
      }

      return { noteBeamInfo, groups };
    }

    drawBeams(groups) {
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

    buildMeasureLayout() {
      const score = this.model.score;
      const minSlotWidth = 30;
      const starts = [];
      const widths = [];
      const notesByMeasure = Array.from({ length: score.measures }, () => []);
      const noteXById = new Map();
      const measureBaseWidths = [];
      const measureFirstWidths = [];
      const systems = [];
      const measureToSystem = [];
      const availableWidth = Math.max(
        this.options.staffLeft + 240,
        (this.canvas?.clientWidth || this.options.width || 960) - 24
      );
      const lineWidth = Math.max(240, availableWidth - this.options.staffLeft);
      let cursor = this.options.staffLeft;
      let currentSystem = null;

      for (const note of score.notes) {
        if (note.measure >= 0 && note.measure < score.measures) notesByMeasure[note.measure].push(note);
      }

      for (let measure = 0; measure < score.measures; measure++) {
        const notes = notesByMeasure[measure];
        const baseWidth = Math.max(this.options.measureWidth, 42 + (notes.length + 1) * minSlotWidth);
        measureBaseWidths[measure] = baseWidth;
        measureFirstWidths[measure] = Math.max(baseWidth, 90 + 42 + (notes.length + 1) * minSlotWidth);
      }

      const startNewSystem = () => {
        currentSystem = {
          index: systems.length,
          measureIndices: [],
          staffTop: this.options.staffTop + systems.length * (this.options.staffHeight + 40),
          staffRight: this.options.staffLeft
        };
        systems.push(currentSystem);
        cursor = this.options.staffLeft;
      };

      startNewSystem();

      for (let measure = 0; measure < score.measures; measure++) {
        const notes = notesByMeasure[measure];
        notes.sort((a, b) => (a.beat - b.beat) || (pitchToMidi(a.pitch) - pitchToMidi(b.pitch)));
        const isSystemStart = currentSystem.measureIndices.length === 0;
        const dynamicWidth = isSystemStart ? measureFirstWidths[measure] : measureBaseWidths[measure];
        if (!isSystemStart && currentSystem.measureIndices.length > 0 && cursor + dynamicWidth > availableWidth) {
          startNewSystem();
        }

        const systemMeasureStart = currentSystem.measureIndices.length === 0;
        const measureWidth = systemMeasureStart ? measureFirstWidths[measure] : measureBaseWidths[measure];
        starts[measure] = cursor;
        widths[measure] = measureWidth;
        measureToSystem[measure] = currentSystem.index;
        currentSystem.measureIndices.push(measure);

        cursor += measureWidth;
        currentSystem.staffRight = cursor;
      }

      for (const system of systems) {
        const systemWidth = system.measureIndices.reduce((sum, measure) => sum + widths[measure], 0);
        const extraWidth = Math.max(0, lineWidth - systemWidth);
        if (extraWidth > 0 && system.measureIndices.length > 0) {
          const widthIncrement = extraWidth / system.measureIndices.length;
          let offset = 0;
          for (const measure of system.measureIndices) {
            starts[measure] += offset;
            widths[measure] += widthIncrement;
            offset += widthIncrement;
          }
        }
        system.staffRight = this.options.staffLeft + Math.max(lineWidth, systemWidth);
      }

      for (const system of systems) {
        const systemStartMeasure = system.measureIndices[0];
        for (const measure of system.measureIndices) {
          const notes = notesByMeasure[measure];
          const isSystemStart = measure === systemStartMeasure;
          const leadingInset = isSystemStart ? 90 : 26;
          const trailingInset = isSystemStart ? 20 : 16;
          const usableStart = starts[measure] + leadingInset;
          const usableWidth = Math.max(24, widths[measure] - leadingInset - trailingInset);
          const gap = usableWidth / (notes.length + 1);
          for (let i = 0; i < notes.length; i++) {
            noteXById.set(notes[i].id, usableStart + gap * (i + 1));
          }
        }
      }

      return {
        starts,
        widths,
        notesByMeasure,
        noteXById,
        systems,
        measureToSystem,
        staffRight: systems.length ? Math.max(...systems.map((system) => system.staffRight)) : cursor
      };
    }

    noteToX(note) {
      const x = this.measureLayout?.noteXById?.get(note.id);
      if (Number.isFinite(x)) return x;
      return this.beatToX(note.measure, note.beat);
    }

    drawNote(note, bottomLine, noteBeamInfo = null, staffTop = this.options.staffTop) {
      const x = this.noteToX(note);
      const y = this.pitchToY(note.pitch, staffTop);
      const group = createSvg('g', {
        class: `partitura-note ${this.selectedIds.has(note.id) ? 'is-selected' : ''}`,
        'data-note-id': note.id,
        tabindex: 0
      });

      for (const ledgerY of this.ledgerLinesForY(y, staffTop)) {
        group.appendChild(createSvg('line', {
          x1: x - 13,
          y1: ledgerY,
          x2: x + 13,
          y2: ledgerY,
          class: 'partitura-ledger-line'
        }));
      }

      const type = durationType(note.duration);
      const filled = type !== 'whole' && type !== 'half';
      if (this.selectedIds.has(note.id)) {
        group.appendChild(createSvg('rect', {
          x: x - 16,
          y: y - 22,
          width: 32,
          height: 44,
          rx: 7,
          ry: 7,
          class: 'partitura-note-selection-box'
        }));
      }
      if (isDottedDuration(note.duration)) {
        group.appendChild(createSvg('circle', {
          cx: x + 14,
          cy: y - 1,
          r: 2.6,
          class: 'partitura-note-dot'
        }));
      }
      group.appendChild(createSvg('ellipse', {
        cx: x,
        cy: y,
        rx: 8,
        ry: 5.6,
        transform: `rotate(-18 ${x} ${y})`,
        class: filled ? 'partitura-notehead is-filled' : 'partitura-notehead'
      }));

      if (type !== 'whole') {
        const beamed = noteBeamInfo?.get(note.id) || null;
        const stemUp = beamed ? beamed.stemUp : y >= staffTop + 2 * this.options.staffSpacing;
        const stemX = beamed ? beamed.stemX : (stemUp ? x + 7 : x - 7);
        const stemEnd = beamed ? beamed.stemEnd : (stemUp ? y - 36 : y + 36);
        group.appendChild(createSvg('line', {
          x1: stemX,
          y1: y,
          x2: stemX,
          y2: stemEnd,
          class: 'partitura-stem'
        }));
        if (!beamed) {
          const flags = durationFlagCount(note.duration);
          for (let idx = 0; idx < flags; idx++) {
            const offset = idx * 8;
            const startY = stemUp ? stemEnd + offset : stemEnd - offset;
            group.appendChild(createSvg('path', {
              d: stemUp
                ? `M ${stemX} ${startY} q 18 7 5 20`
                : `M ${stemX} ${startY} q -18 -7 -5 -20`,
              class: 'partitura-flag'
            }));
          }
        }
      }

      const acc = accidentalText(note.pitch.alter || 0);
      if (acc) group.appendChild(createSvg('text', {
        x: x - 25,
        y: y + 5,
        class: 'partitura-accidental'
      }, acc));

      if (note.lyric) {
        group.appendChild(createSvg('text', {
          x,
          y: this.options.staffTop + 4 * this.options.staffSpacing + 36,
          'text-anchor': 'middle',
          class: 'partitura-lyric'
        }, note.lyric));
      }

      group.addEventListener('pointerdown', (event) => this.onNotePointerDown(event, note.id));
      group.addEventListener('contextmenu', (event) => this.onNoteContextMenu(event, note.id));
      group.addEventListener('dblclick', () => this.editNote(note.id));
      return group;
    }

    bindKeyboard() {
      this.container.onkeydown = (event) => {
        if (this.options.readonly) return;
        const handled = this.handleKeyboardNavigation(event);
        if (handled) return;
        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          this.removeSelected();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) this.redo(); else this.undo();
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          this.redo();
        }
        if (event.key === 'Escape') this.hideContextMenu();
        if (event.key === 'Escape') this.clearSelection();
      };
    }

    handleKeyboardNavigation(event) {
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!keys.includes(event.key)) return false;
      if (this.options.mode !== 'select') return false;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (this.selectedIds.size !== 1) return false;
        const selectedNote = this.model.getNote([...this.selectedIds][0]);
        if (!selectedNote) return false;
        event.preventDefault();
        this.selectAdjacentNote(selectedNote, event.key === 'ArrowRight' ? 1 : -1);
        return true;
      }

      if (!this.selectedIds.size) return false;
      event.preventDefault();
      const semitoneStep = event.ctrlKey || event.metaKey ? 12 : 1;
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      this.transposeSelectedNotes(direction * semitoneStep);
      return true;
    }

    getOrderedNotes() {
      return [...this.model.score.notes].sort((a, b) => (a.measure - b.measure) || (a.beat - b.beat) || (pitchToMidi(a.pitch) - pitchToMidi(b.pitch)));
    }

    selectAdjacentNote(currentNote, direction) {
      const notes = this.getOrderedNotes();
      const currentIndex = notes.findIndex((note) => note.id === currentNote.id);
      if (currentIndex === -1) return;
      const nextIndex = clamp(currentIndex + direction, 0, notes.length - 1);
      if (nextIndex === currentIndex) return;
      this.select(notes[nextIndex].id, false);
    }

    transposeSelectedNotes(semitones) {
      const selectedNotes = [...this.selectedIds].map((id) => this.model.getNote(id)).filter(Boolean);
      if (!selectedNotes.length) return;
      this.pushHistory();
      for (const note of selectedNotes) {
        const nextPitch = midiToPitch(pitchToMidi(note.pitch) + semitones);
        this.model.updateNote(note.id, { pitch: nextPitch });
      }
      this.emitChange();
      this.drawScore();
    }

    onCanvasContextMenu(event) {
      if (this.options.readonly) return;
      event.preventDefault();
      const point = this.svgPoint(event);
      const position = this.pointToMusicalPosition(point.x, point.y);
      this.showContextMenu(position.measure, event);
      this.drawScore();
    }

    onNoteContextMenu(event, id) {
      if (this.options.readonly) return;
      event.preventDefault();
      event.stopPropagation();
      const note = this.model.getNote(id);
      if (!note) return;
      this.showNoteContextMenu(id, event);
      this.drawScore();
    }

    onCanvasPointerDown(event) {
      if (this.options.readonly) return;
      this.hideContextMenu();
      if (event.target.closest('.partitura-note')) return;
      const point = this.svgPoint(event);
      const position = this.pointToMusicalPosition(point.x, point.y);
      this.setSelectedMeasure(position.measure);
      if (this.options.mode === 'select') {
        const additive = event.shiftKey || event.metaKey || event.ctrlKey;
        const baseSelectedIds = additive ? [...this.selectedIds] : [];
        if (!additive) this.clearSelection();
        this.drag = {
          type: 'marquee',
          startX: point.x,
          startY: point.y,
          currentX: point.x,
          currentY: point.y,
          moved: false,
          baseSelectedIds
        };
        this.selectionBox = {
          x: point.x,
          y: point.y,
          width: 0,
          height: 0
        };
        window.addEventListener('pointermove', this.boundMove = (e) => this.onPointerMove(e));
        window.addEventListener('pointerup', this.boundUp = () => this.onPointerUp(), { once: true });
        this.drawScore();
        return;
      }
      this.pushHistory();
      const note = this.model.addNote({
        measure: position.measure,
        beat: position.beat,
        duration: this.options.noteDuration,
        pitch: position.pitch
      });
      if (!note) {
        this.undoStack.pop();
        this.drawScore();
        return;
      }
      this.select(note.id, false);
      this.emitChange();
      this.playNote(note);
      this.drawScore();
    }

    onCanvasDrop(event) {
      if (this.options.readonly) return;
      event.preventDefault();
      const raw = String(event.dataTransfer?.getData('text/plain') || '').trim().toLowerCase();
      if (!raw) return;
      if (!['sol', 'fa', 'do', 'g', 'f', 'c', 'treble', 'bass', 'alto', 'tenor'].includes(raw)) return;
      const clef = normalizeClef(raw);
      this.pushHistory();
      this.model.setClef(clef);
      this.hideContextMenu();
      this.emitChange();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    onNotePointerDown(event, id) {
      if (this.options.readonly) return;
      this.hideContextMenu();
      event.stopPropagation();
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      this.select(id, additive);
      const point = this.svgPoint(event);
      const note = this.model.getNote(id);
      if (note) this.setSelectedMeasure(note.measure);
      this.drag = {
        id,
        startX: point.x,
        startY: point.y,
        original: clone(note),
        moved: false
      };
      this.pushHistory();
      window.addEventListener('pointermove', this.boundMove = (e) => this.onPointerMove(e));
      window.addEventListener('pointerup', this.boundUp = () => this.onPointerUp(), { once: true });
      this.drawScore();
    }

    onPointerMove(event) {
      if (!this.drag) return;
      const point = this.svgPoint(event);
      const deltaX = Math.abs(point.x - this.drag.startX);
      const deltaY = Math.abs(point.y - this.drag.startY);
      if (deltaX + deltaY < 2) return;
      this.drag.moved = true;

      if (this.drag.type === 'marquee') {
        this.drag.currentX = point.x;
        this.drag.currentY = point.y;
        this.selectionBox = {
          x: Math.min(this.drag.startX, point.x),
          y: Math.min(this.drag.startY, point.y),
          width: Math.abs(point.x - this.drag.startX),
          height: Math.abs(point.y - this.drag.startY)
        };
        this.updateMarqueeSelection();
        this.drawScore();
        return;
      }

      const position = this.pointToMusicalPosition(point.x, point.y);
      const updated = this.model.updateNote(this.drag.id, {
        measure: position.measure,
        beat: position.beat,
        pitch: position.pitch
      });
      if (!updated) return;
      this.emitChange(false);
      this.drawScore();
    }

    onPointerUp() {
      if (this.boundMove) window.removeEventListener('pointermove', this.boundMove);
      if (this.drag?.type === 'marquee') {
        this.selectionBox = null;
        this.drag = null;
        this.emitSelect();
        this.updateToolbar();
        this.updateMeasureToolbar();
        this.drawScore();
        return;
      }
      const draggedNote = this.drag ? this.model.getNote(this.drag.id) : null;
      const shouldPlay = !!(this.drag && this.drag.moved && draggedNote);
      this.drag = null;
      if (shouldPlay) this.playNote(draggedNote);
      this.emitChange();
    }

    updateMarqueeSelection() {
      if (!this.drag || this.drag.type !== 'marquee' || !this.selectionBox) return;
      const box = this.selectionBox;
      const hitIds = [];
      const xMin = box.x;
      const xMax = box.x + box.width;
      const yMin = box.y;
      const yMax = box.y + box.height;

      for (const note of this.model.score.notes) {
        const x = this.noteToX(note);
        const systemIndex = this.measureLayout?.measureToSystem?.[note.measure] ?? 0;
        const staffTop = this.measureLayout?.systems?.[systemIndex]?.staffTop ?? this.options.staffTop;
        const y = this.pitchToY(note.pitch, staffTop);
        if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) hitIds.push(note.id);
      }

      this.selectedIds = new Set([...(this.drag.baseSelectedIds || []), ...hitIds]);
      this.emitSelect();
      this.updateToolbar();
      this.updateMeasureToolbar();
    }

    editNote(id) {
      const note = this.model.getNote(id);
      if (!note) return;
      const value = prompt('Letra/sílaba para esta nota:', note.lyric || '');
      if (value === null) return;
      this.pushHistory();
      this.model.updateNote(id, { lyric: value });
      this.emitChange();
      this.drawScore();
    }

    editTitle() {
      const currentTitle = this.model.score.title || '';
      const value = prompt('Título de la partitura:', currentTitle);
      if (value === null) return;
      this.pushHistory();
      this.model.setScore({ ...this.model.toJSON(), title: value.trim() || 'Sin título' });
      this.selectedIds.clear();
      this.hideContextMenu();
      this.emitChange();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    pointToMusicalPosition(x, y) {
      const score = this.model.score;
      const layout = this.measureLayout || this.buildMeasureLayout();
      const systems = layout.systems || [];
      const system = systems.find((candidate) => y >= candidate.staffTop - 28 && y <= candidate.staffTop + this.options.staffHeight)
        || systems[0]
        || { staffTop: this.options.staffTop, measureIndices: [] };
      const measures = system.measureIndices || [];
      let measure = measures[0] ?? 0;
      for (const currentMeasure of measures) {
        const start = layout.starts[currentMeasure];
        const end = start + layout.widths[currentMeasure];
        if (x >= start && x <= end) {
          measure = currentMeasure;
          break;
        }
        if (x > end) measure = currentMeasure;
      }
      const measureX = layout.starts[measure];
      const measureWidth = layout.widths[measure];
      const isSystemStart = measures[0] === measure;
      const leadingInset = isSystemStart ? 90 : 26;
      const trailingInset = isSystemStart ? 20 : 16;
      const usableStart = measureX + leadingInset;
      const usableWidth = Math.max(24, measureWidth - leadingInset - trailingInset);
      const beat = clamp(roundToGrid(((x - usableStart) / usableWidth) * score.timeSignature.beats, this.options.snap), 0, score.timeSignature.beats - this.options.snap);
      const pitch = this.yToPitch(y, system?.staffTop ?? this.options.staffTop);
      return { measure, beat, pitch };
    }

    beatToX(measure, beat) {
      const layout = this.measureLayout || this.buildMeasureLayout();
      const measureX = layout.starts[measure] ?? this.options.staffLeft;
      const measureWidth = layout.widths[measure] ?? this.options.measureWidth;
      const isSystemStart = (layout.systems || []).some((system) => system.measureIndices?.[0] === measure);
      const leadingInset = isSystemStart ? 90 : 26;
      const trailingInset = isSystemStart ? 20 : 16;
      const usableStart = measureX + leadingInset;
      const usableWidth = Math.max(24, measureWidth - leadingInset - trailingInset);
      return usableStart + (beat / this.model.score.timeSignature.beats) * usableWidth;
    }

    pitchToY(pitch, staffTop = this.options.staffTop) {
      const reference = clefConfig(this.model.score.clef).reference;
      const diff = pitchToDiatonicIndex(pitch) - pitchToDiatonicIndex(reference);
      return this.bottomLineY(staffTop) - diff * (this.options.staffSpacing / 2);
    }

    yToPitch(y, staffTop = this.options.staffTop) {
      const reference = clefConfig(this.model.score.clef).reference;
      const diff = Math.round((this.bottomLineY(staffTop) - y) / (this.options.staffSpacing / 2));
      return diatonicIndexToPitch(pitchToDiatonicIndex(reference) + diff);
    }

    bottomLineY(staffTop = this.options.staffTop) {
      return staffTop + 4 * this.options.staffSpacing;
    }

    ledgerLinesForY(y, staffTop = this.options.staffTop) {
      const top = staffTop;
      const bottom = this.bottomLineY(staffTop);
      const spacing = this.options.staffSpacing;
      const lines = [];
      if (y < top) {
        for (let yy = top - spacing; yy >= y - 1; yy -= spacing) lines.push(yy);
      }
      if (y > bottom) {
        for (let yy = bottom + spacing; yy <= y + 1; yy += spacing) lines.push(yy);
      }
      return lines;
    }

    svgPoint(event) {
      const point = this.svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      return point.matrixTransform(this.svg.getScreenCTM().inverse());
    }

    setMode(mode) {
      this.options.mode = mode === 'select' ? 'select' : 'write';
      this.updateToolbar();
    }

    select(id, additive = false) {
      if (!additive) this.selectedIds.clear();
      if (this.selectedIds.has(id) && additive) this.selectedIds.delete(id);
      else this.selectedIds.add(id);
      this.emitSelect();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    clearSelection() {
      this.selectedIds.clear();
      this.emitSelect();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    removeSelected() {
      if (!this.selectedIds.size) return;
      this.pushHistory();
      this.model.removeNotes([...this.selectedIds]);
      this.selectedIds.clear();
      this.emitChange();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    addNote(note) {
      this.pushHistory();
      const created = this.model.addNote(note);
      if (!created) {
        this.undoStack.pop();
        return null;
      }
      this.emitChange();
      this.drawScore();
      return created;
    }

    setScore(score) {
      this.pushHistory();
      this.model.setScore(score);
      this.selectedIds.clear();
      this.setSelectedMeasure(null);
      this.hideContextMenu();
      this.emitChange();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    setClef(clef) {
      this.pushHistory();
      this.model.setClef(clef);
      this.hideContextMenu();
      this.emitChange();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    toJSON() {
      return this.model.toJSON();
    }

    exportMusicXML() {
      return exportMusicXML(this.toJSON());
    }

    pushHistory() {
      this.undoStack.push(this.model.toJSON());
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      if (this.undoStack.length <= 1) return;
      const current = this.undoStack.pop();
      this.redoStack.push(current);
      this.model.setScore(this.undoStack[this.undoStack.length - 1]);
      this.selectedIds.clear();
      this.hideContextMenu();
      if (this.selectedMeasure !== null && this.selectedMeasure >= this.model.score.measures) {
        this.setSelectedMeasure(this.model.score.measures - 1);
      }
      this.emitChange();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    redo() {
      if (!this.redoStack.length) return;
      const state = this.redoStack.pop();
      this.undoStack.push(state);
      this.model.setScore(state);
      this.selectedIds.clear();
      this.hideContextMenu();
      if (this.selectedMeasure !== null && this.selectedMeasure >= this.model.score.measures) {
        this.setSelectedMeasure(this.model.score.measures - 1);
      }
      this.emitChange();
      this.updateToolbar();
      this.updateMeasureToolbar();
      this.drawScore();
    }

    emitChange(final = true) {
      if (typeof this.options.onChange === 'function') this.options.onChange(this.toJSON(), { final });
    }

    emitSelect() {
      if (typeof this.options.onSelect === 'function') {
        this.options.onSelect([...this.selectedIds].map((id) => this.model.getNote(id)).filter(Boolean));
      }
    }

    async play() {
      if (this.playback) this.stopPlayback();
      const score = this.toJSON();
      if (!score.notes.length) return;
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      if (!AudioContext) return;
      this.audioContext = this.audioContext || new AudioContext();
      const ctx = this.audioContext;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          return;
        }
      }
      const secondsPerBeat = 60 / score.tempo;
      const startAt = ctx.currentTime + 0.05;
      this.playback = {
        startAt,
        secondsPerBeat,
        totalBeats: score.measures * score.timeSignature.beats,
        score
      };
      this.playbackNodes = [];
      for (const note of score.notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = startAt + ((note.measure * score.timeSignature.beats) + note.beat) * secondsPerBeat;
        const dur = Math.max(0.08, note.duration * secondsPerBeat * 0.9);
        osc.frequency.value = 440 * Math.pow(2, (pitchToMidi(note.pitch) - 69) / 12);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
        this.playbackNodes.push({ osc, gain });
        if (typeof this.options.onPlayNote === 'function') this.options.onPlayNote(note);
      }
      this.updateMeasureToolbar();
      this.updatePlaybackCursor();
      this.playbackFrame = requestAnimationFrame(() => this.tickPlayback());
    }

    async playNote(note) {
      if (!note || !note.pitch) return;
      const AudioContext = global.AudioContext || global.webkitAudioContext;
      if (!AudioContext) return;
      this.audioContext = this.audioContext || new AudioContext();
      const ctx = this.audioContext;
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          return;
        }
      }
      const secondsPerBeat = 60 / this.model.score.tempo;
      const start = ctx.currentTime + 0.02;
      const dur = Math.max(0.12, note.duration * secondsPerBeat * 0.45);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440 * Math.pow(2, (pitchToMidi(note.pitch) - 69) / 12);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
      if (typeof this.options.onPlayNote === 'function') this.options.onPlayNote(note);
    }

    stopPlayback() {
      if (this.playbackFrame) {
        cancelAnimationFrame(this.playbackFrame);
        this.playbackFrame = null;
      }
      for (const node of this.playbackNodes) {
        try { node.osc.stop(); } catch {
          // ignore nodes already stopped
        }
        try { node.osc.disconnect(); } catch {}
        try { node.gain.disconnect(); } catch {}
      }
      this.playbackNodes = [];
      this.playback = null;
      this.removePlaybackCursor();
      this.updateMeasureToolbar();
    }

    tickPlayback() {
      if (!this.playback) return;
      const position = this.getPlaybackPosition();
      if (!position) {
        this.stopPlayback();
        return;
      }
      if (position.done) {
        this.stopPlayback();
        return;
      }
      this.updatePlaybackCursor(position);
      this.playbackFrame = requestAnimationFrame(() => this.tickPlayback());
    }

    getPlaybackPosition() {
      if (!this.playback || !this.audioContext) return null;
      const elapsedBeats = Math.max(0, (this.audioContext.currentTime - this.playback.startAt) / this.playback.secondsPerBeat);
      const totalBeats = this.playback.totalBeats;
      if (elapsedBeats >= totalBeats) return { done: true };
      const beatsPerMeasure = this.playback.score.timeSignature.beats;
      const measure = clamp(Math.floor(elapsedBeats / beatsPerMeasure), 0, this.playback.score.measures - 1);
      const beat = elapsedBeats - (measure * beatsPerMeasure);
      return { measure, beat, elapsedBeats };
    }

    updatePlaybackCursor(position = null) {
      if (!this.playback || !this.measureLayout) return;
      const current = position || this.getPlaybackPosition();
      if (!current || current.done) {
        this.removePlaybackCursor();
        return;
      }
      const layout = this.measureLayout;
      const systemIndex = layout.measureToSystem?.[current.measure] ?? 0;
      const system = layout.systems?.[systemIndex] || layout.systems?.[0] || null;
      if (!system) return;
      const x = this.beatToX(current.measure, current.beat);
      const y1 = system.staffTop - 6;
      const y2 = system.staffTop + 4 * this.options.staffSpacing + 6;
      if (!this.playbackLine || this.playbackLine.parentNode !== this.svg) {
        this.playbackLineBase = createSvg('line', { class: 'partitura-playback-cursor-base' });
        this.playbackLine = createSvg('line', { class: 'partitura-playback-cursor' });
        this.svg.appendChild(this.playbackLineBase);
        this.svg.appendChild(this.playbackLine);
      }
      this.playbackLineBase.setAttribute('x1', x);
      this.playbackLineBase.setAttribute('x2', x);
      this.playbackLineBase.setAttribute('y1', y1);
      this.playbackLineBase.setAttribute('y2', y2);
      this.playbackLine.setAttribute('x1', x);
      this.playbackLine.setAttribute('x2', x);
      this.playbackLine.setAttribute('y1', y1);
      this.playbackLine.setAttribute('y2', y2);
    }

    removePlaybackCursor() {
      if (this.playbackLineBase?.parentNode) this.playbackLineBase.parentNode.removeChild(this.playbackLineBase);
      this.playbackLineBase = null;
      if (this.playbackLine?.parentNode) this.playbackLine.parentNode.removeChild(this.playbackLine);
      this.playbackLine = null;
    }
  }

  function createSvg(name, attrs = {}, text = '') {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== null && value !== undefined) node.setAttribute(key, value);
    }
    if (text !== '') node.textContent = text;
    return node;
  }

  const api = {
    ScoreEditor,
    ScoreModel,
    exportMusicXML,
    pitchToMidi,
    midiToPitch,
    version: '0.1.0'
  };

  global.PartituraJS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
