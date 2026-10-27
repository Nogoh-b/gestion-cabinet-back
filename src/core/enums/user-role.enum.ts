export enum UserRole {
  ADMIN = 'admin',
  AVOCAT = 'avocat',
  COLLABORATEUR = 'collaborateur',
  COMPTABLE = 'comptable',
  SECRETAIRE = 'secretaire',
  CLIENT = 'client',
  STAGIAIRE = 'stagiaire',
  HUISSIER = 'huissier',
  /** Personnel de support : accès opérationnel restreint, sans finance. */
  SUPPORT = 'support',
  /** Apporteur d'affaire : ne voit que ses propres apports et commissions. */
  APPORTEUR_AFFAIRE = 'apporteur_affaire',
}
