import { normalizeScore } from '../model/normalizeScore.js';
import { clefConfig } from '../music/clef.js';
import { durationType, isDottedDuration } from '../music/duration.js';

export function exportMusicXML(scoreInput) {
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
      const dot = isDottedDuration(note.duration) ? '<dot/>' : '';
      const pitch = note.pitch;
      const lyric = note.lyric ? `<lyric><text>${escapeXml(note.lyric)}</text></lyric>` : '';
      const noteBody = pitch
        ? `<pitch><step>${pitch.step}</step>${pitch.alter ? `<alter>${pitch.alter}</alter>` : ''}<octave>${pitch.octave}</octave></pitch>`
        : '<rest/>';
      return `
      <note>
        ${noteBody}
        <duration>${dur}</duration>
        <type>${type}</type>${lyric}
        ${dot}
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
