import { normalizeScore } from '../model/normalizeScore.js';
import { clefConfig } from '../music/clef.js';
import { durationType, isDottedDuration } from '../music/duration.js';

function textOf(element, selector) {
  const node = element?.querySelector(selector);
  return node?.textContent?.trim() || '';
}

function numberOf(element, selector, fallback = 0) {
  const value = Number(textOf(element, selector));
  return Number.isFinite(value) ? value : fallback;
}

function clefFromMusicXml(sign, line) {
  const normalizedSign = String(sign || '').trim().toUpperCase();
  const normalizedLine = Number(line || 0);
  if (normalizedSign === 'F' || normalizedLine === 4) return 'fa';
  if (normalizedSign === 'C' || normalizedLine === 3) return 'do';
  return 'sol';
}

function typeToBeats(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'whole') return 4;
  if (normalized === 'half') return 2;
  if (normalized === 'quarter') return 1;
  if (normalized === 'eighth') return 0.5;
  if (normalized === '16th') return 0.25;
  if (normalized === '32nd') return 0.125;
  if (normalized === '64th') return 0.0625;
  return 1;
}

function parseDurationBeats(noteElement, divisions) {
  const durationDivisions = numberOf(noteElement, ':scope > duration', Number.NaN);
  if (Number.isFinite(durationDivisions) && durationDivisions > 0) {
    return durationDivisions / Math.max(1, divisions);
  }

  const base = typeToBeats(textOf(noteElement, ':scope > type'));
  const dots = noteElement.querySelectorAll(':scope > dot').length;
  let factor = 1;
  let increment = 0.5;
  for (let idx = 0; idx < dots; idx++) {
    factor += increment;
    increment /= 2;
  }
  return base * factor;
}

function parseDisplayDurationBeats(noteElement, durationBeats) {
  const typeText = textOf(noteElement, ':scope > type');
  const base = typeToBeats(typeText);
  const hasType = !!typeText;
  const dots = noteElement.querySelectorAll(':scope > dot').length;
  let factor = 1;
  let increment = 0.5;
  for (let idx = 0; idx < dots; idx++) {
    factor += increment;
    increment /= 2;
  }

  if (hasType) return base * factor;

  const actualNotes = Math.round(numberOf(noteElement, ':scope > time-modification > actual-notes', Number.NaN));
  const normalNotes = Math.round(numberOf(noteElement, ':scope > time-modification > normal-notes', Number.NaN));
  if (Number.isFinite(actualNotes) && actualNotes > 0 && Number.isFinite(normalNotes) && normalNotes > 0) {
    return durationBeats * (actualNotes / normalNotes);
  }
  return durationBeats;
}

function parseTupletState(noteElement) {
  const actualNotes = Math.round(numberOf(noteElement, ':scope > time-modification > actual-notes', Number.NaN));
  const normalNotes = Math.round(numberOf(noteElement, ':scope > time-modification > normal-notes', Number.NaN));
  if (!Number.isFinite(actualNotes) || actualNotes < 2) return null;
  if (!Number.isFinite(normalNotes) || normalNotes < 1) return null;

  const tuplets = [...noteElement.querySelectorAll(':scope > notations > tuplet')];
  const startNode = tuplets.find((node) => String(node.getAttribute('type') || '').toLowerCase() === 'start') || null;
  const stopNode = tuplets.find((node) => String(node.getAttribute('type') || '').toLowerCase() === 'stop') || null;
  const number = Number(startNode?.getAttribute('number') || stopNode?.getAttribute('number') || 1) || 1;
  return {
    actualNotes,
    normalNotes,
    number,
    start: !!startNode,
    stop: !!stopNode
  };
}

function parsePitch(noteElement) {
  if (noteElement.querySelector(':scope > rest')) return null;
  return {
    step: textOf(noteElement, ':scope > pitch > step') || 'C',
    alter: numberOf(noteElement, ':scope > pitch > alter', 0),
    octave: numberOf(noteElement, ':scope > pitch > octave', 4)
  };
}

function hasNotationByType(noteElement, tag, type) {
  return [...noteElement.querySelectorAll(`:scope > notations > ${tag}`)]
    .some((node) => String(node.getAttribute('type') || '').toLowerCase() === type);
}

function parseTies(noteElement) {
  const tieNodes = [...noteElement.querySelectorAll(':scope > tie')];
  const tieStart = tieNodes.some((node) => String(node.getAttribute('type') || '').toLowerCase() === 'start')
    || hasNotationByType(noteElement, 'tied', 'start');
  const tieStop = tieNodes.some((node) => String(node.getAttribute('type') || '').toLowerCase() === 'stop')
    || hasNotationByType(noteElement, 'tied', 'stop');
  return { tieStart, tieStop };
}

function parseSlurs(noteElement) {
  return {
    slurStart: hasNotationByType(noteElement, 'slur', 'start'),
    slurStop: hasNotationByType(noteElement, 'slur', 'stop')
  };
}

function ensureDomParser() {
  const DomParserCtor = globalThis.DOMParser;
  if (!DomParserCtor) throw new Error('DOMParser no está disponible en este entorno');
  return DomParserCtor;
}

function createParsedScore(scoreRoot, measureCount, defaultTitle = 'Untitled') {
  return {
    title: textOf(scoreRoot, 'work > work-title') || defaultTitle,
    composer: textOf(scoreRoot, 'identification > creator[type="composer"]') || '',
    tempo: 90,
    tempoChanges: [{ measure: 0, tempo: 90 }],
    measures: Math.max(1, measureCount),
    clef: 'sol',
    key: { fifths: 0 },
    keyChanges: [{ measure: 0, fifths: 0 }],
    timeSignature: { beats: 4, beatType: 4 },
    notes: []
  };
}

function upsertKeyChange(keyChanges, measure, fifths) {
  const idx = keyChanges.findIndex((event) => event.measure === measure);
  const next = { measure, fifths };
  if (idx >= 0) keyChanges[idx] = next;
  else keyChanges.push(next);
}

function upsertTempoChange(tempoChanges, measure, tempo) {
  const idx = tempoChanges.findIndex((event) => event.measure === measure);
  const next = { measure, tempo };
  if (idx >= 0) tempoChanges[idx] = next;
  else tempoChanges.push(next);
}

function applyTempo(scoreRoot, parsed) {
  const firstSoundTempo = numberOf(scoreRoot, 'sound[tempo]', Number.NaN);
  if (Number.isFinite(firstSoundTempo) && firstSoundTempo > 0) {
    parsed.tempo = firstSoundTempo;
    upsertTempoChange(parsed.tempoChanges, 0, firstSoundTempo);
  }
}

function parseMeasureTempo(measure) {
  const direct = numberOf(measure, ':scope > sound[tempo]', Number.NaN);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fromDirection = numberOf(measure, ':scope > direction > sound[tempo]', Number.NaN);
  if (Number.isFinite(fromDirection) && fromDirection > 0) return fromDirection;
  return Number.NaN;
}

function applyMeasureAttributes(attrs, parsed, currentDivisions, measureIndex) {
  if (!attrs) return currentDivisions;
  let divisions = currentDivisions;
  const parsedDivisions = numberOf(attrs, ':scope > divisions', Number.NaN);
  if (Number.isFinite(parsedDivisions) && parsedDivisions > 0) divisions = parsedDivisions;

  const beats = numberOf(attrs, ':scope > time > beats', Number.NaN);
  const beatType = numberOf(attrs, ':scope > time > beat-type', Number.NaN);
  if (Number.isFinite(beats) && beats > 0) parsed.timeSignature.beats = beats;
  if (Number.isFinite(beatType) && beatType > 0) parsed.timeSignature.beatType = beatType;

  const fifths = numberOf(attrs, ':scope > key > fifths', Number.NaN);
  if (Number.isFinite(fifths)) {
    parsed.key = { fifths };
    upsertKeyChange(parsed.keyChanges, measureIndex, fifths);
  }

  const clefSign = textOf(attrs, ':scope > clef > sign');
  const clefLine = numberOf(attrs, ':scope > clef > line', 0);
  if (clefSign) parsed.clef = clefFromMusicXml(clefSign, clefLine);
  return divisions;
}

function parseMeasureNotes(measure, measureIndex, divisions, tupletState) {
  const notes = [];
  let cursorDivisions = 0;
  let lastStartDivisions = 0;

  const handleNote = (noteElement) => {
    const isChord = !!noteElement.querySelector(':scope > chord');
    const startDivisions = isChord ? lastStartDivisions : cursorDivisions;
    const durationBeats = parseDurationBeats(noteElement, divisions);
    const displayDuration = parseDisplayDurationBeats(noteElement, durationBeats);
    const durationDiv = Math.max(1, Math.round(durationBeats * divisions));
    const ties = parseTies(noteElement);
    const slurs = parseSlurs(noteElement);
    const tupletInfo = parseTupletState(noteElement);

    let tuplet = null;
    if (tupletInfo) {
      const slot = Number(tupletInfo.number) || 1;
      let active = tupletState.activeByNumber.get(slot);

      if (!active || tupletInfo.start) {
        active = {
          groupId: `tuplet-${tupletState.nextGroupId++}`,
          count: tupletInfo.actualNotes,
          index: 1
        };
        tupletState.activeByNumber.set(slot, active);
      }

      tuplet = {
        groupId: active.groupId,
        count: active.count,
        index: active.index
      };
      active.index += 1;

      if (tupletInfo.stop || active.index > active.count) {
        tupletState.activeByNumber.delete(slot);
      }
    }

    notes.push({
      measure: measureIndex,
      beat: startDivisions / Math.max(1, divisions),
      duration: durationBeats,
      displayDuration,
      tuplet,
      pitch: parsePitch(noteElement),
      lyric: textOf(noteElement, ':scope > lyric > text'),
      tieStart: ties.tieStart,
      tieStop: ties.tieStop,
      slurStart: slurs.slurStart,
      slurStop: slurs.slurStop
    });

    lastStartDivisions = startDivisions;
    if (!isChord) cursorDivisions += durationDiv;
  };

  for (const child of measure.children) {
    if (child.tagName === 'backup') {
      cursorDivisions = Math.max(0, cursorDivisions - numberOf(child, ':scope > duration', 0));
      continue;
    }
    if (child.tagName === 'forward') {
      cursorDivisions += numberOf(child, ':scope > duration', 0);
      continue;
    }
    if (child.tagName !== 'note') continue;
    handleNote(child);
  }

  return notes;
}

export function importMusicXML(xmlSource, options = {}) {
  const DomParserCtor = ensureDomParser();
  const parser = new DomParserCtor();
  const doc = parser.parseFromString(String(xmlSource || ''), 'application/xml');

  if (doc.querySelector('parsererror')) throw new Error('MusicXML inválido');
  const scoreRoot = doc.querySelector('score-partwise');
  if (!scoreRoot) throw new Error('Solo se soporta MusicXML partwise');

  const part = scoreRoot.querySelector('part');
  if (!part) throw new Error('No se encontró ningún part en MusicXML');

  const measures = [...part.querySelectorAll(':scope > measure')];
  const parsed = createParsedScore(scoreRoot, measures.length, options.defaultTitle);
  if (options.defaultTitle) parsed.title = options.defaultTitle;
  applyTempo(scoreRoot, parsed);

  let divisions = 1;
  const tupletState = {
    activeByNumber: new Map(),
    nextGroupId: 1
  };
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
    const measure = measures[measureIndex];
    const attrs = measure.querySelector(':scope > attributes');
    divisions = applyMeasureAttributes(attrs, parsed, divisions, measureIndex);
    const measureTempo = parseMeasureTempo(measure);
    if (Number.isFinite(measureTempo) && measureTempo > 0) {
      parsed.tempo = measureTempo;
      upsertTempoChange(parsed.tempoChanges, measureIndex, measureTempo);
    }
    parsed.notes.push(...parseMeasureNotes(measure, measureIndex, divisions, tupletState));
  }

  return normalizeScore(parsed);
}

export function exportMusicXML(scoreInput) {
  const score = normalizeScore(scoreInput);
  const divisions = 4;
  const escapeXml = (text = '') => String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

  const keyChanges = Array.isArray(score.keyChanges) ? score.keyChanges : [{ measure: 0, fifths: score.key?.fifths || 0 }];
  const keyByMeasure = new Map(keyChanges.map((event) => [Number(event.measure || 0), Number(event.fifths || 0)]));
  const tempoChanges = Array.isArray(score.tempoChanges) ? score.tempoChanges : [{ measure: 0, tempo: score.tempo || 90 }];
  const tempoByMeasure = new Map(tempoChanges.map((event) => [Number(event.measure || 0), Number(event.tempo || 90)]));

  const notesByMeasure = Array.from({ length: score.measures }, () => []);
  for (const note of score.notes) {
    if (note.measure >= 0 && note.measure < score.measures) notesByMeasure[note.measure].push(note);
  }

  const buildPitchXml = (pitch) => {
    const alterXml = pitch.alter ? `<alter>${pitch.alter}</alter>` : '';
    return `<pitch><step>${pitch.step}</step>${alterXml}<octave>${pitch.octave}</octave></pitch>`;
  };

  const tupletTimeModification = (note) => {
    const count = Math.round(Number(note.tuplet?.count));
    if (!Number.isFinite(count) || count < 2) return null;
    return {
      actualNotes: count,
      normalNotes: Math.max(1, count - 1)
    };
  };

  const xmlMeasures = notesByMeasure.map((notes, measureIndex) => {
    const clef = clefConfig(score.clef);
    const parts = [];
    const hasKeyChange = keyByMeasure.has(measureIndex);
    const keyFifths = keyByMeasure.get(measureIndex);
    if (measureIndex === 0) {
      const firstFifths = keyFifths ?? score.key.fifths ?? 0;
      parts.push(
        `<divisions>${divisions}</divisions>`,
        `<key><fifths>${firstFifths}</fifths></key>`,
        `<time><beats>${score.timeSignature.beats}</beats><beat-type>${score.timeSignature.beatType}</beat-type></time>`,
        `<clef><sign>${clef.xmlSign}</sign><line>${clef.xmlLine}</line></clef>`
      );
    } else if (hasKeyChange) {
      parts.push(`<key><fifths>${keyFifths}</fifths></key>`);
    }
    const attributes = parts.length ? `\n      <attributes>${parts.join('')}</attributes>` : '';
    const hasTempoChange = tempoByMeasure.has(measureIndex);
    const tempoDirection = hasTempoChange
      ? `\n      <direction><sound tempo="${Math.round(Number(tempoByMeasure.get(measureIndex) || score.tempo || 90))}"/></direction>`
      : '';

    const xmlNotes = notes.map((note) => {
      const dur = Math.max(1, Math.round(note.duration * divisions));
      const visualDuration = note.displayDuration || note.duration;
      const type = durationType(visualDuration);
      const dot = isDottedDuration(visualDuration) ? '<dot/>' : '';
      const pitch = note.pitch;
      const lyric = note.lyric ? `<lyric><text>${escapeXml(note.lyric)}</text></lyric>` : '';
      const tieStart = note.tieStart ? '<tie type="start"/>' : '';
      const tieStop = note.tieStop ? '<tie type="stop"/>' : '';
      const timeModification = tupletTimeModification(note);
      const timeModificationXml = timeModification
        ? `<time-modification><actual-notes>${timeModification.actualNotes}</actual-notes><normal-notes>${timeModification.normalNotes}</normal-notes></time-modification>`
        : '';
      const notations = [
        note.tieStart ? '<tied type="start"/>' : '',
        note.tieStop ? '<tied type="stop"/>' : '',
        note.slurStart ? '<slur type="start" number="1"/>' : '',
        note.slurStop ? '<slur type="stop" number="1"/>' : '',
        note.tuplet?.index === 1 ? '<tuplet type="start" number="1"/>' : '',
        note.tuplet?.index === note.tuplet?.count ? '<tuplet type="stop" number="1"/>' : ''
      ].filter(Boolean);
      const notationsXml = notations.length ? `<notations>${notations.join('')}</notations>` : '';
      const noteBody = pitch ? buildPitchXml(pitch) : '<rest/>';
      return `
      <note>
        ${noteBody}
        ${tieStart}${tieStop}
        <duration>${dur}</duration>
        ${timeModificationXml}
        <type>${type}</type>${lyric}
        ${dot}
        ${notationsXml}
      </note>`;
    }).join('');

    return `
    <measure number="${measureIndex + 1}">${attributes}${tempoDirection}${xmlNotes}
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
