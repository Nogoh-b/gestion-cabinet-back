import { WriteOperation, WritePlan } from './dto/analysis-response.dto';

const DOCUMENT_ENTITIES = new Set(['document_customer', 'documents', 'document']);

/**
 * Un plan d'écriture IA ne transporte pas le fichier joint : un INSERT de
 * document créerait une fiche sans fichier. On retire ces opérations, et
 * celles qui en dépendent ; le classement du fichier passe par le formulaire
 * d'ajout de document du chat.
 */
export function withoutUploadedDocumentInserts(plan: WritePlan): {
  plan: WritePlan;
  removed: number;
} {
  const removedTempIds = new Set<string>();
  // Les opérations sont ordonnées par dépendances : une seule passe suffit.
  const operations = plan.operations.filter((operation) => {
    const fields = JSON.stringify(operation.fields ?? {});
    const dependsOnRemoved = [...removedTempIds].some(
      (tempId) =>
        operation.dependsOn?.includes(tempId) || fields.includes(`{{${tempId}.`),
    );
    const insertsDocument =
      operation.operation === 'INSERT' &&
      DOCUMENT_ENTITIES.has(String(operation.entity).toLowerCase());
    if (!insertsDocument && !dependsOnRemoved) return true;
    if (operation.tempId) removedTempIds.add(operation.tempId);
    return false;
  });
  return {
    plan: { ...plan, operations },
    removed: plan.operations.length - operations.length,
  };
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STORE_VERB = String.raw`(?:ajoute[rz]?|joindre|joins|attache[rz]?|rattache[rz]?|enregistre[rz]?|classe[rz]?|depose[rz]?|importe[rz]?|range[rz]?|sauvegarde[rz]?|televerse[rz]?|archive[rz]?|stocke[rz]?|verse[rz]?|mets|met|mettre|insere[rz]?|integre[rz]?)`;
const FILES = String.raw`(?:documents?|fichiers?|pieces?|pdfs?|pj|scans?|images?)`;
// « ajoute le client de cette image » crée un client : le verbe ne vise pas le fichier.
const OTHER_RESOURCE = String.raw`(?:audiences?|factures?|clients?|diligences?|taches?|paiements?|rendez|rdv|actions?|honoraires?|courriers?|lettres?|notes?|dossiers?|contacts?|procedures?)\b`;
const FILING_REQUEST = new RegExp(
  String.raw`\b${STORE_VERB}(?:\s+(?!${OTHER_RESOURCE})\S+){0,4}?\s+(?:${FILES}|dedans)\b` +
    // « classe-les dans chaque dossier », « et les documents »
    String.raw`|\b${STORE_VERB}\s+(?:les|la|le|y)\s+(?:\S+\s+){0,2}?dans\s+(?:les|ces|chaque|leurs?|son|sa|le)\s+dossiers?\b` +
    String.raw`|\bet\s+(?:les|ces|ses|leurs)\s+${FILES}\b`,
);

/** La demande parle de classer les fichiers eux-mêmes (« … et classe les fichiers dedans »). */
export function isFilingRequest(question: string): boolean {
  return FILING_REQUEST.test(normalize(question));
}

/**
 * Ajouté à la demande transmise au planner (écriture forcée uniquement : ces
 * mots fausseraient la classification locale). Les fichiers servent de source
 * aux enregistrements créés ; leur classement n'est prévu que si la demande le
 * réclame, et withoutUploadedDocumentInserts le convertit ensuite en
 * formulaire d'ajout.
 */
export function uploadedFilePlannerNote(fileNames: string[], question: string): string {
  const names = fileNames.map((name) => `« ${name} »`).join(', ');
  const several = fileNames.length > 1;
  const filing = isFilingRequest(question)
    ? `Pour classer un fichier dans un dossier, prévois une opération INSERT sur document_customer (name, dossier_id) : l'application y rattachera le fichier.`
    : `La demande ne réclame pas le classement des fichiers : ne prévois aucune opération sur document_customer ni documents.`;
  return `\n\n--- ${several ? 'FICHIERS JOINTS' : 'FICHIER JOINT'} ---
${several ? `Les fichiers ${names} accompagnent` : `Le fichier ${names} accompagne`} la demande. Leur texte figure plus haut, chacun sous son nom (« Fichier joint #N (nom=…) ») : ce sont les données à enregistrer.
- Une demande de création à partir de leur contenu (« crée les dossiers », « les différents dossiers », « un dossier pour chaque fichier ») crée un enregistrement par affaire décrite${several ? ' : en général un INSERT dossiers par fichier' : ''}. Ne fusionne jamais deux affaires.
- Un dossier exige son client : si le fichier décrit le client, prévois d'abord un INSERT customer (l'application réutilise un client existant identique) avec un tempId, puis "client_id": "{{tempId.id}}" et "dependsOn" dans le dossier ; sinon recopie exactement le nom du client.
- Ajoute à chaque opération "sourceFiles": ["nom exact du fichier"] dont viennent ses données.
- ${filing}
---`;
}

export function uploadedDocumentMessage(fileName: string, otherOperations: boolean): string {
  return otherOperations
    ? `Le fichier « ${fileName} » n'est pas inclus dans ce plan : son classement vous sera proposé après confirmation.`
    : `Je prépare le classement de « ${fileName} » dans le dossier.`;
}

interface SourceDocument {
  name: string;
  content?: string;
}

const withoutExtension = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, '');

/** Valeurs d'une opération assez distinctives pour être retrouvées dans un fichier. */
function distinctiveValues(operation: WriteOperation): string[] {
  return Object.values(operation.fields ?? {})
    .filter((value): value is string => typeof value === 'string' && !value.includes('{{'))
    .map(normalize)
    .filter((value) => value.length >= 4 && !/^\d{4} \d{2} \d{2}/.test(value));
}

function referencedTempIds(operation: WriteOperation): string[] {
  const fromFields = [...JSON.stringify(operation.fields ?? {}).matchAll(/\{\{([^.}]+)\./g)].map((m) => m[1]);
  return [...new Set([...(operation.dependsOn ?? []), ...fromFields])];
}

/**
 * Fichier dont vient chaque création du plan (`sourceFiles`), pour classer
 * ensuite chaque pièce jointe dans le dossier créé à partir d'elle. Les noms
 * cités par le modèle sont vérifiés ; à défaut : fichier unique, sinon le seul
 * fichier qui contient les valeurs de l'opération, sinon celui de l'opération
 * dont elle dépend (le client du dossier). Le champ est ignoré à l'exécution.
 */
export function attachSourceFiles(plan: WritePlan, documents: SourceDocument[]): WritePlan {
  const files = documents.filter((document) => document.name);
  if (!files.length) return plan;
  const byName = new Map<string, string>();
  for (const { name } of files) {
    byName.set(normalize(name), name);
    byName.set(normalize(withoutExtension(name)), name);
  }
  const texts = files.map((document) => ({ name: document.name, text: normalize(document.content ?? '') }));
  const sourcesByTempId = new Map<string, string[]>();

  const operations = plan.operations.map((operation) => {
    const cited = (Array.isArray(operation.sourceFiles) ? operation.sourceFiles : [])
      .map((name) => (typeof name === 'string' ? byName.get(normalize(name)) ?? byName.get(normalize(withoutExtension(name))) : undefined))
      .filter((name): name is string => !!name);
    let sources = [...new Set(cited)];
    if (!sources.length && operation.operation === 'INSERT') {
      if (files.length === 1) {
        sources = [files[0].name];
      } else {
        const values = distinctiveValues(operation);
        const scores = texts.map(({ name, text }) => ({
          name,
          score: values.filter((value) => text.includes(value)).length,
        }));
        const best = Math.max(0, ...scores.map((item) => item.score));
        const winners = scores.filter((item) => item.score === best);
        if (best > 0 && winners.length === 1) {
          sources = [winners[0].name];
        } else {
          const inherited = new Set(referencedTempIds(operation).flatMap((tempId) => sourcesByTempId.get(tempId) ?? []));
          if (inherited.size === 1) sources = [...inherited];
        }
      }
    }
    if (operation.tempId && sources.length) sourcesByTempId.set(operation.tempId, sources);
    const { sourceFiles: _cited, ...rest } = operation;
    return sources.length ? { ...rest, sourceFiles: sources } : rest;
  });
  return { ...plan, operations };
}
