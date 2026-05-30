# Plan de correction des erreurs TypeScript dans OnboardingService

## Analyse des erreurs

### Erreur rapportée (ligne 51-59)
```
Aucune surcharge ne correspond à cet appel.
  Surcharge 1: 'code' n'existe pas dans le type 'DeepPartial<Cabinet>[]
  Surcharge 2: Impossible d'assigner 'null' à 'number | undefined'
```

**Cause racine** : [`Cabinet.plan_id`](src/modules/cabinet/entities/cabinet.entity.ts:41) est typé `number` en TypeScript mais la colonne DB est `nullable: true`. L'expression `selectedPlan?.id ?? null` donne `number | null`, qui n'est pas assignable à `number | undefined` (le type dérivé par `DeepPartial`).

---

## Modifications à appliquer

### 1. [`Cabinet.entity.ts`](src/modules/cabinet/entities/cabinet.entity.ts:41) — Rendre `plan_id` nullable dans le type

```diff
  @Column({ nullable: true, name: 'plan_id' })
- plan_id: number;
+ plan_id: number | null;
```

**Pourquoi** : La colonne DB est déjà `nullable: true`. Le type TS doit refléter cette réalité. `DeepPartial<Cabinet>` produira alors `number | null | undefined`, acceptant `null`.

---

### 2. [`onboarding.service.ts`](src/modules/onboarding/onboarding.service.ts:51-59) — `cabinetRepo.create()`

**Retirer le cast `as any`** après avoir corrigé `plan_id`.

```diff
  const cabinet = this.cabinetRepo.create({
    code:         this.cabinetService.generateCode(),
    name:         dto.cabinet_name.trim(),
    status:       'trial',
-   plan:         planCode as any,
+   plan:         planCode as CabinetPlan,
-   plan_id:      selectedPlan?.id ?? null,
+   plan_id:      selectedPlan?.id ?? null,   // OK car plan_id: number | null
    routing_mode: dto.routing_mode ?? 'path',
    trial_ends_at: this.trialEnd(30),
  });
```

Ajouter l'import de `CabinetPlan` si nécessaire :
```typescript
import { Cabinet, CabinetPlan } from '../cabinet/entities/cabinet.entity';
```

---

### 3. [`onboarding.service.ts`](src/modules/onboarding/onboarding.service.ts:71-78) — `branchRepo.create()`

**Retirer le cast `as any`** et supprimer `tenant_id` redondant.

```diff
- const branchDraft = this.branchRepo.create({
+ const branchDraft = this.branchRepo.create({
    code:         branchCode,
    name:         'Siège Social',
    opening_hour: '08:00',
    closing_hour: '18:00',
    status:       1,
-   tenant_id:    cabinet.id,
- } as any);
+ });
```

**Pourquoi** : [`Branch`](src/modules/agencies/branch/entities/branch.entity.ts:19) extends `TenantEntity` qui a un `@BeforeInsert()` injectant automatiquement `tenant_id` depuis le contexte actif. Comme le code est déjà dans `tenantContext.run(cabinet.id, ...)`, l'injection est automatique.

---

### 4. [`onboarding.service.ts`](src/modules/onboarding/onboarding.service.ts:83-91) — `userRepo.create()`

**Retirer le cast `as any`**.

```diff
  const userDraft = this.userRepo.create({
    username:   dto.email,
    email:      dto.email,
    first_name: dto.first_name.trim(),
    last_name:  dto.last_name.trim(),
    password:   hashedPwd,
    status:     1,
    role:       UserRole.ADMIN,
- } as any);
+ });
```

**Pourquoi** : Toutes les propriétés (`username`, `email`, `first_name`, `last_name`, `password`, `status`, `role`) existent bien comme colonnes dans [`User.entity.ts`](src/modules/iam/user/entities/user.entity.ts). Aucun cast nécessaire.

---

### 5. [`onboarding.service.ts`](src/modules/onboarding/onboarding.service.ts:95-105) — `employeeRepo.create()`

**Retirer le cast `as any`** et supprimer les propriétés non-colonnes.

```diff
  const employeeDraft = this.employeeRepo.create({
-   first_name: dto.first_name.trim(),
-   last_name:  dto.last_name.trim(),
-   email:      dto.email,
    position:   EmployeePosition.AVOCAT,
    status:     1,
    user:       savedUser,
    branch:     savedBranch,
-   tenant_id:  cabinet.id,
- } as any);
+ });
```

**Pourquoi** :
- [`Employee`](src/modules/agencies/employee/entities/employee.entity.ts) **n'a pas** les colonnes `first_name`, `last_name`, `email`. Ce sont des getters qui lisent depuis `this.user`.
- `tenant_id` est auto-injecté par `@BeforeInsert()` (comme pour Branch).
- `user` et `branch` sont des relations valides.
- Note : `status: 1` est correct car la colonne `status` existe (type `EmployeeStatus` qui est un `enum` basé sur `number`). On peut aussi utiliser `EmployeeStatus.ACTIVE` pour plus de clarté.

---

### 6. [`onboarding.service.ts`](src/modules/onboarding/onboarding.service.ts:110-114) — `assignmentRepo.create()`

**Retirer le cast `as any`**.

```diff
  const assignment = this.assignmentRepo.create({
    user_id: savedUser.id,
    role_id: adminRole.id,
    status:  1,
- } as any);
+ });
```

**Pourquoi** : [`UserRoleAssignment`](src/modules/iam/user-role-assignment/entities/user-role-assignment.entity.ts) a bien les colonnes `user_id: number`, `role_id: number`, `status: number`. Les types correspondent.

---

## Résumé des modifications

| Fichier | Changement |
|---------|-----------|
| `src/modules/cabinet/entities/cabinet.entity.ts:41` | `plan_id: number → number \| null` |
| `src/modules/onboarding/onboarding.service.ts:51-59` | Retirer `as any`, typer `plan as CabinetPlan` |
| `src/modules/onboarding/onboarding.service.ts:71-78` | Retirer `as any` + `tenant_id` |
| `src/modules/onboarding/onboarding.service.ts:83-91` | Retirer `as any` |
| `src/modules/onboarding/onboarding.service.ts:95-105` | Retirer `as any` + `first_name`/`last_name`/`email`/`tenant_id` |
| `src/modules/onboarding/onboarding.service.ts:110-114` | Retirer `as any` |

## Diagramme de flux

```mermaid
flowchart TD
    A[Erreur TS plan_id] --> B[Corriger Cabinet.entity.ts<br/>plan_id: number | null]
    B --> C[onboarding.service.ts<br/>cabinetRepo.create sans as any]
    
    D[Erreur latentes as any] --> E[Supprimer tenant_id<br/>redondant partout]
    D --> F[Supprimer first_name/last_name/email<br/>de employeeRepo.create]
    D --> G[Typer plan comme CabinetPlan]
    
    C --> H[Vérification compilation]
    E --> H
    F --> H
    G --> H
```
