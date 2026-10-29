import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
import { Plan } from 'src/modules/plans/entities/plan.entity';
import type {
  FontSize,
  SidebarStyle,
  ThemeName,
} from 'src/modules/settings/appearance.constants';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { logoFileToUrl } from '../cabinet-logo.util';

export type CabinetStatus = 'active' | 'trial' | 'suspended';
/**
 * Origine d'une suspension :
 *  - payment_required : paiement initial/renouvellement non encore réglé ;
 *  - expired          : abonnement arrivé à échéance ;
 *  - manual           : décision de la plateforme (jamais levée automatiquement).
 */
export type CabinetSuspensionReason = 'payment_required' | 'expired' | 'manual';
export type CabinetPlan =
  | 'free'
  | 'avocat'
  | 'cabinet'
  | 'firme'
  // legacy
  | 'starter'
  | 'pro'
  | 'business'
  | 'enterprise';

@Entity('cabinets')
// Lu et modifié par l'IA pour le seul cabinet courant (ai-scoped-tables.ts) ;
// les écritures passent par CabinetWriteHandler, jamais par le handler générique.
@BusinessTable({
  label: 'Cabinet',
  description:
    "Informations du cabinet courant (une seule ligne) : nom, coordonnées, mentions légales (RCCM, NINA, compte bancaire), devise, TVA, numérotation, horaires et frais d'ouverture.",
  icon: '🏛️',
  category: 'administration',
  readOnly: true,
})
export class Cabinet {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant du cabinet (= tenant_id des autres tables)',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  /**
   * Code court généré à la création — ex: "xk7m2p8a"
   * Utilisé pour les 2 modes de routing :
   *   subdomain : xk7m2p8a.mon-app.com
   *   path      : mon-app.com/t/xk7m2p8a
   */
  @Column({ unique: true, length: 12 })
  @BusinessColumn({
    label: 'Code du cabinet',
    description:
      "Code court du cabinet, utilisé dans l'adresse de l'application",
    importance: 'low',
    group: 'identification',
  })
  code: string;

  @Column()
  @BusinessColumn({
    label: 'Nom du cabinet',
    description: 'Raison sociale / nom affiché du cabinet',
    importance: 'critical',
    group: 'identification',
  })
  name: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  @BusinessColumn({
    label: 'Profil de référentiel',
    description: 'Non exposé',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  reference_profile_id: string | null;

  @Column({ length: 150, default: 'Cabinet - Tous les collaborateurs' })
  @BusinessColumn({
    label: 'Groupe de discussion',
    description: 'Non exposé',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  default_chat_group_name: string;

  @Column({ default: 'trial' })
  @BusinessColumn({
    label: 'Statut',
    description: 'Non exposé',
    importance: 'low',
    group: 'plateforme',
    ignored: true,
  })
  status: CabinetStatus;

  /** Champ historique — conservé pour compatibilité. Utiliser activePlan pour les quotas. */
  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Plan (historique)',
    description: 'Non exposé',
    importance: 'low',
    group: 'plateforme',
    ignored: true,
  })
  plan: CabinetPlan;

  /** Référence vers l'entité Plan (quotas, tarification, IA). */
  @Column({ type: 'int', nullable: true, name: 'plan_id' })
  @BusinessColumn({
    label: 'Plan',
    description: 'Non exposé',
    importance: 'low',
    group: 'plateforme',
    ignored: true,
  })
  plan_id: number | null;

  @ManyToOne(() => Plan, { nullable: true, eager: false })
  @JoinColumn({ name: 'plan_id' })
  activePlan: Plan;

  /** Mode de routing préféré pour ce cabinet */
  @Column({ default: 'path' })
  @BusinessColumn({
    label: 'Routage',
    description: 'Non exposé',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  routing_mode: 'subdomain' | 'path';

  @Column({ type: 'datetime', nullable: true })
  @BusinessColumn({
    label: "Fin d'essai",
    description: 'Non exposé',
    importance: 'low',
    group: 'plateforme',
    ignored: true,
  })
  trial_ends_at: Date | null;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
    name: 'suspension_reason',
  })
  @BusinessColumn({
    label: 'Motif de suspension',
    description: 'Non exposé',
    importance: 'low',
    group: 'plateforme',
    ignored: true,
  })
  suspension_reason: CabinetSuspensionReason | null;

  @Column({ type: 'datetime', nullable: true, name: 'suspended_at' })
  @BusinessColumn({
    label: 'Suspendu le',
    description: 'Non exposé',
    importance: 'low',
    group: 'plateforme',
    ignored: true,
  })
  suspended_at: Date | null;

  @Column({ type: 'int', nullable: true, name: 'suspended_by_admin_id' })
  @BusinessColumn({
    label: 'Suspendu par',
    description: 'Non exposé',
    importance: 'low',
    group: 'plateforme',
    ignored: true,
  })
  suspended_by_admin_id: number | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    name: 'suspension_note',
  })
  @BusinessColumn({
    label: 'Note de suspension',
    description: 'Non exposé',
    importance: 'low',
    group: 'plateforme',
    ignored: true,
  })
  suspension_note: string | null;

  // ── Branding / coordonnées (utilisés dans les en-têtes/pieds d'e-mail) ─────
  // NOTE: ces champs constituent la source de configuration UNIQUE du cabinet
  // (anciennement éclatée entre `cabinets` et la table `app_settings`).

  /**
   * Logo du cabinet stocké en BINAIRE (blob) — plus léger que le base64 en BDD.
   * Le format de transport côté API reste un data-URI (`logo_url`), reconstruit
   * à la lecture via {@link cabinetLogoToDataUri} et décodé à l'écriture via
   * {@link parseLogoInput}. Aucun consommateur (front, PDF, e-mails) n'a donc
   * à changer : ils continuent de manipuler une chaîne `logo_url`.
   */
  @Column({ type: 'longblob', nullable: true, name: 'logo' })
  @BusinessColumn({
    label: 'Logo',
    description: 'Non exposé',
    importance: 'low',
    group: 'image',
    ignored: true,
  })
  logo: Buffer | null;

  /** Type MIME du logo (ex: image/png) — nécessaire pour reconstruire le data-URI. */
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'logo_mime' })
  @BusinessColumn({
    label: 'Type du logo',
    description: 'Non exposé',
    importance: 'low',
    group: 'image',
    ignored: true,
  })
  logo_mime: string | null;

  /**
   * Chemin RELATIF (sous `uploads/`) du logo écrit en fichier statique, ex:
   * `cabinets/logo-1-1700000000.png`. Sert à exposer une URL HTTP hébergée
   * (`logo_url`) plutôt qu'un data-URI base64 — indispensable pour que le logo
   * s'affiche dans les e-mails (Gmail/Outlook bloquent les `data:` URI).
   */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'logo_file' })
  @BusinessColumn({
    label: 'Fichier du logo',
    description: 'Non exposé',
    importance: 'low',
    group: 'image',
    ignored: true,
  })
  logo_file: string | null;

  /** Couleur principale de la marque (hex, ex: #1d4ed8) pour les e-mails. */
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'brand_color' })
  @BusinessColumn({
    label: 'Couleur de la marque',
    description: 'Couleur principale des e-mails (hexadécimal, ex. #1d4ed8)',
    importance: 'low',
    group: 'identite',
  })
  brand_color: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'contact_email',
  })
  @BusinessColumn({
    label: 'E-mail du cabinet',
    description: 'Adresse e-mail de contact du cabinet',
    format: 'email',
    importance: 'high',
    group: 'coordonnees',
  })
  contact_email: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'contact_phone',
  })
  @BusinessColumn({
    label: 'Téléphone du cabinet',
    description: 'Numéro de téléphone du cabinet',
    format: 'phone',
    importance: 'high',
    group: 'coordonnees',
  })
  contact_phone: string | null;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Adresse du cabinet',
    description: 'Adresse postale du cabinet',
    importance: 'high',
    group: 'coordonnees',
  })
  address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  @BusinessColumn({
    label: 'Site web',
    description: 'Site internet du cabinet',
    importance: 'medium',
    group: 'coordonnees',
  })
  website: string | null;

  /** Slogan / devise affiché sur la page de login et les en-têtes. */
  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Slogan',
    description: 'Devise affichée sur la page de connexion et les en-têtes',
    importance: 'medium',
    group: 'identite',
  })
  slogan: string | null;

  /** Texte de pied de page personnalisé pour les e-mails. */
  @Column({ type: 'text', nullable: true, name: 'email_footer' })
  @BusinessColumn({
    label: 'Pied de page des e-mails',
    description: 'Texte ajouté en bas des e-mails envoyés',
    importance: 'low',
    group: 'identite',
  })
  email_footer: string | null;

  // ── Apparence (anciennement app_settings) ─────────────────────────────────

  // L'apparence est personnelle (`user_settings`) : les champs ci-dessous sont
  // les DÉFAUTS copiés sur chaque nouveau membre du cabinet.

  /** 🎨 Thème nommé par défaut (voir THEME_NAMES). */
  @Column({ type: 'varchar', length: 20, default: 'midnight' })
  @BusinessColumn({
    label: 'Thème par défaut',
    description: 'Non exposé',
    importance: 'low',
    group: 'apparence',
    ignored: true,
  })
  theme_name: ThemeName;

  /** Polices par défaut (clés de FONTS côté front). */
  @Column({ length: 50, default: 'outfit', name: 'font_ui' })
  @BusinessColumn({
    label: 'Police',
    description: 'Non exposé',
    importance: 'low',
    group: 'apparence',
    ignored: true,
  })
  font_ui: string;

  @Column({ length: 50, default: 'outfit', name: 'font_heading' })
  @BusinessColumn({
    label: 'Police des titres',
    description: 'Non exposé',
    importance: 'low',
    group: 'apparence',
    ignored: true,
  })
  font_heading: string;

  @Column({ length: 50, default: 'jetbrains_mono', name: 'font_mono' })
  @BusinessColumn({
    label: 'Police à chasse fixe',
    description: 'Non exposé',
    importance: 'low',
    group: 'apparence',
    ignored: true,
  })
  font_mono: string;

  /** Taille de texte par défaut des nouveaux membres. */
  @Column({
    type: 'varchar',
    length: 5,
    default: 'lg',
    name: 'default_font_size',
  })
  @BusinessColumn({
    label: 'Taille de texte',
    description: 'Non exposé',
    importance: 'low',
    group: 'apparence',
    ignored: true,
  })
  default_font_size: FontSize;

  /** Style de sidebar par défaut des nouveaux membres. */
  @Column({
    type: 'varchar',
    length: 10,
    default: 'tinted',
    name: 'default_sidebar_style',
  })
  @BusinessColumn({
    label: 'Style du menu',
    description: 'Non exposé',
    importance: 'low',
    group: 'apparence',
    ignored: true,
  })
  default_sidebar_style: SidebarStyle;

  // ── Informations légales (anciennement app_settings) ──────────────────────

  @Column({ type: 'varchar', length: 100, nullable: true })
  @BusinessColumn({
    label: 'RCCM',
    description: 'Numéro du Registre du commerce et du crédit mobilier',
    example: 'RC/YAO/2024/B/1234',
    importance: 'critical',
    group: 'legal',
  })
  rccm: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @BusinessColumn({
    label: 'NINA / NIU',
    description: "Numéro d'identification fiscale du cabinet",
    importance: 'high',
    group: 'legal',
  })
  nina: string | null;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'bank_account',
  })
  @BusinessColumn({
    label: 'Compte bancaire',
    description: 'RIB / IBAN imprimé sur les factures',
    importance: 'high',
    group: 'legal',
  })
  bank_account: string | null;

  // ── Configuration régionale (anciennement app_settings) ───────────────────

  @Column({ length: 10, default: 'fr', name: 'app_locale' })
  @BusinessColumn({
    label: 'Langue',
    description: "Langue de l'application (fr, en)",
    importance: 'low',
    group: 'regional',
  })
  app_locale: string;

  @Column({ length: 20, default: 'dd/MM/yyyy', name: 'date_format' })
  @BusinessColumn({
    label: 'Format de date',
    description: 'Format des dates (ex. dd/MM/yyyy)',
    importance: 'low',
    group: 'regional',
  })
  date_format: string;

  @Column({ length: 10, default: 'XAF' })
  @BusinessColumn({
    label: 'Devise',
    description: 'Code ISO de la devise (XAF, EUR, USD…)',
    example: 'XAF',
    importance: 'high',
    group: 'devise',
  })
  currency: string;

  /** Symbole affiché (ex : 'FCFA', '€', '$'). Null = utiliser le code ISO. */
  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'currency_symbol',
  })
  @BusinessColumn({
    label: 'Symbole monétaire',
    description: 'Symbole affiché (FCFA, €, $) ; vide = code ISO',
    importance: 'medium',
    group: 'devise',
  })
  currency_symbol: string | null;

  /** Position du symbole par rapport au montant : avant ou après. */
  @Column({
    type: 'enum',
    enum: ['before', 'after'],
    default: 'after',
    name: 'currency_symbol_position',
  })
  @BusinessColumn({
    label: 'Position du symbole',
    description: 'BD: before=Avant le montant, after=Après le montant',
    importance: 'low',
    group: 'devise',
  })
  currency_symbol_position: 'before' | 'after';

  /** Nombre de décimales (0 pour XAF, 2 pour EUR/USD). */
  @Column({ type: 'int', default: 0, name: 'currency_decimals' })
  @BusinessColumn({
    label: 'Décimales',
    description: 'Nombre de décimales des montants (0 pour XAF)',
    importance: 'low',
    group: 'devise',
  })
  currency_decimals: number;

  /** Séparateur de milliers (ex : ' ', '.', ','). */
  @Column({
    type: 'varchar',
    length: 5,
    default: ' ',
    name: 'currency_thousands_sep',
  })
  @BusinessColumn({
    label: 'Séparateur de milliers',
    description: 'Caractère entre les milliers',
    importance: 'low',
    group: 'devise',
  })
  currency_thousands_sep: string;

  /** Séparateur décimal (ex : ',', '.'). */
  @Column({
    type: 'varchar',
    length: 5,
    default: ',',
    name: 'currency_decimal_sep',
  })
  @BusinessColumn({
    label: 'Séparateur décimal',
    description: 'Caractère avant les décimales',
    importance: 'low',
    group: 'devise',
  })
  currency_decimal_sep: string;

  // ── Numérotation (anciennement app_settings) ──────────────────────────────

  @Column({ length: 20, default: 'FAC-', name: 'invoice_prefix' })
  @BusinessColumn({
    label: 'Préfixe des factures',
    description: 'Préfixe des numéros de facture',
    example: 'FAC-',
    importance: 'medium',
    group: 'numerotation',
  })
  invoice_prefix: string;

  /** Largeur du compteur de facture (padding zéros). Ex: 4 → 0001. */
  @Column({ type: 'int', default: 4, name: 'invoice_padding' })
  @BusinessColumn({
    label: 'Chiffres du compteur de facture',
    description: 'Nombre de chiffres du compteur (4 → 0001)',
    importance: 'low',
    group: 'numerotation',
  })
  invoice_padding: number;

  /**
   * Stratégie de remise à zéro du compteur de facture :
   *  - yearly    : FAC-2026-0001 (reset chaque année — défaut)
   *  - monthly   : FAC-202605-0001 (reset chaque mois)
   *  - continuous: FAC-0001 (jamais de reset)
   */
  @Column({
    type: 'enum',
    enum: ['yearly', 'monthly', 'continuous'],
    default: 'yearly',
    name: 'invoice_numbering_strategy',
  })
  @BusinessColumn({
    label: 'Remise à zéro des factures',
    description:
      'BD: yearly=Chaque année, monthly=Chaque mois, continuous=Jamais',
    importance: 'medium',
    group: 'numerotation',
  })
  invoice_numbering_strategy: 'yearly' | 'monthly' | 'continuous';

  @Column({ length: 20, default: 'DOS-', name: 'dossier_prefix' })
  @BusinessColumn({
    label: 'Préfixe des dossiers',
    description: 'Préfixe des numéros de dossier',
    example: 'DOS-',
    importance: 'medium',
    group: 'numerotation',
  })
  dossier_prefix: string;

  /**
   * Gabarit de numérotation des factures. Les jetons disponibles sont :
   *  {PREFIX}  → invoice_prefix  (ex: "FAC-")
   *  {YYYY}    → année sur 4 chiffres
   *  {MM}      → mois sur 2 chiffres
   *  {NNNN}    → compteur paddé selon invoice_padding
   *
   * Exemples :
   *  "{PREFIX}{YYYY}-{NNNN}"   → FAC-2026-0001  (défaut)
   *  "{YYYY}/{NNNN}"           → 2026/0001       (Afrique francophone)
   *  "{NNNN}/{YYYY}"           → 0001/2026       (format notarial / tribunaux)
   *  "{PREFIX}{YYYY}{MM}-{NNNN}" → FAC-202605-0001 (mensuel)
   */
  @Column({
    type: 'varchar',
    length: 60,
    default: '{PREFIX}{YYYY}-{NNNN}',
    name: 'invoice_number_format',
  })
  @BusinessColumn({
    label: 'Format des numéros de facture',
    description: 'Gabarit avec {PREFIX}, {YYYY}, {MM}, {NNNN}',
    example: '{PREFIX}{YYYY}-{NNNN}',
    importance: 'medium',
    group: 'numerotation',
  })
  invoice_number_format: string;

  /**
   * Gabarit de numérotation des dossiers. Mêmes jetons qu'invoice_number_format
   * plus {DOSSIER_PREFIX} = dossier_prefix.
   *
   * Exemples :
   *  "{PREFIX}{YYYY}-{NNNN}"   → DOS-2026-0001  (défaut)
   *  "{YYYY}/{NNNN}"           → 2026/0001
   *  "{NNNN}/{YYYY}"           → 0001/2026
   *  "{YY}{MM}{DD}-{NNNN}"     → 260922-0001
   */
  @Column({
    type: 'varchar',
    length: 60,
    default: '{PREFIX}{YYYY}-{NNNN}',
    name: 'dossier_number_format',
  })
  @BusinessColumn({
    label: 'Format des numéros de dossier',
    description: 'Gabarit avec {PREFIX}, {YYYY}, {MM}, {DD}, {NNNN}',
    example: '{PREFIX}{YYYY}-{NNNN}',
    importance: 'medium',
    group: 'numerotation',
  })
  dossier_number_format: string;

  /**
   * Taux de TVA par défaut appliqué à la facturation (ex: 19.25 pour le
   * Cameroun, 20 pour la France, 0 si exonéré). Peut être surchargé par
   * facture.
   */
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    name: 'default_tva_rate',
  })
  @BusinessColumn({
    label: 'Taux de TVA par défaut',
    description: 'Taux de TVA appliqué aux factures (ex. 19.25)',
    format: 'percentage',
    importance: 'high',
    group: 'facturation',
  })
  default_tva_rate: number;

  // ── Horaires (anciennement app_settings) ──────────────────────────────────

  @Column({ length: 5, default: '08:00', name: 'working_hours_start' })
  @BusinessColumn({
    label: "Heure d'ouverture",
    description: 'Début des horaires de travail (HH:MM)',
    importance: 'medium',
    group: 'horaires',
  })
  working_hours_start: string;

  @Column({ length: 5, default: '17:00', name: 'working_hours_end' })
  @BusinessColumn({
    label: 'Heure de fermeture',
    description: 'Fin des horaires de travail (HH:MM)',
    importance: 'medium',
    group: 'horaires',
  })
  working_hours_end: string;

  // ── Notifications & e-mail (anciennement app_settings) ─────────────────────

  @Column({ type: 'boolean', default: true, name: 'notification_email' })
  @BusinessColumn({
    label: 'Notifications par e-mail',
    description: 'Envoi des notifications par e-mail',
    importance: 'low',
    group: 'notifications',
  })
  notification_email: boolean;

  @Column({ type: 'boolean', default: false, name: 'notification_sms' })
  @BusinessColumn({
    label: 'Notifications par SMS',
    description: 'Envoi des notifications par SMS',
    importance: 'low',
    group: 'notifications',
  })
  notification_sms: boolean;

  @Column({ type: 'json', nullable: true, name: 'smtp_config' })
  @BusinessColumn({
    label: 'Configuration SMTP',
    description: 'Non exposé',
    importance: 'low',
    group: 'technique',
    ignored: true,
    sensitive: true,
  })
  smtp_config: object | null;

  // ── Templates métier (anciennement app_settings) ──────────────────────────

  // ── Frais d'ouverture de dossier ──────────────────────────────────────────

  /** Active la création automatique d'une facture à l'ouverture d'un dossier. */
  @Column({
    type: 'boolean',
    default: false,
    name: 'dossier_opening_fee_enabled',
  })
  @BusinessColumn({
    label: "Frais d'ouverture activés",
    description: "Facture créée automatiquement à l'ouverture d'un dossier",
    importance: 'medium',
    group: 'frais_ouverture',
  })
  dossier_opening_fee_enabled: boolean;

  /** Montant HT des frais d'ouverture de dossier. */
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    name: 'dossier_opening_fee',
  })
  @BusinessColumn({
    label: "Frais d'ouverture (HT)",
    description: "Montant HT des frais d'ouverture de dossier",
    format: 'currency',
    importance: 'medium',
    group: 'frais_ouverture',
  })
  dossier_opening_fee: number;

  /** Taux de TVA appliqué aux frais d'ouverture (ex : 19.25 pour le Cameroun). */
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    name: 'dossier_opening_fee_tva',
  })
  @BusinessColumn({
    label: "TVA des frais d'ouverture",
    description: "Taux de TVA des frais d'ouverture",
    format: 'percentage',
    importance: 'low',
    group: 'frais_ouverture',
  })
  dossier_opening_fee_tva: number;

  /** Libellé qui apparaîtra sur la facture d'ouverture. */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'dossier_opening_fee_label',
  })
  @BusinessColumn({
    label: "Libellé des frais d'ouverture",
    description: "Libellé de la ligne de facture d'ouverture",
    importance: 'low',
    group: 'frais_ouverture',
  })
  dossier_opening_fee_label: string | null;

  @Column({ type: 'longtext', nullable: true, name: 'payslip_template' })
  @BusinessColumn({
    label: 'Gabarit de bulletin',
    description: 'Non exposé',
    importance: 'low',
    group: 'gabarits',
    ignored: true,
  })
  payslip_template: string | null;

  @Column({ type: 'longtext', nullable: true, name: 'invoice_template' })
  @BusinessColumn({
    label: 'Gabarit de facture',
    description: 'Non exposé',
    importance: 'low',
    group: 'gabarits',
    ignored: true,
  })
  invoice_template: string | null;

  @Column({ type: 'longtext', nullable: true, name: 'dossier_template' })
  @BusinessColumn({
    label: 'Gabarit de dossier',
    description: 'Non exposé',
    importance: 'low',
    group: 'gabarits',
    ignored: true,
  })
  dossier_template: string | null;

  // ── Configuration IA (par cabinet) ───────────────────────────────────────
  /**
   * Configuration IA du cabinet — JSON nullable.
   * Stocke le provider actif et les credentials par provider.
   * Exemple :
   * {
   *   "active_provider": "meta",
   *   "providers": {
   *     "deepseek": { "base_url": "https://api.deepseek.com", "api_key": "sk-...", "model": "deepseek-v4-flash" },
   *     "meta":     { "base_url": "https://api.meta.ai", "api_key": "LLM_...", "model": "muse-spark-1.3-contributor" },
   *     "freellm":  { "base_url": "https://freellm.bisoft-solutions.com/v1", "api_key": "freellmapi-...", "model": "multi-models" }
   *   }
   * }
   * Si null → fallback sur les variables d'environnement (comportement historique).
   */
  @Column({ type: 'json', nullable: true, name: 'ai_config' })
  @BusinessColumn({
    label: 'Configuration IA',
    description: 'Non exposé',
    importance: 'low',
    group: 'technique',
    ignored: true,
    sensitive: true,
  })
  ai_config: AiCabinetConfig | null;

  @Column({ type: 'json', nullable: true, name: 'billing_account_mapping' })
  @BusinessColumn({
    label: 'Comptes de facturation',
    description: 'Non exposé',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  billing_account_mapping: Record<string, string> | null;

  /**
   * Compteurs (dossiers urgents, audiences du jour, factures impayées, documents
   * en attente) affichés en badge dans la sidebar. Activé cabinet par cabinet
   * par la plateforme (`PATCH /platform/cabinets/:id/sidebar-badges`).
   */
  @Column({ type: 'boolean', default: false, name: 'sidebar_badges_enabled' })
  @BusinessColumn({
    label: 'Badges de la sidebar',
    description: 'Non exposé',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  sidebar_badges_enabled: boolean;

  /** Mots ajoutés au correcteur d'orthographe des éditeurs par les membres du cabinet. */
  @Column({ type: 'json', nullable: true, name: 'custom_dictionary' })
  @BusinessColumn({
    label: 'Dictionnaire',
    description: 'Non exposé',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  custom_dictionary: string[] | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

/** Configuration IA stockée par cabinet (colonne `ai_config`). */
export interface AiCabinetConfig {
  selection_origin?: 'platform' | 'cabinet';
  active_provider?: string;
  providers?: Record<string, AiProviderConfig>;
  /** Raccourci legacy / simple : provider actif si `providers` non utilisé. */
  base_url?: string;
  api_key?: string;
  model?: string;
}

export interface AiProviderConfig {
  label?: string;
  base_url?: string;
  api_key?: string;
  model?: string;
  is_custom?: boolean;
  fast_model?: string;
  quality_model?: string;
  streaming_model?: string;
}

// ── Helpers logo (blob ⇄ data-URI) ───────────────────────────────────────────

/**
 * Construit un data-URI affichable (`data:image/png;base64,…`) à partir du blob
 * logo + son type MIME. Renvoie `null` si aucun logo n'est stocké.
 */
export function cabinetLogoToDataUri(
  logo?: Buffer | null,
  mime?: string | null,
): string | null {
  if (!logo || !logo.length || !mime) return null;
  return `data:${mime};base64,${Buffer.from(logo).toString('base64')}`;
}

/**
 * Décode une valeur `logo_url` reçue de l'API en `{ logo, logo_mime }` :
 *  - `undefined`        → `null` (champ absent : ne rien modifier)
 *  - `null` / `''`      → `{ logo: null, logo_mime: null }` (effacement explicite)
 *  - data-URI base64    → blob + mime décodés
 *  - autre (URL http…)  → `null` (non stockable en blob : ignoré)
 */
export function parseLogoInput(
  value?: string | null,
): { logo: Buffer | null; logo_mime: string | null } | null {
  if (value === undefined) return null;
  if (value === null || value.trim() === '') {
    return { logo: null, logo_mime: null };
  }
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value.trim());
  if (!match) return null;
  return { logo: Buffer.from(match[2], 'base64'), logo_mime: match[1] };
}

/**
 * Sérialise un cabinet pour l'API : remplace le blob `logo`/`logo_mime`/`logo_file`
 * par un unique champ texte `logo_url`.
 *
 * `logo_url` est en priorité l'URL HTTP hébergée du fichier (`logo_file`), afin
 * que le logo s'affiche dans les e-mails. Repli sur le data-URI base64 si aucun
 * fichier n'a (encore) été généré (compatibilité avec les anciens logos).
 */
export function serializeCabinet<T extends Partial<Cabinet>>(
  cabinet: T,
): Omit<T, 'logo' | 'logo_mime' | 'logo_file'> & { logo_url: string | null } {
  const { logo, logo_mime, logo_file, ...rest } = cabinet as Cabinet;
  return {
    ...(rest as Omit<T, 'logo' | 'logo_mime' | 'logo_file'>),
    logo_url: logoFileToUrl(logo_file) ?? cabinetLogoToDataUri(logo, logo_mime),
  };
}
