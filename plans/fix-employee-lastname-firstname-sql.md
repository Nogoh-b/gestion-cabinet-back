# Plan: Fix AI SQL Generation for Employee Names

## Problem

The AI assistant generates SQL queries that try to select `e.last_name` and `e.first_name`
from the `employee` table (aliased as `e`), but these columns **do not exist** on the
`employee` table. They exist on the `user` table, which is linked to `employee` via
a shared primary key (`employee.id = user.id`).

### Root Cause Analysis

**Data Model:**
| Table | Has `last_name`? | Has `first_name`? | Notes |
|-------|:-:|:-:|-------|
| `customer` | ✅ Yes | ✅ Yes | Direct columns |
| `employee` | ❌ No | ❌ No | Name info is on the linked `user` table |
| `user` | ✅ Yes | ✅ Yes | Linked to employee via `user.id = employee.id` |

**Why the AI gets it wrong:**
1. The `customer` table has `last_name`/`first_name` directly, so `c.last_name` works
2. The AI assumes the same pattern applies to `employee` (joined as `e.last_name`)
3. The relationship `employee.id = user.id` is a **shared primary key** (not a traditional FK constraint), so `information_schema.KEY_COLUMN_USAGE` does not capture it
4. The LLM is not told that employee names must come via the `user` table

**Correct query should be:**
```sql
LEFT JOIN user u ON u.id = e.id
-- then use: u.last_name, u.first_name
```

## Solution: 4-Level Fix

### Level 1 — Runtime SQL Validation (SqlValidatorService)

**File:** [`src/core/ai-database/sql-validator.service.ts`](src/core/ai-database/sql-validator.service.ts)

Enhance the `validateAndFixSql()` method to detect and auto-correct the `employee.last_name`/`employee.first_name` pattern.

**Specific changes:**
1. When a column reference `e.last_name` or `e.first_name` is detected (alias `e` for `employee`), automatically rewrite the query to:
   - Add a `LEFT JOIN user u ON u.id = e.id`
   - Replace `e.last_name` with `u.last_name`
   - Replace `e.first_name` with `u.first_name`

2. Add a special mapping in `findSimilarColumn()` or a new method `fixEmployeeUserJoin()` that handles this transformation.

**Implementation details:**
```typescript
// In validateAndFixSql(), after existing validation:
fixedSql = this.fixEmployeeUserJoin(fixedSql);

// New method:
private fixEmployeeUserJoin(sql: string): string {
  // Detect if there's a JOIN employee e and references e.last_name or e.first_name
  const hasEmployeeJoin = /JOIN\s+employee\s+e\s+/i.test(sql);
  const usesEmployeeName = /\be\.(last_name|first_name|full_name)\b/i.test(sql);
  
  if (hasEmployeeJoin && usesEmployeeName) {
    // Check if user u is already joined
    if (!/JOIN\s+user\s+u\s+/i.test(sql)) {
      // Add JOIN user AFTER the employee join
      sql = sql.replace(
        /(JOIN\s+employee\s+e\s+ON\s+[^]+?)(?=WHERE|LEFT|JOIN|ORDER|GROUP|LIMIT|$)/i,
        '$1 LEFT JOIN user u ON u.id = e.id'
      );
    }
    // Replace e.last_name -> u.last_name, e.first_name -> u.first_name
    sql = sql.replace(/\be\.last_name\b/gi, 'u.last_name');
    sql = sql.replace(/\be\.first_name\b/gi, 'u.first_name');
    sql = sql.replace(/\be\.full_name\b/gi, "CONCAT(u.first_name, ' ', u.last_name)");
  }
  return sql;
}
```

### Level 2 — Entity Description Enhancement

**File:** [`src/modules/agencies/employee/entities/employee.entity.ts`](src/modules/agencies/employee/entities/employee.entity.ts)

Update the `@BusinessTable` description on the `Employee` entity to explicitly tell the LLM that personal name info is stored in the `user` table.

**Current description (line 40):**
```typescript
description: '⚠️ LECTURE ET MODIFICATION UNIQUEMENT — la création est impossible via l\'IA...'
```

**New description (append these instructions):**
```
⚠️ ATTENTION COLONNES : La table employee ne contient PAS les colonnes "last_name"
ni "first_name". Pour obtenir le nom/prénom d'un collaborateur, tu DOIS faire un
LEFT JOIN avec la table "user" sur user.id = employee.id, puis sélectionner
user.last_name et user.first_name.
```

### Level 3 — Project Prompt Rules

**File:** [`src/config/ai-database/cabinet-juridique-prompt.ts`](src/config/ai-database/cabinet-juridique-prompt.ts)

Add a new rule section about the employee-user relationship.

**Add after rule #10 (Collaborators) — new rule #11:**
```
### 11. 🆔 Règle pour les NOMS des COLLABORATEURS (employee ⇢ user)
La table "employee" ne contient PAS les colonnes "last_name" ni "first_name".
Ces informations sont stockées dans la table "user" (liée par user.id = employee.id).
Quand tu génères une requête SQL qui doit afficher le nom ou prénom d'un collaborateur
(avocat, secrétaire, etc.), tu DOIS :
1. Faire un JOIN avec la table "user" : LEFT JOIN user u ON u.id = e.id
2. Utiliser "u.last_name" et "u.first_name" dans tes SELECT
⚠️ Ne tente JAMAIS de sélectionner "e.last_name" ou "e.first_name" — ces colonnes
n'existent pas dans la table employee et la requête échouera.
```

### Level 4 — Schema Generation Enhancement

**File:** [`src/core/ai-database/ai-database.service.ts`](src/core/ai-database/ai-database.service.ts)

Enhance the `getTableInfo()` method (around line 1825) to add a note for the `employee` table about the shared PK with `user`.

**In the table info generation, after the table description section (around line 1873-1884), add a special hint for `employee`:**
```typescript
// Special hint for employee-user shared PK relationship
if (table === 'employee') {
  schema += `⚠️ **Note IMPORTANTE** : Cette table ne contient PAS les colonnes "last_name" ni "first_name".\n`;
  schema += `⚠️ Pour obtenir le nom/prénom d'un collaborateur, faites un JOIN avec la table "user" sur user.id = employee.id.\n`;
  schema += `⚠️ Utilisez "u.last_name" et "u.first_name" (où u = alias de user).\n\n`;
}
```

## Execution Order

1. **Level 1** — [`SqlValidatorService`](src/core/ai-database/sql-validator.service.ts): This is the **most critical** fix because it catches and corrects the error at runtime, regardless of what the LLM generates. Implement the `fixEmployeeUserJoin()` method.

2. **Level 2** — [`Employee entity`](src/modules/agencies/employee/entities/employee.entity.ts): Update the `@BusinessTable` description.

3. **Level 3** — [`cabinet-juridique-prompt.ts`](src/config/ai-database/cabinet-juridique-prompt.ts): Add the new rule #11.

4. **Level 4** — [`ai-database.service.ts`](src/core/ai-database/ai-database.service.ts): Add the employee table hint in schema generation.

## Testing

After implementing, test by asking the AI:
- "Quel est le dossier numéro 1 ?" — This should trigger the dossier query with the problematic employee join
- Verify the SQL generated no longer contains `e.last_name` or `e.first_name`
- Verify the query executes successfully without "Unknown column" error

## Files to Modify

| # | File | Change | Priority |
|---|------|--------|----------|
| 1 | [`src/core/ai-database/sql-validator.service.ts`](src/core/ai-database/sql-validator.service.ts) | Add `fixEmployeeUserJoin()` method and call it in `validateAndFixSql()` | 🔴 Critical |
| 2 | [`src/modules/agencies/employee/entities/employee.entity.ts`](src/modules/agencies/employee/entities/employee.entity.ts) | Update `@BusinessTable` description with name column hint | 🟡 Medium |
| 3 | [`src/config/ai-database/cabinet-juridique-prompt.ts`](src/config/ai-database/cabinet-juridique-prompt.ts) | Add rule #11 about employee-user name relationship | 🟡 Medium |
| 4 | [`src/core/ai-database/ai-database.service.ts`](src/core/ai-database/ai-database.service.ts) | Add special hint in `getTableInfo()` for employee table | 🟢 Low |
