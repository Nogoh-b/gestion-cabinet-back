# Plan: Génération automatique d'un template de procédure depuis le nom du ProcedureType

## Objectif

Modifier le subscriber [`ProcedureTypeSubscriber`](src/modules/procedures/subscribers/procedure-type.subscriber.ts) pour qu'il **génère un template de procédure personnalisé** (avec stages, sub-stages, transitions) basé sur le nom du `ProcedureType`, au lieu d'assigner simplement le template générique par défaut.

## Comportement attendu

1. Quand un `ProcedureType` est créé sans `procedure_template_id` :
   - Chercher un template existant nommé `Procédure - {ProcedureType.name}`
   - S'il existe → l'assigner (dédup)
   - S'il n'existe pas → **copier** le template générique (`DEFAULT_PROCEDURE_TEMPLATE_NAME`) avec le nouveau nom, puis l'assigner
2. Si le template générique lui-même n'existe pas encore (seed non exécuté) → comportement actuel (warning, pas de template assigné)

## Architecture

```mermaid
flowchart TD
    A[ProcedureType créé sans template_id] --> B{Template nommé\n'Procédure - {name}' existe ?}
    B -- Oui --> C[Assigner template existant]
    B -- Non --> D{Template générique\n'Procédure générique - 5 étapes' existe ?}
    D -- Non --> E[Warning: pas de template]
    D -- Oui --> F[Dupliquer le template générique\navec le nouveau nom]
    F --> G[Sauvegarder le nouveau template\nstages + sub-stages + transitions]
    G --> C
    C --> H[procedure_template_id = template.id]
```

## Modifications nécessaires

### 1. [`src/modules/procedures/subscribers/procedure-type.subscriber.ts`](src/modules/procedures/subscribers/procedure-type.subscriber.ts)

**Changements :**
- Injecter [`ProcedureTemplateService`](src/modules/procedure/services/procedure-template.service.ts) au lieu de `Repository<ProcedureTemplate>`
- Remplacer la logique actuelle de `onBeforeCreate` par :
  1. Vérifier si `procedure_template_id` est déjà renseigné → skip
  2. Construire le nom cible : `` `Procédure - ${entity.name}` ``
  3. Chercher un template existant avec ce nom
  4. Si trouvé → l'assigner directement
  5. Si non trouvé → charger le template générique (`DEFAULT_PROCEDURE_TEMPLATE_NAME`) avec ses relations (`stages`, `stages.subStages`, `transitions`)
  6. Si le template générique n'existe pas → warning actuel, return
  7. Créer un nouveau template en copiant les données du générique avec le nouveau nom
  8. Sauvegarder le nouveau template (cela va créer stages + sub-stages + transitions via cascade)
  9. Assigner `procedure_template_id` avec l'ID du nouveau template

**Nouveaux imports :**
- `ProcedureTemplateService` depuis `src/modules/procedure/services/procedure-template.service`
- Supprimer `InjectRepository` et `Repository<ProcedureTemplate>` (plus besoin)

### 2. Aucune modification module nécessaire

Le [`ProcedureModule`](src/modules/procedure/procedure.module.ts) exporte déjà `ProcedureTemplateService` dans ses `exports`. Le [`ProceduresModule`](src/modules/procedures/procedures.module.ts) importe déjà `ProcedureModule`. Donc `ProcedureTemplateService` est disponible pour injection dans le subscriber.

## Détail de l'implémentation

### Nouvelle logique de `onBeforeCreate`

```typescript
protected async onBeforeCreate(
  entity: ProcedureType,
  _event: InsertEvent<ProcedureType>,
): Promise<void> {
  // Déjà lié : rien à faire
  if (entity.procedure_template_id) return;

  const templateName = `Procédure - ${entity.name}`;

  // 1. Vérifier si un template existe déjà avec ce nom (dédup)
  const existingTemplate = await this.templateService.findByName(templateName);
  if (existingTemplate) {
    entity.procedure_template_id = existingTemplate.id;
    this.logger.log(
      `ProcedureType "${entity.name}" → template existant réutilisé "${templateName}" (ID: ${existingTemplate.id})`,
    );
    return;
  }

  // 2. Charger le template générique avec ses relations
  const defaultTemplate = await this.templateService.findByName(
    DEFAULT_PROCEDURE_TEMPLATE_NAME,
    ['stages', 'stages.subStages', 'transitions'],
  );

  if (!defaultTemplate) {
    this.logger.warn(
      `ProcedureType "${entity.name}" (${entity.code}) créé sans template — ` +
      `le template générique "${DEFAULT_PROCEDURE_TEMPLATE_NAME}" est introuvable en base.`,
    );
    return;
  }

  // 3. Créer un nouveau template par copie
  const newTemplate = await this.templateService.duplicateTemplate(
    defaultTemplate,
    templateName,
    `Template généré automatiquement pour le type de procédure "${entity.name}"`,
  );

  entity.procedure_template_id = newTemplate.id;
  this.logger.log(
    `ProcedureType "${entity.name}" (${entity.code}) → nouveau template créé "${templateName}" (ID: ${newTemplate.id})`,
  );
}
```

### Méthodes à ajouter dans `ProcedureTemplateService`

Deux méthodes sont nécessaires :

#### `findByName(name: string, relations?: string[])`
- Cherche un template par son nom (unique)
- Retourne `ProcedureTemplate | null`

#### `duplicateTemplate(source: ProcedureTemplate, newName: string, description?: string)`
- Crée un nouveau template avec `newName`
- Copie tous les stages, sub-stages et transitions du source
- Utilise une transaction (comme la méthode `create` existante)
- Retourne le nouveau template

## Risques et considérations

1. **Performance** : La duplication se fait dans `onBeforeCreate` (before insert), donc elle doit être rapide. La transaction est nécessaire pour l'atomicité.
2. **Template générique non trouvé** : Si le seeder n'a pas été exécuté, on garde le comportement warning actuel.
3. **Dédup** : On vérifie par `name` (unique constraint en base). Si un template existe déjà avec le même nom, on le réutilise.
4. **Cascade** : Les relations `stages`, `subStages`, `transitions` ont `cascade: true` dans l'entité `ProcedureTemplate`, donc sauvegarder le template sauvegarde aussi ses enfants.
5. **Cycles** : Le template générique n'a pas de cycles, donc pas besoin de les copier. Si plus tard des cycles sont ajoutés, il faudra les copier aussi.

## Ordre d'exécution

1. Ajouter `findByName()` et `duplicateTemplate()` dans [`ProcedureTemplateService`](src/modules/procedure/services/procedure-template.service.ts)
2. Modifier [`ProcedureTypeSubscriber`](src/modules/procedures/subscribers/procedure-type.subscriber.ts) pour utiliser `ProcedureTemplateService` et la nouvelle logique
