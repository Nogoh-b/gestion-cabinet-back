/**
 * V2 - Ajoute le fallback substring includes() pour la régression singulier/pluriel
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'core', 'ai-database', 'ai-database.service.ts');
let content = fs.readFileSync(filePath, 'utf-8');
const hasCRLF = content.includes('\r\n');
const normalized = content.replace(/\r\n/g, '\n');

// Repérer la nouvelle méthode detectRelevantTables 
const startMarker = '  /**\n  * Detecte automatiquement les tables pertinentes avec matching ameliore :';
const endMarker = '  /**\n  * Retourne la liste des tables visibles par défaut';

const startIdx = normalized.indexOf(startMarker);
const endIdx = normalized.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.log('❌ Marqueurs non trouvés');
  process.exit(1);
}

const before = normalized.substring(0, startIdx);
const methodSection = normalized.substring(startIdx, endIdx);
const after = normalized.substring(endIdx);

// Remplacer le bloc de matching pour ajouter le fallback substring
const oldMatchBlock = `        // 2. Word-level matching avec stemming
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
        }`;

const newMatchBlock = `        // 2. Word-level matching avec stemming
        // Ex: "documents" (stem="document") match "document" dans "document_customer"
        const wordMatch = tableWords.some(w => w === keyword || w === stem);
        const stemMatch = tableStems.some(s => s === keyword || s === stem);
        
        if (wordMatch || stemMatch) {
          score += 5;
          reasons.push(\`word_match:\${keyword}\`);
        }
        
        // 2b. Fallback substring (pReserve l'ancien comportement: "dossier" matche "dossiers")
        if (tableName.toLowerCase().includes(keyword)) {
          score += 3;
          reasons.push(\`contains_match:\${keyword}\`);
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
        
        // 3b. Fallback substring label (ex: "Dossiers contentieux" contient "dossier")
        if (businessName.includes(keyword)) {
          score += 4;
          reasons.push(\`label_contains:\${keyword}\`);
        }`;

const newMethodSection = methodSection.split(oldMatchBlock).join(newMatchBlock);

if (newMethodSection === methodSection) {
  console.log('⚠️ Bloc de matching non trouve. Verification du contenu...');
  // Vérifier ce qu'on a
  if (methodSection.includes('wordMatch')) {
    console.log('✅ wordMatch présent dans la méthode');
  }
  if (methodSection.includes('contains_match')) {
    console.log('✅ contains_match déjà présent');
    process.exit(0);
  }
} else {
  console.log('✅ Bloc de matching mis à jour');
}

let modified = before + newMethodSection + after;

// Restaurer les line endings
if (hasCRLF) {
  modified = modified.replace(/\n/g, '\r\n');
}

fs.writeFileSync(filePath, modified, 'utf-8');
console.log('✅ Fichier sauvegardé');

// Vérifications finales
const verify = fs.readFileSync(filePath, 'utf-8');
console.log('✅ contains_match présent:', verify.includes('contains_match'));
console.log('✅ label_contains présent:', verify.includes('label_contains'));
console.log('✅ wordMatch présent:', verify.includes('wordMatch'));
console.log('✅ stemKeyword présent:', verify.includes('stemKeyword'));
console.log('🎯 V2 terminée avec succès !');
