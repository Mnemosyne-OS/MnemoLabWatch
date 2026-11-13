/**
 * strings.ts — everything Lab Watch says, in the languages it says it in.
 *
 * Same contract as MnemoScience: the host broadcasts its language, a key
 * missing from a locale falls back to English key by key, and an unknown
 * placeholder stays visible. en / fr / es are written; de / pt / ru / zh read
 * English. Titles and lab names are never translated: they are the sources'.
 */

export const LANGS = ['en', 'fr', 'es', 'de', 'pt', 'ru', 'zh'] as const;
export type Lang = (typeof LANGS)[number];

const en = {
  'app.title': 'Lab watch',
  'app.reading': 'Reading the watch…',

  'status.daily': 'Once a day',
  'status.lastRun': 'Last pass {date}',
  'status.firstPass': 'First pass not made yet. It announces nothing.',
  'status.lastError': 'Last pass failed: {error}',

  'error.title': 'The watch could not be read',
  'error.retry': 'Retry',

  'filter.all': 'All',
  'filter.label': 'Lab',

  'list.count': 'Arrivals · {n}',
  'list.empty': 'Nothing new since the last pass.',
  'list.allSeen': 'Mark all as seen',
  'list.otherPosts': 'Other OpenAI posts · {n}',
  'list.hideOther': 'Hide',

  'card.paper': 'Paper',
  'card.post': 'OpenAI post',
  'card.published': 'Published {date}',
  'card.noDate': 'No publication date',
  'card.recorded': 'Picked up {date}',
  'card.open': 'Open',
  'card.seen': 'Seen',
  'card.records': '{n} records',
  'card.attributed': 'Lab as attributed by OpenAlex',
  'card.abstractShort': 'Abstract: {n} words, too short to read',
  'card.abstractMissing': 'No abstract',
  'card.noDetails': 'Details not read: title from the watch',

  'details.worksFailed': 'OpenAlex details not read: {error}',
  'details.feedFailed': 'OpenAI feed not read: {error}',
  'box.wasFull': 'The watch\'s box was full on {date}. The host keeps the last 100 arrivals: older ones may have been dropped before Lab Watch kept them.',
  'box.dismiss': 'Understood',
  'box.notMoved': 'Arrivals left in the watch\'s box: {error}. The box keeps the last 100.',
  'box.stateFull': 'Arrivals left in the watch\'s box: Lab Watch\'s saved state is full. Mark arrivals as seen to make room. The box keeps the last 100.',
  'box.crossingDropped': 'The last crossing was not kept: the saved state needed its room for the arrivals. Run it again to see it.',
  'action.failed': 'Not done: {error}',

  'topics.open': 'Topics',
  'topics.title': 'Your topics',
  'topics.byAgent': 'Written by the agent: rewrite them in your words',
  'topics.placeholder': 'A topic, in your words',
  'topics.add': 'Add a topic',
  'topics.remove': 'Remove',
  'topics.save': 'Save',
  'topics.cancel': 'Cancel',

  'judge.read': 'Read {n} texts · {calls} model calls',
  'judge.reading': 'Reading {done}/{total}',
  'judge.stop': 'Stop',
  'judge.cost': 'Last reading: {calls} calls · {usd} of credits',
  'judge.costUnknown': 'Last reading: {calls} calls · cost not measured',
  'judge.zeroNote': 'No Mnemosyne credit spent: a local model or your own key does not use them',
  'judge.stateUnreadable': 'Topics and verdicts not read: {error}. Nothing is written.',

  'verdict.touches': 'Touches · {topic}',
  'verdict.postNote': 'Read on the title and summary',
  'verdict.pending': 'Not read yet',
  'verdict.noneFolded': 'None of your topics · {n}',
  'verdict.unverified': 'Not verified: {why}',
  'why.abstract-missing': 'no abstract to read',
  'why.abstract-short': 'abstract too short',
  'why.answer-unreadable': 'unreadable answer',
  'why.topic-unknown': 'unknown topic number',
  'why.quote-not-found': 'quote not found in the text',
  'why.failed': 'model call failed',

  'bench.title': 'Lot 0 bench · {n} publications',
  'bench.run': 'Run · at most {calls} model calls',
  'bench.summary': 'Agree {agree} · missed {missed} · false alerts {falseAlerts} · not verified {unverified} · doubtful {doubtful}',

  'view.label': 'View',
  'view.arrivals': 'Arrivals',
  'view.cross': 'Cross a text',

  'corpus.title': 'Lab publications loaded',
  'corpus.loaded': '{n} loaded · {date}',
  'corpus.none': 'Not loaded',
  'corpus.partial': '{n} loaded · stopped',
  'corpus.load': 'Load',
  'corpus.reload': 'Reload',
  'corpus.page': 'Page {page}/{pages}',
  'corpus.firstPage': 'Page {page}',
  'corpus.unavailable': 'The publication cache is not available: {error}',

  'text.title': 'Your text',
  'text.placeholder': 'Paste your text, or pick a file',
  'text.pick': 'Pick a file',
  'text.filter': 'Text, PDF or Word',
  'text.passages': 'Passages · {n}',
  'text.truncated': 'The host cut this document: only its start is crossed',
  'text.notEnglish': 'Not in English: English search words are asked first, 2 calls a passage',
  'text.goesToModel': 'Each passage goes to the model set in Mnemosyne OS',

  'cross.run': 'Cross {n} passages · {calls} model calls at most',
  'cross.needCorpus': 'Load a lab first',
  'cross.running': 'Crossing {done}/{total}',
  'cross.counts': 'Supported {supports} · partly {partial} · diverge {diverges} · absent {absent} · not verified {unverified}',
  'cross.base': 'Each passage was shown the {k} publications closest by their words, out of {n} loaded ({labs})',
  'cross.passage': 'Passage {n}',
  'cross.supports': 'Supported',
  'cross.partial': 'Partly',
  'cross.missing': 'Missing: {what}',
  'cross.diverges': 'Diverges · yours to judge',
  'cross.divergesNote': 'Verdict not measured yet',
  'cross.absent': 'Absent: nothing among the {k} publications closest by their words, out of {n} loaded',
  'cross.absentNone': 'Absent: no loaded publication shares its words',
  'cross.yours': 'Your text',
  'cross.theirs': 'The publication',
  'cross.notKept': 'This crossing is too long to be kept: closing the window loses it',
  'why.pub-unknown': 'unknown publication number',
  'why.claim-not-found': 'sentence not found in your text',
  'judge.stopped': 'stopped: {why}',
  'refusal.quota': 'no Mnemosyne credits left',
  'refusal.auth': 'the model key was refused',
  'cross.loadedUntil': 'Publications known up to {date}',
  'cross.notSaved': 'This crossing is not kept: the saved topics and verdicts could not be read',
  'corpus.full': '{n} full texts',
  'full.read': 'Read the full text',
  'full.reading': 'Reading the full text…',
  'full.done': 'Full text read: {n} passages. Cross again to use it',
  'full.part': 'Passage {n} of the full text',
  'full.truncated': 'cut by the host',
  'licence.line': 'Licence: {licence}',
  'licence.none': 'Licence not given by OpenAlex',
};

export type Key = keyof typeof en;
export type Translate = (key: Key, vars?: Record<string, string | number>) => string;
type Dict = Partial<Record<Key, string>>;

const fr: Dict = {
  'app.title': 'Veille des labos',
  'app.reading': 'Lecture de la veille…',

  'status.daily': 'Une fois par jour',
  'status.lastRun': 'Dernière passe {date}',
  'status.firstPass': 'Première passe pas encore faite. Elle n\'annonce rien.',
  'status.lastError': 'Dernière passe en échec : {error}',

  'error.title': 'La veille n\'a pas pu être lue',
  'error.retry': 'Réessayer',

  'filter.all': 'Tous',
  'filter.label': 'Labo',

  'list.count': 'Arrivées · {n}',
  'list.empty': 'Rien de neuf depuis la dernière passe.',
  'list.allSeen': 'Tout marquer comme vu',
  'list.otherPosts': 'Autres billets d\'OpenAI · {n}',
  'list.hideOther': 'Masquer',

  'card.paper': 'Publication',
  'card.post': 'Billet OpenAI',
  'card.published': 'Publié le {date}',
  'card.noDate': 'Sans date de publication',
  'card.recorded': 'Relevé le {date}',
  'card.open': 'Ouvrir',
  'card.seen': 'Vu',
  'card.records': '{n} fiches',
  'card.attributed': 'Labo attribué par OpenAlex',
  'card.abstractShort': 'Résumé : {n} mots, trop court pour être lu',
  'card.abstractMissing': 'Sans résumé',
  'card.noDetails': 'Détails non lus : titre donné par la veille',

  'details.worksFailed': 'Détails OpenAlex non lus : {error}',
  'details.feedFailed': 'Fil d\'OpenAI non lu : {error}',
  'box.wasFull': 'La boîte de la veille était pleine le {date}. L\'hôte garde les 100 dernières arrivées : de plus anciennes ont pu être perdues avant que Lab Watch les garde.',
  'box.dismiss': 'Compris',
  'box.notMoved': 'Arrivées laissées dans la boîte de la veille : {error}. La boîte garde les 100 dernières.',
  'box.stateFull': 'Arrivées laissées dans la boîte de la veille : l\'état sauvegardé de Lab Watch est plein. Marque des arrivées comme vues pour faire de la place. La boîte garde les 100 dernières.',
  'box.crossingDropped': 'Le dernier croisement n\'a pas été gardé : l\'état sauvegardé avait besoin de sa place pour les arrivées. Relance-le pour le revoir.',
  'action.failed': 'Pas fait : {error}',

  'topics.open': 'Sujets',
  'topics.title': 'Tes sujets',
  'topics.byAgent': 'Écrits par l\'agent : réécris-les dans tes mots',
  'topics.placeholder': 'Un sujet, dans tes mots',
  'topics.add': 'Ajouter un sujet',
  'topics.remove': 'Retirer',
  'topics.save': 'Enregistrer',
  'topics.cancel': 'Annuler',

  'judge.read': 'Lire {n} textes · {calls} appels au modèle',
  'judge.reading': 'Lecture {done}/{total}',
  'judge.stop': 'Arrêter',
  'judge.cost': 'Dernière lecture : {calls} appels · {usd} de crédits',
  'judge.costUnknown': 'Dernière lecture : {calls} appels · coût non mesuré',
  'judge.zeroNote': 'Aucun crédit Mnemosyne dépensé : un modèle local ou ta propre clé n\'en utilise pas',
  'judge.stateUnreadable': 'Sujets et verdicts non lus : {error}. Rien n\'est écrit.',

  'verdict.touches': 'Touche · {topic}',
  'verdict.postNote': 'Lu sur le titre et le chapeau',
  'verdict.pending': 'Pas encore lu',
  'verdict.noneFolded': 'Aucun de tes sujets · {n}',
  'verdict.unverified': 'Non vérifié : {why}',
  'why.abstract-missing': 'pas de résumé à lire',
  'why.abstract-short': 'résumé trop court',
  'why.answer-unreadable': 'réponse illisible',
  'why.topic-unknown': 'numéro de sujet inconnu',
  'why.quote-not-found': 'citation introuvable dans le texte',
  'why.failed': 'appel au modèle en échec',

  'bench.title': 'Banc du lot 0 · {n} publications',
  'bench.run': 'Lancer · {calls} appels au modèle au plus',
  'bench.summary': 'D\'accord {agree} · manqués {missed} · fausses alertes {falseAlerts} · non vérifiés {unverified} · douteux {doubtful}',

  'view.label': 'Vue',
  'view.arrivals': 'Arrivées',
  'view.cross': 'Croiser un texte',

  'corpus.title': 'Publications chargées',
  'corpus.loaded': '{n} chargées · {date}',
  'corpus.none': 'Pas chargé',
  'corpus.partial': '{n} chargées · arrêté',
  'corpus.load': 'Charger',
  'corpus.reload': 'Recharger',
  'corpus.page': 'Page {page}/{pages}',
  'corpus.firstPage': 'Page {page}',
  'corpus.unavailable': 'Le cache des publications est indisponible : {error}',

  'text.title': 'Ton texte',
  'text.placeholder': 'Colle ton texte, ou choisis un fichier',
  'text.pick': 'Choisir un fichier',
  'text.filter': 'Texte, PDF ou Word',
  'text.passages': 'Passages · {n}',
  'text.truncated': 'L\'hôte a coupé ce document : seul son début est croisé',
  'text.notEnglish': 'Pas en anglais : des mots de recherche anglais sont demandés d\'abord, 2 appels par passage',
  'text.goesToModel': 'Chaque passage part au modèle réglé dans Mnemosyne OS',

  'cross.run': 'Croiser {n} passages · {calls} appels au modèle au plus',
  'cross.needCorpus': 'Charge d\'abord un labo',
  'cross.running': 'Croisement {done}/{total}',
  'cross.counts': 'Recoupés {supports} · en partie {partial} · divergent {diverges} · absents {absent} · non vérifiés {unverified}',
  'cross.base': 'Chaque passage a été comparé aux {k} publications les plus proches par les mots, sur {n} chargées ({labs})',
  'cross.passage': 'Passage {n}',
  'cross.supports': 'Recoupe',
  'cross.partial': 'En partie',
  'cross.missing': 'Manque : {what}',
  'cross.diverges': 'Diverge · à toi de juger',
  'cross.divergesNote': 'Verdict pas encore mesuré',
  'cross.absent': 'Absent : rien parmi les {k} publications les plus proches par les mots, sur {n} chargées',
  'cross.absentNone': 'Absent : aucune publication chargée ne partage ses mots',
  'cross.yours': 'Ton texte',
  'cross.theirs': 'La publication',
  'cross.notKept': 'Ce croisement est trop long pour être gardé : fermer la fenêtre le perd',
  'why.pub-unknown': 'numéro de publication inconnu',
  'why.claim-not-found': 'phrase introuvable dans ton texte',
  'judge.stopped': 'arrêtée : {why}',
  'refusal.quota': 'plus de crédits Mnemosyne',
  'refusal.auth': 'la clé du modèle a été refusée',
  'cross.loadedUntil': 'Publications connues jusqu\'au {date}',
  'cross.notSaved': 'Ce croisement n\'est pas gardé : les sujets et verdicts enregistrés n\'ont pas pu être lus',
  'corpus.full': '{n} textes entiers',
  'full.read': 'Lire le texte entier',
  'full.reading': 'Lecture du texte entier…',
  'full.done': 'Texte entier lu : {n} passages. Relance le croisement pour t\'en servir',
  'full.part': 'Passage {n} du texte entier',
  'full.truncated': 'coupé par l\'hôte',
  'licence.line': 'Licence : {licence}',
  'licence.none': 'Licence non donnée par OpenAlex',
};

const es: Dict = {
  'app.title': 'Vigilancia de laboratorios',
  'app.reading': 'Leyendo la vigilancia…',

  'status.daily': 'Una vez al día',
  'status.lastRun': 'Última pasada {date}',
  'status.firstPass': 'Primera pasada aún no hecha. No anuncia nada.',
  'status.lastError': 'Última pasada fallida: {error}',

  'error.title': 'No se pudo leer la vigilancia',
  'error.retry': 'Reintentar',

  'filter.all': 'Todos',
  'filter.label': 'Laboratorio',

  'list.count': 'Llegadas · {n}',
  'list.empty': 'Nada nuevo desde la última pasada.',
  'list.allSeen': 'Marcar todo como visto',
  'list.otherPosts': 'Otras entradas de OpenAI · {n}',
  'list.hideOther': 'Ocultar',

  'card.paper': 'Publicación',
  'card.post': 'Entrada de OpenAI',
  'card.published': 'Publicado el {date}',
  'card.noDate': 'Sin fecha de publicación',
  'card.recorded': 'Recogido el {date}',
  'card.open': 'Abrir',
  'card.seen': 'Visto',
  'card.records': '{n} fichas',
  'card.attributed': 'Laboratorio atribuido por OpenAlex',
  'card.abstractShort': 'Resumen: {n} palabras, demasiado corto para leerlo',
  'card.abstractMissing': 'Sin resumen',
  'card.noDetails': 'Detalles no leídos: título dado por la vigilancia',

  'details.worksFailed': 'Detalles de OpenAlex no leídos: {error}',
  'details.feedFailed': 'Canal de OpenAI no leído: {error}',
  'box.wasFull': 'La bandeja de la vigilancia estaba llena el {date}. El anfitrión guarda las últimas 100 llegadas: las más antiguas pudieron perderse antes de que Lab Watch las guardara.',
  'box.dismiss': 'Entendido',
  'box.notMoved': 'Llegadas dejadas en la bandeja de la vigilancia: {error}. La bandeja guarda las últimas 100.',
  'box.stateFull': 'Llegadas dejadas en la bandeja de la vigilancia: el estado guardado de Lab Watch está lleno. Marca llegadas como vistas para hacer sitio. La bandeja guarda las últimas 100.',
  'box.crossingDropped': 'El último cruce no se guardó: el estado guardado necesitaba su espacio para las llegadas. Vuelve a lanzarlo para verlo.',
  'action.failed': 'No hecho: {error}',

  'topics.open': 'Temas',
  'topics.title': 'Tus temas',
  'topics.byAgent': 'Escritos por el agente: reescríbelos con tus palabras',
  'topics.placeholder': 'Un tema, con tus palabras',
  'topics.add': 'Añadir un tema',
  'topics.remove': 'Quitar',
  'topics.save': 'Guardar',
  'topics.cancel': 'Cancelar',

  'judge.read': 'Leer {n} textos · {calls} llamadas al modelo',
  'judge.reading': 'Leyendo {done}/{total}',
  'judge.stop': 'Detener',
  'judge.cost': 'Última lectura: {calls} llamadas · {usd} de créditos',
  'judge.costUnknown': 'Última lectura: {calls} llamadas · coste no medido',
  'judge.zeroNote': 'Ningún crédito de Mnemosyne gastado: un modelo local o tu propia clave no los usan',
  'judge.stateUnreadable': 'Temas y veredictos no leídos: {error}. No se escribe nada.',

  'verdict.touches': 'Toca · {topic}',
  'verdict.postNote': 'Leído en el título y el resumen',
  'verdict.pending': 'Aún no leído',
  'verdict.noneFolded': 'Ninguno de tus temas · {n}',
  'verdict.unverified': 'No verificado: {why}',
  'why.abstract-missing': 'no hay resumen que leer',
  'why.abstract-short': 'resumen demasiado corto',
  'why.answer-unreadable': 'respuesta ilegible',
  'why.topic-unknown': 'número de tema desconocido',
  'why.quote-not-found': 'cita no encontrada en el texto',
  'why.failed': 'llamada al modelo fallida',

  'bench.title': 'Banco del lote 0 · {n} publicaciones',
  'bench.run': 'Lanzar · {calls} llamadas al modelo como máximo',
  'bench.summary': 'De acuerdo {agree} · perdidos {missed} · falsas alertas {falseAlerts} · no verificados {unverified} · dudosos {doubtful}',

  'view.label': 'Vista',
  'view.arrivals': 'Llegadas',
  'view.cross': 'Cruzar un texto',

  'corpus.title': 'Publicaciones cargadas',
  'corpus.loaded': '{n} cargadas · {date}',
  'corpus.none': 'No cargado',
  'corpus.partial': '{n} cargadas · detenido',
  'corpus.load': 'Cargar',
  'corpus.reload': 'Recargar',
  'corpus.page': 'Página {page}/{pages}',
  'corpus.firstPage': 'Página {page}',
  'corpus.unavailable': 'La caché de publicaciones no está disponible: {error}',

  'text.title': 'Tu texto',
  'text.placeholder': 'Pega tu texto o elige un archivo',
  'text.pick': 'Elegir un archivo',
  'text.filter': 'Texto, PDF o Word',
  'text.passages': 'Pasajes · {n}',
  'text.truncated': 'El anfitrión cortó este documento: solo se cruza su comienzo',
  'text.notEnglish': 'No está en inglés: primero se piden palabras de búsqueda en inglés, 2 llamadas por pasaje',
  'text.goesToModel': 'Cada pasaje va al modelo configurado en Mnemosyne OS',

  'cross.run': 'Cruzar {n} pasajes · {calls} llamadas al modelo como máximo',
  'cross.needCorpus': 'Carga primero un laboratorio',
  'cross.running': 'Cruce {done}/{total}',
  'cross.counts': 'Respaldados {supports} · en parte {partial} · divergen {diverges} · ausentes {absent} · no verificados {unverified}',
  'cross.base': 'Cada pasaje se comparó con las {k} publicaciones más cercanas por sus palabras, de {n} cargadas ({labs})',
  'cross.passage': 'Pasaje {n}',
  'cross.supports': 'Respaldado',
  'cross.partial': 'En parte',
  'cross.missing': 'Falta: {what}',
  'cross.diverges': 'Diverge · te toca juzgar',
  'cross.divergesNote': 'Veredicto aún no medido',
  'cross.absent': 'Ausente: nada entre las {k} publicaciones más cercanas por sus palabras, de {n} cargadas',
  'cross.absentNone': 'Ausente: ninguna publicación cargada comparte sus palabras',
  'cross.yours': 'Tu texto',
  'cross.theirs': 'La publicación',
  'cross.notKept': 'Este cruce es demasiado largo para guardarlo: cerrar la ventana lo pierde',
  'why.pub-unknown': 'número de publicación desconocido',
  'why.claim-not-found': 'frase no encontrada en tu texto',
  'judge.stopped': 'detenida: {why}',
  'refusal.quota': 'no quedan créditos de Mnemosyne',
  'refusal.auth': 'la clave del modelo fue rechazada',
  'cross.loadedUntil': 'Publicaciones conocidas hasta el {date}',
  'cross.notSaved': 'Este cruce no se guarda: no se pudieron leer los temas y veredictos guardados',
  'corpus.full': '{n} textos completos',
  'full.read': 'Leer el texto completo',
  'full.reading': 'Leyendo el texto completo…',
  'full.done': 'Texto completo leído: {n} pasajes. Vuelve a cruzar para usarlo',
  'full.part': 'Pasaje {n} del texto completo',
  'full.truncated': 'cortado por el anfitrión',
  'licence.line': 'Licencia: {licence}',
  'licence.none': 'Licencia no indicada por OpenAlex',
};

const DICTS: Record<Lang, Dict> = { en, fr, es, de: {}, pt: {}, ru: {}, zh: {} };

/** The written languages, for the parity test. */
export const WRITTEN = { en, fr, es } as const;

/** A host refusal code in words; a code without words of its own shows as it is. */
export function refusalText(t: Translate, code: string): string {
  if (code === 'CLOUD_QUOTA_EXHAUSTED') return t('refusal.quota');
  if (code === 'CLOUD_AUTH_FAILED') return t('refusal.auth');
  return code;
}

export function isLang(x: unknown): x is Lang {
  return typeof x === 'string' && (LANGS as readonly string[]).includes(x);
}

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = DICTS[lang][key] ?? en[key];
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
