import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

function buildRequireApi() {
  const require = createRequire(import.meta.url);
  return require(path.join(rootDir, 'dist/partitura-editor.js'));
}

function readBrowserBundle() {
  const bundlePath = path.join(rootDir, 'dist/partitura-modular.js');
  return fs.readFileSync(bundlePath, 'utf8');
}

function testToggleRestLogic(requireApi) {
  const notes = [
    {
      id: 'n1',
      measure: 0,
      beat: 0,
      duration: 1,
      pitch: { step: 'C', octave: 4, alter: 0 }
    }
  ];

  const editor = {
    selectedIds: new Set(['n1']),
    options: { noteKind: 'note' },
    undoStack: [],
    pushed: 0,
    changed: 0,
    toolbarUpdates: 0,
    redraws: 0,
    model: {
      getNote(id) {
        return notes.find((n) => n.id === id) || null;
      },
      updateNote(id, patch) {
        const note = notes.find((n) => n.id === id);
        if (!note) return null;
        if (Object.hasOwn(patch, 'pitch')) note.pitch = patch.pitch;
        return note;
      }
    },
    pushHistory() {
      this.pushed += 1;
      this.undoStack.push({ marker: this.pushed });
    },
    emitChange() {
      this.changed += 1;
    },
    updateToolbar() {
      this.toolbarUpdates += 1;
    },
    drawScore() {
      this.redraws += 1;
    }
  };

  requireApi.ScoreEditor.prototype.convertSelectedNoteToRest.call(editor);
  assert(notes[0].pitch === null, 'R should convert selected note to rest');
  assert(editor.options.noteKind === 'rest', 'noteKind should switch to rest');

  requireApi.ScoreEditor.prototype.convertSelectedNoteToRest.call(editor);
  assert(notes[0].pitch?.step === 'C', 'R again should convert rest back to note');
  assert(editor.options.noteKind === 'note', 'noteKind should switch back to note');
}

function main() {
  const requireApi = buildRequireApi();

  run('CommonJS API exports ScoreEditor/exportMusicXML/createSvg', () => {
    assert(typeof requireApi.ScoreEditor === 'function', 'ScoreEditor export missing');
    assert(typeof requireApi.exportMusicXML === 'function', 'exportMusicXML export missing');
    assert(typeof requireApi.createSvg === 'function', 'createSvg export missing');
  });

  run('MusicXML export includes dotted note and rest tags', () => {
    const xml = requireApi.exportMusicXML({
      measures: 1,
      timeSignature: { beats: 4, beatType: 4 },
      notes: [
        { measure: 0, beat: 0, duration: 1.5, pitch: { step: 'C', octave: 4, alter: 0 } },
        { measure: 0, beat: 1.5, duration: 0.5, pitch: null }
      ]
    });
    assert(xml.includes('<dot/>'), 'Expected <dot/> in MusicXML');
    assert(xml.includes('<rest/>'), 'Expected <rest/> in MusicXML');
  });

  run('MusicXML export includes tuplet time-modification and notation', () => {
    const xml = requireApi.exportMusicXML({
      measures: 1,
      timeSignature: { beats: 4, beatType: 4 },
      notes: [
        {
          measure: 0,
          beat: 0,
          duration: 1 / 3,
          displayDuration: 0.5,
          tuplet: { groupId: 't1', count: 3, index: 1 },
          pitch: { step: 'C', octave: 4, alter: 0 }
        },
        {
          measure: 0,
          beat: 1 / 3,
          duration: 1 / 3,
          displayDuration: 0.5,
          tuplet: { groupId: 't1', count: 3, index: 2 },
          pitch: { step: 'D', octave: 4, alter: 0 }
        },
        {
          measure: 0,
          beat: 2 / 3,
          duration: 1 / 3,
          displayDuration: 0.5,
          tuplet: { groupId: 't1', count: 3, index: 3 },
          pitch: { step: 'E', octave: 4, alter: 0 }
        }
      ]
    });

    assert(xml.includes('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>'), 'Expected tuplet <time-modification> in MusicXML');
    assert(xml.includes('<tuplet type="start" number="1"/>'), 'Expected tuplet start notation in MusicXML');
    assert(xml.includes('<tuplet type="stop" number="1"/>'), 'Expected tuplet stop notation in MusicXML');
  });

  run('MusicXML exports key signature changes', () => {
    const xml = requireApi.exportMusicXML({
      measures: 3,
      timeSignature: { beats: 4, beatType: 4 },
      keyChanges: [
        { measure: 0, fifths: 2 },
        { measure: 1, fifths: -3 }
      ],
      notes: [
        { measure: 0, beat: 0, duration: 1, pitch: { step: 'C', octave: 4, alter: 0 } }
      ]
    });

    assert(xml.includes('<measure number="2">'), 'Expected second measure in export');
    assert(xml.includes('<key><fifths>-3</fifths></key>'), 'Expected key change attributes in export');
  });

  run('MusicXML exports tempo changes', () => {
    const xml = requireApi.exportMusicXML({
      measures: 2,
      timeSignature: { beats: 4, beatType: 4 },
      tempoChanges: [
        { measure: 0, tempo: 96 },
        { measure: 1, tempo: 120 }
      ],
      notes: [
        { measure: 0, beat: 0, duration: 1, pitch: { step: 'C', octave: 4, alter: 0 } }
      ]
    });

    assert(xml.includes('<sound tempo="96"/>'), 'Expected initial tempo in export');
    assert(xml.includes('<sound tempo="120"/>'), 'Expected later tempo change in export');
  });

  run('Browser IIFE bundle exposes PartituraJS symbol', () => {
    const source = readBrowserBundle();
    assert(source.includes('var PartituraJS'), 'IIFE PartituraJS symbol not found');
    assert(source.includes('ScoreEditor'), 'IIFE bundle is missing ScoreEditor');
    assert(source.includes('exportMusicXML'), 'IIFE bundle is missing exportMusicXML');
  });

  run('R toggle logic converts note <-> rest', () => {
    testToggleRestLogic(requireApi);
  });

  console.log('All verify checks passed');
}

main();
