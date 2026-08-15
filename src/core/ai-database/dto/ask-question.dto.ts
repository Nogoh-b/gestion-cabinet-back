import { IsString, IsOptional, IsArray, IsBoolean, MinLength, MaxLength, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AskQuestionDto {

  conversationId?: string;  // Optionnel : si non fourni, on crée une nouvelle conversation
  @ApiProperty({ 
    description: 'Question en langage naturel sur votre base de données',
    example: 'Quel est le taux de succès par avocat pour 2025 ?'
  })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  question: string = ''; 

  @ApiProperty({ 
    description: 'Tables spécifiques à utiliser (optionnel)', 
    required: false,
    example: ['dossiers', 'employee', 'audiences']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specificTables?: string[];

  analyzeOnly = true

  @ApiProperty({ 
    description: 'Mode verbose pour voir les étapes intermédiaires',
    required: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  verbose?: boolean;
  
  @ApiProperty({ required: false, description: 'Fichier à analyser (PDF, TXT, etc.)' })
  @IsOptional()
  fileContent?: string;

  @ApiProperty({ required: false, description: 'Nom du fichier' })
  @IsOptional()
  fileName?: string;

  /**
   * Mode "génération de texte uniquement".
   * Court-circuite la détection d'intention (READ/WRITE/CONVERSATIONAL)
   * et appelle directement le LLM pour générer du texte (HTML, plain…).
   * Utilisé par la modale de génération IA des éditeurs (ex: corps d'email),
   * où la sortie attendue est un texte à afficher, jamais une opération en base.
   */
  @ApiProperty({
    required: false,
    description: "Mode 'génération de texte pure' — désactive la détection d'intention.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  textGenerationOnly?: boolean;

  /**
   * Entités explicitement référencées par l'utilisateur via les mentions `@`
   * dans le champ de saisie (client, dossier, collaborateur…).
   *
   * Transmis en multipart/form-data → reçu sous forme de **chaîne JSON**
   * (sérialisée côté front par `JSON.stringify`). On la parse dans le service
   * via {@link parseReferencedContext} pour enrichir le prompt avec les IDs
   * exacts, ce qui lève l'ambiguïté (« ce client », « ce dossier »…).
   *
   * Forme attendue après parsing :
   *   [{ type: 'client', label: 'Société Dupont', data: { id: 42, ... } }]
   */
  @ApiProperty({
    required: false,
    description: 'Entités référencées via @ (chaîne JSON : [{type,label,data}]).',
  })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiProperty({
    required: false,
    description: "Mode d'intention explicite. 'auto' laisse le backend classifier.",
    enum: ['auto', 'read', 'write', 'chat'],
    default: 'auto',
  })
  @IsOptional()
  @IsIn(['auto', 'read', 'write', 'chat'])
  intentMode?: 'auto' | 'read' | 'write' | 'chat';

  @ApiProperty({
    required: false,
    description:
      "Niveau de réflexion du modèle. 'fast' = moins de réflexion (plus rapide), 'precise' = réflexion complète.",
    enum: ['fast', 'balanced', 'precise'],
    default: 'fast',
  })
  @IsOptional()
  @IsIn(['fast', 'balanced', 'precise'])
  reasoningLevel?: 'fast' | 'balanced' | 'precise';

  @ApiProperty({
    required: false,
    description: 'IDs de documents systeme a lire/analyser (array JSON ou liste separee par virgules en multipart).',
  })
  @IsOptional()
  documentIds?: number[] | string;

  @ApiProperty({
    required: false,
    description: 'Historique visible envoye par le front pour les branches de conversation (JSON).',
  })
  @IsOptional()
  @IsString()
  historyOverride?: string;
}

/** Une entité référencée via `@` côté front, après parsing du JSON. */
export interface ReferencedEntityContext {
  type: string;
  label: string;
  id?: string | number;
  href?: string;
  meta?: Record<string, any>;
  data?: Record<string, any> & { id?: string | number };
}

export interface VisibleHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function parseVisibleHistory(raw?: string): VisibleHistoryMessage[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        role: item.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: String(item.content ?? '').trim(),
      }))
      .filter(item => item.content.length > 0)
      .slice(-12);
  } catch {
    return [];
  }
}

/**
 * Parse de façon défensive le champ `context` (chaîne JSON multipart) en une
 * liste typée. Retourne `[]` en cas d'absence ou de JSON invalide — ce contexte
 * est un *enrichissement* optionnel, il ne doit jamais faire échouer la requête.
 */
export function parseReferencedContext(raw?: string): ReferencedEntityContext[] {
  if (!raw || typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cleanText = (value: unknown): string => String(value ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
    return parsed
      .filter(it => it && typeof it === 'object' && typeof it.label === 'string')
      .map(it => ({
        type: typeof it.type === 'string' ? it.type : 'entité',
        label: cleanText(it.label),
        id: it.id ?? it.data?.id,
        href: typeof it.href === 'string' && it.href.startsWith('/') ? it.href : undefined,
        meta: it.meta && typeof it.meta === 'object' ? it.meta : undefined,
        data: it.data && typeof it.data === 'object'
          ? { ...it.data, ...(it.meta && typeof it.meta === 'object' ? it.meta : {}), id: it.id ?? it.data?.id }
          : { ...(it.meta && typeof it.meta === 'object' ? it.meta : {}), id: it.id },
      }));
  } catch {
    return [];
  }
}

export interface QueryExecutionResult {
  success: boolean;
  data?: any[];
  rowCount?: number;
  error?: string;
  sqlQuery?: string;
}
