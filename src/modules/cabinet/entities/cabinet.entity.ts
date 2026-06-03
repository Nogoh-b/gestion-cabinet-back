import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Plan } from 'src/modules/plans/entities/plan.entity';
import { logoFileToUrl } from '../cabinet-logo.util';

export type CabinetStatus = 'active' | 'trial' | 'suspended';
export type CabinetPlan   =
  | 'free' | 'avocat' | 'cabinet' | 'firme'
  // legacy
  | 'starter' | 'pro' | 'business' | 'enterprise';

@Entity('cabinets')
export class Cabinet {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Code court généré à la création — ex: "xk7m2p8a"
   * Utilisé pour les 2 modes de routing :
   *   subdomain : xk7m2p8a.mon-app.com
   *   path      : mon-app.com/t/xk7m2p8a
   */
  @Column({ unique: true, length: 12 })
  code: string;

  @Column()
  name: string;

  @Column({ default: 'trial' })
  status: CabinetStatus;

  /** Champ historique — conservé pour compatibilité. Utiliser activePlan pour les quotas. */
  @Column({ nullable: true })
  plan: CabinetPlan;

  /** Référence vers l'entité Plan (quotas, tarification, IA). */
  @Column({ type: 'int', nullable: true, name: 'plan_id' })
  plan_id: number | null;

  @ManyToOne(() => Plan, { nullable: true, eager: false })
  @JoinColumn({ name: 'plan_id' })
  activePlan: Plan;

  /** Mode de routing préféré pour ce cabinet */
  @Column({ default: 'path' })
  routing_mode: 'subdomain' | 'path';

  @Column({ nullable: true })
  trial_ends_at: Date;

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
  logo: Buffer | null;

  /** Type MIME du logo (ex: image/png) — nécessaire pour reconstruire le data-URI. */
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'logo_mime' })
  logo_mime: string | null;

  /**
   * Chemin RELATIF (sous `uploads/`) du logo écrit en fichier statique, ex:
   * `cabinets/logo-1-1700000000.png`. Sert à exposer une URL HTTP hébergée
   * (`logo_url`) plutôt qu'un data-URI base64 — indispensable pour que le logo
   * s'affiche dans les e-mails (Gmail/Outlook bloquent les `data:` URI).
   */
  @Column({ type: 'varchar', length: 255, nullable: true, name: 'logo_file' })
  logo_file: string | null;

  /** Couleur principale de la marque (hex, ex: #1d4ed8) pour les e-mails. */
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'brand_color' })
  brand_color: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'contact_email' })
  contact_email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'contact_phone' })
  contact_phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  /** Slogan / devise affiché sur la page de login et les en-têtes. */
  @Column({ type: 'text', nullable: true })
  slogan: string | null;

  /** Texte de pied de page personnalisé pour les e-mails. */
  @Column({ type: 'text', nullable: true, name: 'email_footer' })
  email_footer: string | null;

  // ── Apparence (anciennement app_settings) ─────────────────────────────────

  /** 🎨 Thème nommé (palette claire). Ignoré en mode sombre. */
  @Column({
    type: 'enum',
    enum: ['ocean', 'silver', 'yellow', 'forest', 'sunset', 'rose'],
    default: 'ocean',
  })
  theme_name: 'ocean' | 'silver' | 'yellow' | 'forest' | 'sunset' | 'rose';

  /** Polices configurables (clés de FONTS côté front). */
  @Column({ length: 50, default: 'inter', name: 'font_ui' })
  font_ui: string;

  @Column({ length: 50, default: 'inter', name: 'font_heading' })
  font_heading: string;

  @Column({ length: 50, default: 'jetbrains_mono', name: 'font_mono' })
  font_mono: string;

  // ── Informations légales (anciennement app_settings) ──────────────────────

  @Column({ type: 'varchar', length: 100, nullable: true })
  rccm: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  nina: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'bank_account' })
  bank_account: string | null;

  // ── Configuration régionale (anciennement app_settings) ───────────────────

  @Column({ length: 10, default: 'fr', name: 'app_locale' })
  app_locale: string;

  @Column({ length: 20, default: 'dd/MM/yyyy', name: 'date_format' })
  date_format: string;

  @Column({ length: 10, default: 'XAF' })
  currency: string;

  // ── Numérotation (anciennement app_settings) ──────────────────────────────

  @Column({ length: 20, default: 'FAC-', name: 'invoice_prefix' })
  invoice_prefix: string;

  /** Largeur du compteur de facture (padding zéros). Ex: 4 → 0001. */
  @Column({ type: 'int', default: 4, name: 'invoice_padding' })
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
  invoice_numbering_strategy: 'yearly' | 'monthly' | 'continuous';

  @Column({ length: 20, default: 'DOS-', name: 'dossier_prefix' })
  dossier_prefix: string;

  // ── Horaires (anciennement app_settings) ──────────────────────────────────

  @Column({ length: 5, default: '08:00', name: 'working_hours_start' })
  working_hours_start: string;

  @Column({ length: 5, default: '17:00', name: 'working_hours_end' })
  working_hours_end: string;

  // ── Notifications & e-mail (anciennement app_settings) ─────────────────────

  @Column({ type: 'boolean', default: true, name: 'notification_email' })
  notification_email: boolean;

  @Column({ type: 'boolean', default: false, name: 'notification_sms' })
  notification_sms: boolean;

  @Column({ type: 'json', nullable: true, name: 'smtp_config' })
  smtp_config: object | null;

  // ── Templates métier (anciennement app_settings) ──────────────────────────

  @Column({ type: 'longtext', nullable: true, name: 'payslip_template' })
  payslip_template: string | null;

  @Column({ type: 'longtext', nullable: true, name: 'invoice_template' })
  invoice_template: string | null;

  @Column({ type: 'longtext', nullable: true, name: 'dossier_template' })
  dossier_template: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
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
