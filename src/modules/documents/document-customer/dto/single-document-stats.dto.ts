// src/modules/documents/document-customer/dto/single-document-stats.dto.ts
export class SingleDocumentStatsDto {
  // Informations générales du document
  document: {
    id: number;
    nom: string;
    description?: string;
    type: string;
    categorie: string;
    statut: number;
    statutLabel: string;
    version: number;
    estVersionCourante: boolean;
    dateUpload: Date;
    dateModification: Date;
    dateValidation?: Date;
    dateExpiration?: Date;
  };

  // Informations sur le fichier
  fichier: {
    chemin: string;
    url: string;
    taille: number;
    tailleFormatee: string;
    mimetype: string;
    extension: string;
  };

  // Dossier associé
  dossier?: {
    id: number;
    numero: string;
    objet: string;
    client: string;
    avocat: string;
  };

  // Client associé
  client?: {
    id: number;
    nom: string;
    email?: string;
    telephone?: string;
  };

  // Uploader
  uploader?: {
    id: number;
    nom: string;
    email: string;
    dateUpload: Date;
  };

  // Métadonnées
  metadonnees: {
    motsCles?: string[];
    nombrePages?: number;
    langue?: string;
    nomOriginal?: string;
  };

  // Versions précédentes
  versionsPrecedentes: Array<{
    id: number;
    version: number;
    dateUpload: Date;
    uploader: string;
    taille: string;
  }>;

  // Audiences associées
  audiences: Array<{
    id: number;
    titre: string;
    date: Date;
    jurisdiction: string;
  }>;

  // Diligences associées
  diligences: Array<{
    id: number;
    titre: string;
    statut: string;
    deadline: Date;
  }>;

  // Historique des actions
  historique: Array<{
    action: string;
    utilisateur: string;
    date: Date;
    details?: string;
  }>;
}