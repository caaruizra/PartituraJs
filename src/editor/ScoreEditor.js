import { ScoreModel } from '../model/ScoreModel.js';
import { exportMusicXML, importMusicXML } from '../services/musicxml.js';
import { clamp, roundToGrid } from '../core/utils.js';
import { clefConfig } from '../music/clef.js';
import {
  diatonicIndexToPitch,
  pitchToDiatonicIndex
} from '../music/pitch.js';
import {
  beatToX as beatToXFromLayout,
  buildBeamLayout as buildBeamLayoutFromLayout,
  buildMeasureLayout as buildMeasureLayoutFromLayout,
  measureLeadingInset as measureLeadingInsetFromLayout,
  noteToX as noteToXFromLayout
} from '../services/layout-engine.js';
import {
  getPlaybackPosition as getPlaybackPositionFromAudio,
  play as playFromAudio,
  playNote as playNoteFromAudio,
  removePlaybackCursor as removePlaybackCursorFromAudio,
  stopPlayback as stopPlaybackFromAudio,
  tickPlayback as tickPlaybackFromAudio,
  updatePlaybackCursor as updatePlaybackCursorFromAudio
} from '../services/audio-player.js';
import {
  bindKeyboard as bindKeyboardFromController,
  convertSelectedNoteToRest as convertSelectedNoteToRestFromController,
  getOrderedNotes as getOrderedNotesFromController,
  handleKeyboardNavigation as handleKeyboardNavigationFromController,
  selectAdjacentNote as selectAdjacentNoteFromController,
  transposeSelectedNotes as transposeSelectedNotesFromController
} from './keyboard-controller.js';
import {
  renderMeasureToolbar as renderMeasureToolbarFromController,
  renderToolbar as renderToolbarFromController,
  updateMeasureToolbar as updateMeasureToolbarFromController,
  updateToolbar as updateToolbarFromController
} from './toolbar-controller.js';
import {
  onCanvasContextMenu as onCanvasContextMenuFromController,
  onCanvasDrop as onCanvasDropFromController,
  onCanvasPointerDown as onCanvasPointerDownFromController,
  onNoteContextMenu as onNoteContextMenuFromController,
  onNotePointerDown as onNotePointerDownFromController,
  onPointerMove as onPointerMoveFromController,
  onPointerUp as onPointerUpFromController,
  updateMarqueeSelection as updateMarqueeSelectionFromController
} from './pointer-controller.js';
import {
  hideContextMenu as hideContextMenuFromController,
  renderContextMenu as renderContextMenuFromController,
  showContextMenu as showContextMenuFromController,
  showNoteContextMenu as showNoteContextMenuFromController
} from './context-menu-controller.js';
import { drawBeams as drawBeamsFromRenderer } from '../render/beams.js';
import {
  drawNote as drawNoteFromRenderer,
  drawRest as drawRestFromRenderer
} from '../render/notes.js';
import { drawScore as drawScoreFromRenderer } from '../render/score-renderer.js';
import { createSvg } from '../render/svg.js';
import { createTranslator, normalizeLanguage } from '../i18n/index.js';

const global = typeof window !== 'undefined' ? window : globalThis;

function parseTupletValue(value) {
  const raw = String(value || '').trim().toLowerCase();
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.round(numeric);
  const byName = {
    dosillo: 2,
    duplet: 2,
    tresillo: 3,
    triplet: 3,
    cuatrillo: 4,
    quadruplet: 4,
    cinquillo: 5,
    quintillo: 5,
    quintuplet: 5,
    seisillo: 6,
    sextuplet: 6,
    septillo: 7,
    septuplet: 7
  };
  return byName[raw] ?? null;
}

export class ScoreEditor {
  constructor(container, options = {}) {
    const element = typeof container === 'string' ? document.querySelector(container) : container;
    const initialLanguage = normalizeLanguage(options.language);
    this.t = createTranslator(initialLanguage);
    if (!element) throw new Error(this.t('editor.invalidContainer'));

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
      noteKind: options.noteKind === 'rest' ? 'rest' : 'note',
      language: initialLanguage,
      onChange: options.onChange || null,
      onSelect: options.onSelect || null,
      onPlayNote: options.onPlayNote || null
    };
    this.model = new ScoreModel(options.score || {
      title: options.title,
      measures: options.measures || 4,
      timeSignature: options.timeSignature || { beats: 4, beatType: 4 },
      notes: options.notes || []
    }, { defaultTitle: this.t('score.untitled') });
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
    this.pendingTieStart = null;
    this.pendingSlurStart = null;
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
    document.documentElement.lang = this.options.language;

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
    renderContextMenuFromController(this);
  }

  showContextMenu(measure, event) {
    showContextMenuFromController(this, measure, event);
  }

  showNoteContextMenu(noteId, event) {
    showNoteContextMenuFromController(this, noteId, event);
  }

  hideContextMenu() {
    hideContextMenuFromController(this);
  }

  renderMeasureToolbar() {
    renderMeasureToolbarFromController(this);
  }

  renderToolbar(layout) {
    renderToolbarFromController(this, layout);
  }

  updateToolbar() {
    updateToolbarFromController(this);
  }

  updateMeasureToolbar() {
    updateMeasureToolbarFromController(this);
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
    drawScoreFromRenderer(this);
  }

  buildBeamLayout(staffTop, measureFilter = null) {
    return buildBeamLayoutFromLayout(this, staffTop, measureFilter);
  }

  drawBeams(groups) {
    return drawBeamsFromRenderer(groups);
  }

  buildMeasureLayout() {
    return buildMeasureLayoutFromLayout(this);
  }

  noteToX(note) {
    return noteToXFromLayout(this, note);
  }

  drawNote(note, bottomLine, noteBeamInfo = null, staffTop = this.options.staffTop) {
    return drawNoteFromRenderer(this, note, bottomLine, noteBeamInfo, staffTop);
  }

  drawRest(note, x, staffTop = this.options.staffTop) {
    return drawRestFromRenderer(this, note, x, staffTop);
  }

  bindKeyboard() {
    bindKeyboardFromController(this);
  }

  handleKeyboardNavigation(event) {
    return handleKeyboardNavigationFromController(this, event);
  }

  getOrderedNotes() {
    return getOrderedNotesFromController(this);
  }

  selectAdjacentNote(currentNote, direction) {
    selectAdjacentNoteFromController(this, currentNote, direction);
  }

  transposeSelectedNotes(semitones) {
    transposeSelectedNotesFromController(this, semitones);
  }

  convertSelectedNoteToRest() {
    convertSelectedNoteToRestFromController(this);
  }

  convertSelectedNoteToTuplet(inputValue = null) {
    if (this.selectedIds.size !== 1) return null;
    const selectedId = [...this.selectedIds][0];
    const source = this.model.getNote(selectedId);
    if (!source) return null;

    const rawValue = inputValue === null
      ? global.prompt(this.t('editor.tupletPrompt'), this.t('editor.tupletPromptDefault'))
      : inputValue;
    if (rawValue === null) return null;

    const count = parseTupletValue(rawValue);
    if (!Number.isFinite(count) || count < 2 || count > 7) {
      global.alert(this.t('editor.tupletInvalid'));
      return null;
    }

    this.pushHistory();
    const created = this.model.replaceNoteWithTuplet(selectedId, count);
    if (!created?.length) {
      this.undoStack.pop();
      global.alert(this.t('editor.tupletTooShort'));
      return null;
    }

    if (this.pendingTieStart === selectedId) this.pendingTieStart = null;
    if (this.pendingSlurStart === selectedId) this.pendingSlurStart = null;
    this.selectedIds = new Set(created.map((note) => note.id));
    this.emitSelect();
    this.emitChange();
    this.updateToolbar();
    this.updateMeasureToolbar();
    this.drawScore();
    return created;
  }

  onCanvasContextMenu(event) {
    onCanvasContextMenuFromController(this, event);
  }

  onNoteContextMenu(event, id) {
    onNoteContextMenuFromController(this, event, id);
  }

  onCanvasPointerDown(event) {
    onCanvasPointerDownFromController(this, event);
  }

  onCanvasDrop(event) {
    onCanvasDropFromController(this, event);
  }

  onNotePointerDown(event, id) {
    onNotePointerDownFromController(this, event, id);
  }

  onPointerMove(event) {
    onPointerMoveFromController(this, event);
  }

  onPointerUp() {
    onPointerUpFromController(this);
  }

  updateMarqueeSelection() {
    updateMarqueeSelectionFromController(this);
  }

  editNote(id) {
    const note = this.model.getNote(id);
    if (!note) return;
    const value = prompt(this.t('editor.lyricPrompt'), note.lyric || '');
    if (value === null) return;
    this.pushHistory();
    this.model.updateNote(id, { lyric: value });
    this.emitChange();
    this.drawScore();
  }

  editTitle() {
    const currentTitle = this.model.score.title || '';
    const value = prompt(this.t('editor.titlePrompt'), currentTitle);
    if (value === null) return;
    this.pushHistory();
    this.model.setScore({ ...this.model.toJSON(), title: value.trim() || this.t('score.untitled') }, { defaultTitle: this.t('score.untitled') });
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
    const leadingInset = measureLeadingInsetFromLayout(this, measure, isSystemStart);
    const trailingInset = isSystemStart ? 20 : 16;
    const usableStart = measureX + leadingInset;
    const usableWidth = Math.max(24, measureWidth - leadingInset - trailingInset);
    const beat = clamp(roundToGrid(((x - usableStart) / usableWidth) * score.timeSignature.beats, this.options.snap), 0, score.timeSignature.beats - this.options.snap);
    const pitch = this.yToPitch(y, system?.staffTop ?? this.options.staffTop);
    return { measure, beat, pitch };
  }

  beatToX(measure, beat) {
    return beatToXFromLayout(this, measure, beat);
  }

  pitchToY(pitch, staffTop = this.options.staffTop) {
    const reference = clefConfig(this.model.score.clef).reference;
    const diff = pitchToDiatonicIndex(pitch) - pitchToDiatonicIndex(reference);
    return this.bottomLineY(staffTop) - diff * (this.options.staffSpacing / 2);
  }

  restY(staffTop = this.options.staffTop) {
    return staffTop + 2 * this.options.staffSpacing;
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

  toggleNoteKind() {
    this.options.noteKind = this.options.noteKind === 'rest' ? 'note' : 'rest';
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
    const selected = new Set(this.selectedIds);
    this.model.removeNotes([...this.selectedIds]);
    if (this.pendingTieStart && selected.has(this.pendingTieStart)) this.pendingTieStart = null;
    if (this.pendingSlurStart && selected.has(this.pendingSlurStart)) this.pendingSlurStart = null;
    this.selectedIds.clear();
    this.emitChange();
    this.updateToolbar();
    this.updateMeasureToolbar();
    this.drawScore();
  }

  compareNoteOrder(a, b) {
    return (a.measure - b.measure) || (a.beat - b.beat);
  }

  startTie(noteId) {
    const note = this.model.getNote(noteId);
    if (!note?.pitch) return false;
    this.pushHistory();
    const updated = this.model.updateNote(noteId, { tieStart: true });
    if (!updated) {
      this.undoStack.pop();
      return false;
    }
    this.pendingTieStart = noteId;
    this.emitChange();
    this.drawScore();
    return true;
  }

  endTie(noteId) {
    const endNote = this.model.getNote(noteId);
    const startNote = this.pendingTieStart ? this.model.getNote(this.pendingTieStart) : null;
    if (!endNote?.pitch || !startNote?.pitch) return false;
    if (this.compareNoteOrder(startNote, endNote) >= 0) return false;
    const samePitch = startNote.pitch.step === endNote.pitch.step
      && (startNote.pitch.alter || 0) === (endNote.pitch.alter || 0)
      && startNote.pitch.octave === endNote.pitch.octave;
    if (!samePitch) return false;

    this.pushHistory();
    const updatedStart = this.model.updateNote(startNote.id, { tieStart: true });
    const updatedEnd = this.model.updateNote(endNote.id, { tieStop: true });
    if (!updatedStart || !updatedEnd) {
      this.undoStack.pop();
      return false;
    }
    this.pendingTieStart = null;
    this.emitChange();
    this.drawScore();
    return true;
  }

  startSlur(noteId) {
    const note = this.model.getNote(noteId);
    if (!note?.pitch) return false;
    this.pushHistory();
    const updated = this.model.updateNote(noteId, { slurStart: true });
    if (!updated) {
      this.undoStack.pop();
      return false;
    }
    this.pendingSlurStart = noteId;
    this.emitChange();
    this.drawScore();
    return true;
  }

  endSlur(noteId) {
    const endNote = this.model.getNote(noteId);
    const startNote = this.pendingSlurStart ? this.model.getNote(this.pendingSlurStart) : null;
    if (!endNote?.pitch || !startNote?.pitch) return false;
    if (this.compareNoteOrder(startNote, endNote) >= 0) return false;

    this.pushHistory();
    const updatedStart = this.model.updateNote(startNote.id, { slurStart: true });
    const updatedEnd = this.model.updateNote(endNote.id, { slurStop: true });
    if (!updatedStart || !updatedEnd) {
      this.undoStack.pop();
      return false;
    }
    this.pendingSlurStart = null;
    this.emitChange();
    this.drawScore();
    return true;
  }

  clearLigatures(noteId) {
    const note = this.model.getNote(noteId);
    if (!note) return false;
    this.pushHistory();
    const updated = this.model.updateNote(noteId, {
      tieStart: false,
      tieStop: false,
      slurStart: false,
      slurStop: false
    });
    if (!updated) {
      this.undoStack.pop();
      return false;
    }
    if (this.pendingTieStart === noteId) this.pendingTieStart = null;
    if (this.pendingSlurStart === noteId) this.pendingSlurStart = null;
    this.emitChange();
    this.drawScore();
    return true;
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
    this.model.setScore(score, { defaultTitle: this.t('score.untitled') });
    this.selectedIds.clear();
    this.pendingTieStart = null;
    this.pendingSlurStart = null;
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

  setKeySignatureAt(measure, fifths) {
    this.pushHistory();
    this.model.setKeyAtMeasure(measure, fifths);
    this.hideContextMenu();
    this.emitChange();
    this.updateToolbar();
    this.updateMeasureToolbar();
    this.drawScore();
  }

  setTempoAtMeasure(measure, tempo) {
    this.pushHistory();
    this.model.setTempoAtMeasure(measure, tempo);
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

  importMusicXML(xmlSource) {
    const score = importMusicXML(xmlSource, { defaultTitle: this.t('score.untitled') });
    this.setScore(score);
    return score;
  }

  setLanguage(language) {
    const normalized = normalizeLanguage(language);
    if (normalized === this.options.language) return;
    this.options.language = normalized;
    this.t = createTranslator(normalized);
    this.render();
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
    this.model.setScore(this.undoStack.at(-1));
    this.selectedIds.clear();
    this.pendingTieStart = null;
    this.pendingSlurStart = null;
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
    this.pendingTieStart = null;
    this.pendingSlurStart = null;
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
    await playFromAudio(this);
  }

  async playNote(note) {
    await playNoteFromAudio(this, note);
  }

  stopPlayback() {
    stopPlaybackFromAudio(this);
  }

  tickPlayback() {
    tickPlaybackFromAudio(this);
  }

  getPlaybackPosition() {
    return getPlaybackPositionFromAudio(this);
  }

  updatePlaybackCursor(position = null) {
    updatePlaybackCursorFromAudio(this, position);
  }

  removePlaybackCursor() {
    removePlaybackCursorFromAudio(this);
  }
}



