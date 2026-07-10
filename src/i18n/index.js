const defaultLanguage = 'es';

export const translations = {
  es: {
    score: {
      untitled: 'Sin título'
    },
    editor: {
      invalidContainer: 'ScoreEditor necesita un contenedor válido.',
      lyricPrompt: 'Letra/sílaba para esta nota:',
      titlePrompt: 'Título de la partitura:'
    },
    toolbar: {
      measureInsert: 'Agregar notas',
      measureSelect: 'Seleccionar y mover',
      deleteSelection: 'Borrar selección',
      undo: 'Deshacer',
      redo: 'Rehacer',
      play: 'Reproducir',
      stop: 'Detener',
      noteDuration: 'Duración de nota',
      otherOptions: 'Otras opciones',
      clef: 'Clave',
      toggleToRest: 'Cambiar a silencio',
      toggleToNote: 'Cambiar a nota',
      note: 'Nota',
      rest: 'Silencio',
      clefSol: 'Clave de Sol',
      clefFa: 'Clave de Fa',
      clefDo: 'Clave de Do'
    },
    durations: {
      whole: 'Redonda',
      half: 'Blanca',
      quarter: 'Negra',
      eighth: 'Corchea',
      sixteenth: 'Semicorchea',
      thirtySecond: 'Fusa',
      sixtyFourth: 'Semifusa'
    },
    contextMenu: {
      measureInsertBefore: 'Agregar compás antes',
      measureInsertAfter: 'Agregar compás después',
      measureDelete: 'Eliminar compás',
      noteDelete: 'Eliminar nota',
      noteToggleDotAdd: 'Agregar puntillo',
      noteToggleDotRemove: 'Quitar puntillo',
      tieStart: 'Iniciar ligadura de tiempo',
      tieEndActive: 'Cerrar ligadura de tiempo aquí',
      tieEndInactive: 'Cerrar ligadura de tiempo aquí (sin inicio)',
      slurStart: 'Iniciar ligadura de expresión',
      slurEndActive: 'Cerrar ligadura de expresión aquí',
      slurEndInactive: 'Cerrar ligadura de expresión aquí (sin inicio)',
      clearLigatures: 'Quitar ligaduras de esta nota'
    },
    demo: {
      title: 'PartituraJS',
      intro: 'Haz clic en el pentagrama para crear notas. Arrástralas para cambiar tono o posición. Arrastra una clave de Sol, Fa o Do sobre el pentagrama para cambiar la clave.',
      json: 'Mostrar JSON',
      musicxml: 'Descargar MusicXML',
      outputLabel: 'Salida JSON',
      outputPlaceholder: 'Aquí aparecerá el JSON',
      languageLabel: 'Idioma',
      languageEs: 'Español',
      languageEn: 'Inglés'
    }
  },
  en: {
    score: {
      untitled: 'Untitled'
    },
    editor: {
      invalidContainer: 'ScoreEditor needs a valid container.',
      lyricPrompt: 'Lyric/syllable for this note:',
      titlePrompt: 'Score title:'
    },
    toolbar: {
      measureInsert: 'Insert notes',
      measureSelect: 'Select and move',
      deleteSelection: 'Delete selection',
      undo: 'Undo',
      redo: 'Redo',
      play: 'Play',
      stop: 'Stop',
      noteDuration: 'Note duration',
      otherOptions: 'Other options',
      clef: 'Clef',
      toggleToRest: 'Change to rest',
      toggleToNote: 'Change to note',
      note: 'Note',
      rest: 'Rest',
      clefSol: 'Treble clef',
      clefFa: 'Bass clef',
      clefDo: 'C clef'
    },
    durations: {
      whole: 'Whole note',
      half: 'Half note',
      quarter: 'Quarter note',
      eighth: 'Eighth note',
      sixteenth: 'Sixteenth note',
      thirtySecond: 'Thirty-second note',
      sixtyFourth: 'Sixty-fourth note'
    },
    contextMenu: {
      measureInsertBefore: 'Insert measure before',
      measureInsertAfter: 'Insert measure after',
      measureDelete: 'Delete measure',
      noteDelete: 'Delete note',
      noteToggleDotAdd: 'Add dot',
      noteToggleDotRemove: 'Remove dot',
      tieStart: 'Start tie',
      tieEndActive: 'End tie here',
      tieEndInactive: 'End tie here (no start)',
      slurStart: 'Start slur',
      slurEndActive: 'End slur here',
      slurEndInactive: 'End slur here (no start)',
      clearLigatures: 'Clear ligatures from this note'
    },
    demo: {
      title: 'PartituraJS',
      intro: 'Click the staff to create notes. Drag them to change pitch or position. Drag a treble, bass, or C clef onto the staff to change the clef.',
      json: 'Show JSON',
      musicxml: 'Download MusicXML',
      outputLabel: 'JSON output',
      outputPlaceholder: 'The JSON will appear here',
      languageLabel: 'Language',
      languageEs: 'Spanish',
      languageEn: 'English'
    }
  }
};

export function normalizeLanguage(language) {
  return String(language || '').toLowerCase().startsWith('en') ? 'en' : defaultLanguage;
}

function resolvePath(object, path) {
  return path.split('.').reduce((value, key) => (value && Object.hasOwn(value, key) ? value[key] : undefined), object);
}

function format(template, params) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => (
    Object.hasOwn(params, key) ? String(params[key]) : `{${key}}`
  ));
}

export function translate(language, key, params = {}) {
  const normalized = normalizeLanguage(language);
  const value = resolvePath(translations[normalized], key) ?? resolvePath(translations[defaultLanguage], key) ?? key;
  return format(value, params);
}

export function createTranslator(language) {
  return (key, params = {}) => translate(language, key, params);
}