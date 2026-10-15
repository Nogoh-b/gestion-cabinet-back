import { WritePlan } from './dto/analysis-response.dto';

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

/**
 * Ajouté à la demande transmise au planner (écriture forcée uniquement : ces
 * mots fausseraient la classification locale). Le planner peut ainsi exprimer
 * « classe ce fichier » ; withoutUploadedDocumentInserts le convertit ensuite
 * en formulaire d'ajout.
 */
export function uploadedFilePlannerNote(fileName: string): string {
  return `\n\n--- FICHIER JOINT ---
Le fichier « ${fileName} » accompagne la demande. Pour l'ajouter, le classer ou l'enregistrer dans un dossier, prévois une opération INSERT sur document_customer (name, dossier_id) : l'application y rattachera le fichier.
---`;
}

export function uploadedDocumentMessage(fileName: string, otherOperations: boolean): string {
  return otherOperations
    ? `Le fichier « ${fileName} » n'est pas inclus dans ce plan : son classement vous sera proposé après confirmation.`
    : `Je prépare le classement de « ${fileName} » dans le dossier.`;
}
