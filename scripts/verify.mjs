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
