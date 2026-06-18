/**
 * Script de correction de la détection de tables dans ai-database.service.ts
 * Version compatible \r\n (Windows)
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'core', 'ai-database', 'ai-database.service.ts');

let content = fs.readFileSync(filePath, 'utf-8');

// Vérifier si déjà patché
if (content.includes('stemKeyword')) {
  console.log('✅ Le fichier est déjà patché.');
  process.exit(0);
}

// Normaliser les line endings pour le traitement
const hasCRLF = content.includes('\r\n');
const normalized = content.replace(/\r\n/g, '\n');

// 1. Mettre à jour le prompt système (buildReadSystemPrompt)
const oldPromptText = `6. Si des documents sont fournis dans la question, utilise leur contenu uniquement comme contexte d'analyse, pas comme nom de table

FORMAT OBLIGATOIRE :`;

const newPromptText = `6. Si des documents sont fournis dans la question, utilise leur contenu uniquement comme contexte d'analyse, pas comme nom de table
7. ⚠️ IMPORTANT : Utilise EXACTEMENT les noms de tables du schema ci-dessus. Ne devine JAMAIS les noms de tables. Par exemple, la table "document_customer" s'appelle EXACTEMENT "document_customer", pas "document" ni "documents".

FORMAT OBLIGATOIRE :`;

let modified = normalized;

if (modified.includes(oldPromptText)) {
  modified = modified.split(oldPromptText).join(newPromptText);
  console.log('✅ Prompt système mis à jour');
} else {
  console.log('⚠️ Prompt système non trouvé, vérification manuelle nécessaire');
}

// 2. Remplacer l'ancienne méthode detectRelevantTables par la nouvelle
const oldMethodStart = `  /**\n  * Détecte automatiquement les tables pertinentes (UNIQUEMENT celles avec métadonnées)\n  */\n  private async detectRelevantTables(question: string, specificTables?: string[] | string): Promise<string[]> {`;

const startIdx = modified.indexOf(oldMethodStart);

if (startIdx === -1) {
  console.log('❌ Méthode detectRelevantTables introuvable');
  console.log('Recherche avec des variantes...');
  // Chercher avec un pattern plus large
  const altRegex = /private async detectRelevantTables/;
  const match = modified.match(altRegex);
  if (match) {
    console.log(`Trouvé à l'index ${match.index}`);
    console.log(`Contexte: ${JSON.stringify(modified.substring(match.index - 20, match.index + 30))}`);
  }
  process.exit(1);
}

// Trouver la fin de la méthode : chercher le prochain commentaire JSDoc ou méthode
const restAfterMethod = modified.substring(startIdx);
// La méthode se termine par `  }` suivi d'une ligne vide puis du commentaire de getDefaultVisibleTables
const endMarker = `  /**\n  * Retourne la liste des tables visibles par défaut`;
const endIdx = modified.indexOf(endMarker);

if (endIdx === -1) {
  console.log('❌ Marqueur de fin non trouvé');
  process.exit(1);
}

const beforeMethod = modified.substring(0, startIdx);
const afterMethod = modified.substring(endIdx);

// La nouvelle méthode + helpers
const newCode = `  /**
   * Normalise un mot-clé pour le matching : vire les marques du pluriel français
   * pour matcher "documents" → "document", "dossiers" → "dossier", etc.
   */
  private stemKeyword(word: string): string {
    const w = word.toLowerCase();
    if (w.endsWith('s') && w.length > 3) return w.slice(0, -1);
    if (w.endsWith('x') && w.length > 3) return w.slice(0, -1);
    return w;
  }

  /**
   * Decoupe un nom de table snake_case en mots individuels
   * Ex: "document_customer" → ["document", "customer"]
   */
  private splitTableName(name: string): string[] {
    return name.toLowerCase().split('_').filter(w => w.length > 0);
  }

  /**
  * Detecte automatiquement les tables pertinentes avec matching ameliore :
  * - Word-level matching (decoupage en mots des noms de tables)
  * - Stemming pour gerer singulier/pluriel (ex: "documents" → "document" dans "document_customer")
  * - Matching sur la categorie BusinessTable
  * - Tri stable (score DESC + nom ASC)
  */
  private async detectRelevantTables(question: string, specificTables?: string[] | string): Promise<string[]> {
    const normalizedSpecificTables = this.normalizeStringArray(specificTables);
    if (normalizedSpecificTables && normalizedSpecificTables.length > 0) {
      const validTables = normalizedSpecificTables.filter(table => 
        this.schemaMetadata.hasTableMetadata(table)
      );
      
      if (validTables.length === 0) {
        this.logger.warn(\`Aucune table specifiee n'a de metadonnees, utilisation des tables par defaut\`);
        return this.getDefaultVisibleTables();
      }
      
      return validTables;
    }

    const keywords = question.toLowerCase().split(/\\s+/);
    const visibleTables = this.schemaMetadata.getAllVisibleTables();
    const keywordStems = keywords.map(k => this.stemKeyword(k));
    
    const tableScores: { name: string; score: number; reasons: string[] }[] = [];
    for (const tableName of visibleTables) {
      let score = 0;
      const reasons: string[] = [];
      
      // 1. Nom de table EXACT dans les mots-cles (ex: "dossiers")
      if (keywords.includes(tableName.toLowerCase())) {
        score += 10;
        reasons.push('exact_table_name');
      }
      
      const tableWords = this.splitTableName(tableName);
      const tableStems = tableWords.map(w => this.stemKeyword(w));
      
      const tableMeta = this.schemaMetadata.getTableMetadataForPrompt(tableName);
      const businessName = tableMeta?.label?.toLowerCase() || '';
      const category = tableMeta?.category?.toLowerCase() || '';
      
      for (let ki = 0; ki < keywords.length; ki++) {
        const keyword = keywords[ki];
        const stem = keywordStems[ki];
        
        // 2. Word-level matching avec stemming
        const wordMatch = tableWords.some(w => w === keyword || w === stem);
        const stemMatch = tableStems.some(s => s === keyword || s === stem);
        
        if (wordMatch || stemMatch) {
          score += 5;
          reasons.push(\`word_match:\${keyword}\`);
        }
        
        // 3. Label metier (ex: "Documents clients" → "documents")
        const businessWords = businessName.split(/[\\s_]+/).filter(Boolean);
        const businessStems = businessWords.map(w => this.stemKeyword(w));
        
        const labelWordMatch = businessWords.some(w => w === keyword || w === stem);
        const labelStemMatch = businessStems.some(s => s === keyword || s === stem);
        
        if (labelWordMatch || labelStemMatch) {
          score += 7;
          reasons.push(\`label_match:\${keyword}\`);
        }
        
        // 4. Categorie BusinessTable (ex: category: 'document' → match "documents")
        if (category) {
          const catWords = category.split(/[\\s_]+/).filter(Boolean);
          const catStems = catWords.map(w => this.stemKeyword(w));
          if (catWords.some(w => w === keyword || w === stem) ||
              catStems.some(s => s === keyword || s === stem)) {
            score += 6;
            reasons.push(\`category_match:\${keyword}\`);
          }
        }
      }
      
      if (score > 0) {
        tableScores.push({ name: tableName, score, reasons });
      }
    }
    
    // Tri stable : score DESC, puis nom ASC
    tableScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
    const detectedTables = tableScores.slice(0, 10).map(t => t.name);
    
    this.logger.log(\`🎯 Tables detectees: \${detectedTables.join(', ')}\`);
    this.logger.debug(\`Scores: \${JSON.stringify(tableScores.map(t => ({ name: t.name, score: t.score })))}\`);
    
    if (detectedTables.length === 0) {
      return this.getDefaultVisibleTables();
    }
    
    return detectedTables;
  }`;

modified = beforeMethod + newCode + '\n\n' + afterMethod;

// Restaurer les line endings \r\n si nécessaire
if (hasCRLF) {
  modified = modified.replace(/\n/g, '\r\n');
}

// Écrire le fichier
fs.writeFileSync(filePath, modified, 'utf-8');
console.log('✅ Fichier sauvegardé');

// Vérifications
const verify = fs.readFileSync(filePath, 'utf-8');
console.log('✅ stemKeyword présent:', verify.includes('stemKeyword'));
console.log('✅ splitTableName présent:', verify.includes('splitTableName'));
console.log('✅ wordMatch présent:', verify.includes('wordMatch'));
console.log('✅ category_match présent:', verify.includes('category_match'));
console.log('✅ Prompt mis à jour:', verify.includes('Utilise EXACTEMENT les noms de tables'));

console.log('\n🎯 Correction terminée avec succès !');
