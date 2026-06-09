// ─────────────────────────────────────────────────────────────────────────────
// Catalogue de variables d'e-mail namespacées par entité — BACKEND MIRROR
//
// ⚠️  Ce fichier est le miroir de :
//     app/components/mails/mail-variables.ts  (frontend)
//     Toute nouvelle variable doit être ajoutée dans les DEUX fichiers.
//
// Usage backend :
//   - Catalogue exposé via GET /mail-templates/variables (éditeur de templates)
//   - buildEntityMailContext() : construit le contexte nested passé à Handlebars
//     pour le rendu serveur (subscribers, render(), etc.)
//
// Convention : {{namespace.clé}} — Handlebars résout les chemins pointés
// nativement si le contexte est nested : { dossier: { numero: '...' } }.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MailVariableDef {
  key: string;
  label: string;
  example?: string;
}

export interface MailVariableGroup {
  namespace: string;
  label: string;
  variables: MailVariableDef[];
}

// ── Labels enums ─────────────────────────────────────────────────────────────

export const DOSSIER_STATUS_LABELS: Record<number, string> = {
  0:  'Ouvert',
  1:  'Analyse préliminaire',
  2:  'Amiable',
  3:  'Contentieux',
  4:  'Jugement',
  5:  'Appel',
  6:  'Cassation',
  7:  'Exécution',
  8:  'Clôturé',
  9:  'Archivé',
  10: 'Abandonné',
};

// ── Catalogue ─────────────────────────────────────────────────────────────────

export const MAIL_VARIABLE_GROUPS: MailVariableGroup[] = [
  {
    namespace: 'cabinet',
    label: 'Cabinet',
    variables: [
      { key: 'cabinet.nom',       label: 'Nom du cabinet',       example: 'Cabinet Maître Dupont' },
      { key: 'cabinet.email',     label: 'E-mail de contact',    example: 'contact@cabinet.fr'    },
      { key: 'cabinet.telephone', label: 'Téléphone',            example: '+33 1 23 45 67 89'     },
      { key: 'cabinet.adresse',   label: 'Adresse',              example: '12 rue de la Justice'  },
      { key: 'cabinet.site_web',  label: 'Site web',             example: 'https://cabinet.fr'    },
    ],
  },
  {
    namespace: 'dossier',
    label: 'Dossier',
    variables: [
      { key: 'dossier.numero',             label: 'Numéro de dossier',  example: 'DOS-2024-001'          },
      { key: 'dossier.objet',              label: 'Objet',              example: 'Litige commercial'     },
      { key: 'dossier.description',        label: 'Description',        example: 'Conflit de propriété' },
      { key: 'dossier.statut',             label: 'Statut',             example: 'Contentieux'           },
      { key: 'dossier.etape',              label: 'Étape en cours',     example: 'Dépôt des conclusions' },
      { key: 'dossier.date_ouverture',     label: "Date d'ouverture",   example: '01/01/2024'            },
      { key: 'dossier.juridiction',        label: 'Juridiction',        example: 'TGI Paris'             },
      { key: 'dossier.partie_adverse',     label: 'Partie adverse',     example: 'Société XYZ'           },
      { key: 'dossier.avocat',             label: 'Avocat responsable', example: 'Me Dupont'             },
      { key: 'dossier.prochaine_audience', label: 'Prochaine audience', example: '15/03/2024'            },
      { key: 'dossier.resultat',           label: 'Résultat du dossier', example: 'Dossier clôturé favorablement' },
    ],
  },
  {
    namespace: 'client',
    label: 'Client',
    variables: [
      { key: 'client.nom',        label: 'Nom complet',          example: 'Jean Dupont'       },
      { key: 'client.email',      label: 'Adresse e-mail',       example: 'jean@exemple.fr'   },
      { key: 'client.telephone',  label: 'Téléphone',            example: '+33 6 12 34 56 78' },
      { key: 'client.entreprise', label: 'Entreprise / Société', example: 'SARL Dupont & Co.' },
      { key: 'client.adresse',    label: 'Adresse',              example: '5 rue Victor Hugo'  },
    ],
  },
  {
    namespace: 'facture',
    label: 'Facture',
    variables: [
      { key: 'facture.numero',        label: 'Numéro de facture', example: 'FAC-2024-0042' },
      { key: 'facture.date',          label: 'Date de facture',   example: '01/02/2024'    },
      { key: 'facture.echeance',      label: "Date d'échéance",   example: '01/03/2024'    },
      { key: 'facture.montant_ttc',   label: 'Montant TTC',       example: '1 500,00'      },
      { key: 'facture.montant_paye',  label: 'Montant payé',      example: '750,00'        },
      { key: 'facture.reste_a_payer', label: 'Reste à payer',     example: '750,00'        },
      { key: 'facture.statut',        label: 'Statut',            example: 'En attente'    },
      { key: 'facture.type',          label: 'Type de facture',   example: 'Honoraires'    },
    ],
  },
  {
    namespace: 'audience',
    label: 'Audience',
    variables: [
      { key: 'audience.date',        label: "Date de l'audience", example: '15/03/2024'     },
      { key: 'audience.heure',       label: 'Heure',              example: '09:00'          },
      { key: 'audience.juridiction', label: 'Juridiction',        example: "Cour d'Appel"   },
      { key: 'audience.salle',       label: 'Salle',              example: 'Salle B3'       },
      { key: 'audience.juge',        label: 'Nom du juge',        example: 'M. Martin'      },
      { key: 'audience.type',        label: "Type d'audience",    example: 'Plaidoirie'     },
      { key: 'audience.statut',      label: 'Statut',             example: 'Planifiée'      },
      { key: 'audience.notes',       label: 'Notes',              example: 'Apporter pièces'},
    ],
  },
  {
    namespace: 'diligence',
    label: 'Diligence',
    variables: [
      { key: 'diligence.titre',       label: 'Titre',          example: 'Revue des documents' },
      { key: 'diligence.description', label: 'Description',    example: 'Analyser les CGV'   },
      { key: 'diligence.type',        label: 'Type',           example: 'Conformité'         },
      { key: 'diligence.statut',      label: 'Statut',         example: 'En cours'           },
      { key: 'diligence.priorite',    label: 'Priorité',       example: 'Haute'              },
      { key: 'diligence.date_debut',  label: 'Date de début',  example: '01/01/2024'         },
      { key: 'diligence.date_limite', label: 'Date limite',    example: '31/01/2024'         },
      { key: 'diligence.avocat',      label: 'Avocat assigné', example: 'Me Durand'          },
    ],
  },
  {
    namespace: 'document',
    label: 'Document',
    variables: [
      { key: 'document.nom',    label: 'Nom du document',  example: 'Contrat de bail.pdf' },
      { key: 'document.type',   label: 'Type de document', example: 'Contrat'             },
      { key: 'document.statut', label: 'Statut',           example: 'Validé'              },
      { key: 'document.date',   label: 'Date',             example: '05/01/2024'          },
    ],
  },
  {
    namespace: 'rdv',
    label: 'Rendez-vous',
    variables: [
      { key: 'rdv.date',  label: 'Date du rendez-vous',  example: '20/03/2024'       },
      { key: 'rdv.heure', label: 'Heure du rendez-vous', example: '14:30'            },
      { key: 'rdv.lieu',  label: 'Lieu du rendez-vous',  example: 'Cabinet - Douala' },
    ],
  },
  {
    namespace: 'date',
    label: 'Dates système',
    variables: [
      { key: 'date.aujourdhui', label: "Aujourd'hui", example: new Date().toLocaleDateString('fr-FR') },
      { key: 'date.annee',      label: 'Année',       example: String(new Date().getFullYear())        },
    ],
  },
];

// ── Formatage ─────────────────────────────────────────────────────────────────

function fmt(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return value.toLocaleString('fr-FR');
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(s)) {
    try { return new Date(s).toLocaleDateString('fr-FR'); } catch { /* fall through */ }
  }
  return s;
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Construit le contexte nested à passer à Handlebars pour le rendu serveur.
 *
 * Reçoit les entités TypeORM (partiellement typées) et produit le même
 * objet nested que buildMailContext() côté front, garantissant que les
 * templates fonctionnent à l'identique dans les deux renderers.
 *
 * Utilisation typique dans un subscriber :
 * ```ts
 * const ctx = buildEntityMailContext({
 *   cabinet,
 *   dossier: dossier,
 *   resourceType: 'facture',
 *   resource: facture,
 * });
 * await mailTemplateService.render('invoice_issued', ctx);
 * ```
 */
export function buildEntityMailContext(input: {
  cabinet?: Record<string, any> | null;
  dossier?: Record<string, any> | null;
  resourceType?: string | null;
  resource?: Record<string, any> | null;
}): Record<string, any> {
  const { cabinet, dossier, resourceType, resource } = input;
  const raw = resource ?? {};

  const d = dossier ?? raw.dossier ?? null;
  const c = d?.client ?? raw.client ?? raw.dossier?.client ?? null;

  const today = new Date();

  return {
    // ── Cabinet ──────────────────────────────────────────────────────────────
    cabinet: {
      nom:       cabinet?.name          ?? '',
      email:     cabinet?.contact_email ?? '',
      telephone: cabinet?.contact_phone ?? '',
      adresse:   cabinet?.address       ?? '',
      site_web:  cabinet?.website       ?? '',
    },
    // ── Dossier ──────────────────────────────────────────────────────────────
    dossier: {
      numero:             d?.dossier_number ?? '',
      objet:              d?.object         ?? '',
      description:        d?.description    ?? '',
      statut:             DOSSIER_STATUS_LABELS[d?.status] ?? fmt(d?.status),
      etape:              d?.steps_summary?.current_step_title ?? '',
      date_ouverture:     fmt(d?.opening_date),
      juridiction:        d?.jurisdiction?.name ?? d?.court_name ?? '',
      partie_adverse:     d?.opposing_party_name ?? '',
      avocat:             d?.lawyer?.full_name ?? '',
      prochaine_audience: fmt(d?.next_audience?.audience_date),
      resultat:           d?.outcome_notes ?? d?.final_decision ?? d?.outcome ?? '',
    },
    // ── Client ───────────────────────────────────────────────────────────────
    client: {
      nom:        c?.full_name      ?? '',
      email:      c?.email          ?? '',
      telephone:  c?.number_phone_1 ?? c?.professional_phone ?? '',
      entreprise: c?.company_name   ?? '',
      adresse:    c?.address        ?? c?.adress ?? '',
    },
    // ── Facture ──────────────────────────────────────────────────────────────
    facture: resourceType === 'facture' ? {
      numero:        raw.numero ?? raw.invoice_number ?? '',
      date:          fmt(raw.dateFacture  ?? raw.date_facture  ?? raw.invoice_date),
      echeance:      fmt(raw.dateEcheance ?? raw.date_echeance ?? raw.due_date),
      montant_ttc:   fmt(raw.montantTTC   ?? raw.montant_ttc),
      montant_paye:  fmt(raw.montantPaye  ?? raw.montant_paye),
      reste_a_payer: fmt(raw.resteAPayer  ?? raw.reste_a_payer),
      statut:        raw.statut_label ?? fmt(raw.status ?? raw.statut),
      type:          raw.type_label   ?? fmt(raw.type),
    } : { numero: '', date: '', echeance: '', montant_ttc: '', montant_paye: '', reste_a_payer: '', statut: '', type: '' },
    // ── Audience ─────────────────────────────────────────────────────────────
    audience: resourceType === 'audience' ? {
      date:        fmt(raw.audience_date ?? raw.display_date),
      heure:       raw.audience_time ?? raw.display_time ?? '',
      juridiction: typeof raw.jurisdiction === 'object'
                     ? (raw.jurisdiction?.name ?? '')
                     : (raw.jurisdiction ?? ''),
      salle:  raw.room       ?? '',
      juge:   raw.judge_name ?? '',
      type:   raw.type_label ?? raw.type?.name ?? fmt(raw.type),
      statut: raw.status_label ?? '',
      notes:  raw.notes ?? '',
    } : { date: '', heure: '', juridiction: '', salle: '', juge: '', type: '', statut: '', notes: '' },
    // ── Diligence ────────────────────────────────────────────────────────────
    diligence: resourceType === 'diligence' ? {
      titre:       raw.title          ?? '',
      description: raw.description    ?? '',
      type:        raw.type_label     ?? fmt(raw.type),
      statut:      raw.status_label   ?? fmt(raw.status),
      priorite:    raw.priority_label ?? fmt(raw.priority),
      date_debut:  fmt(raw.start_date),
      date_limite: fmt(raw.deadline),
      avocat:      raw.assigned_lawyer?.full_name ?? '',
    } : { titre: '', description: '', type: '', statut: '', priorite: '', date_debut: '', date_limite: '', avocat: '' },
    // ── Document ─────────────────────────────────────────────────────────────
    document: resourceType === 'document' ? {
      nom:    raw.name ?? raw.original_name ?? '',
      type:   raw.document_type?.name ?? raw.category?.name ?? '',
      statut: raw.status_label ?? '',
      date:   fmt(raw.document_date ?? raw.created_at),
    } : { nom: '', type: '', statut: '', date: '' },
    // ── Rendez-vous ───────────────────────────────────────────────────────
    rdv: resourceType === 'rdv' ? {
      date:  fmt(raw.date ?? raw.appointment_date ?? raw.start_at),
      heure: raw.heure ?? raw.time ?? raw.appointment_time ?? '',
      lieu:  raw.lieu ?? raw.location ?? raw.place ?? '',
    } : {
      date:  fmt(raw.rdv?.date),
      heure: raw.rdv?.heure ?? '',
      lieu:  raw.rdv?.lieu ?? '',
    },
    // ── Dates système ─────────────────────────────────────────────────────────
    date: {
      aujourdhui: today.toLocaleDateString('fr-FR'),
      annee:      String(today.getFullYear()),
    },
    // ── Flat back-compat (templates notification existants) ───────────────────
    brandColor:    cabinet?.brand_color ?? '#1d4ed8',
    cabinetName:   cabinet?.name        ?? '',
    dossierNumber: d?.dossier_number    ?? '',
    clientName:    c?.full_name         ?? '',
    audienceDate:  resourceType === 'audience' ? fmt(raw.audience_date) : '',
    audienceTime:  resourceType === 'audience' ? (raw.audience_time ?? '') : '',
    jurisdiction:  resourceType === 'audience'
                     ? (typeof raw.jurisdiction === 'object' ? raw.jurisdiction?.name : raw.jurisdiction ?? '')
                     : '',
  };
}
