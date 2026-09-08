import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { DataSource, Repository } from 'typeorm';
import {
  ActionPriority,
  BillingCalculationMode,
  RecommendationTrigger,
} from '../case-workflow.enums';
import {
  ActionDefinition,
  ActionFamily,
} from '../entities/action-catalog.entity';
import { RecommendationRule } from '../entities/recommendation.entity';
import {
  CreateActionFamilyDto,
  CreateActionDefinitionDto,
  UpdateActionFamilyDto,
  ReviseActionDefinitionDto,
} from '../dto/case-workflow.dto';

const FAMILY_DEFAULTS = [
  ['DOCUMENT_DRAFTING', 'Rédaction et production documentaire'],
  ['PROCEDURE', 'Procédure et formalités'],
  ['AUDIENCE', 'Audience'],
  ['NEGOTIATION', 'Négociation et règlement amiable'],
  ['ADVICE', 'Conseil et analyse'],
  ['COMMUNICATION', 'Communication'],
  ['EVIDENCE', 'Pièces et preuves'],
  ['ENFORCEMENT', 'Exécution et recouvrement'],
  ['ADMINISTRATION', 'Administration du dossier'],
] as const;

const DEFINITION_DEFAULTS: Array<{
  family: string;
  code: string;
  label: string;
  dueDays?: number;
  priority?: ActionPriority;
  billable?: boolean;
  billingMode?: BillingCalculationMode;
  fields?: Record<string, unknown>;
  results: Array<{ code: string; label: string }>;
}> = [
  {
    family: 'ADVICE',
    code: 'ANALYSE_DOSSIER',
    label: 'Analyser le dossier',
    dueDays: 3,
    priority: ActionPriority.HIGH,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: {
      type: 'object',
      required: ['analysis'],
      properties: {
        analysis: { type: 'string', label: 'Analyse' },
        riskLevel: { type: 'string', label: 'Niveau de risque' },
      },
    },
    results: [
      { code: 'ANALYSED', label: 'Analyse réalisée' },
      {
        code: 'MORE_INFORMATION_REQUIRED',
        label: 'Informations complémentaires requises',
      },
    ],
  },
  {
    family: 'DOCUMENT_DRAFTING',
    code: 'REVIEW_DRAFT',
    label: 'Relire un projet de document',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    results: [
      { code: 'APPROVED', label: 'Projet approuvé' },
      { code: 'CHANGES_REQUESTED', label: 'Corrections demandées' },
    ],
  },
  {
    family: 'DOCUMENT_DRAFTING',
    code: 'SIGN_DOCUMENT',
    label: 'Faire signer le document',
    dueDays: 3,
    results: [
      { code: 'SIGNED', label: 'Document signé' },
      { code: 'REFUSED', label: 'Signature refusée' },
    ],
  },
  {
    family: 'PROCEDURE',
    code: 'FILE_PROCEDURAL_ACT',
    label: 'Déposer un acte de procédure',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    results: [
      { code: 'FILED', label: 'Acte déposé' },
      { code: 'REJECTED', label: 'Dépôt rejeté' },
    ],
  },
  {
    family: 'AUDIENCE',
    code: 'PREPARE_HEARING',
    label: 'Préparer une audience',
    dueDays: 2,
    priority: ActionPriority.HIGH,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    results: [
      { code: 'READY', label: 'Audience préparée' },
      { code: 'MISSING_ITEMS', label: 'Éléments manquants' },
    ],
  },
  {
    family: 'AUDIENCE',
    code: 'PROCESS_POSTPONED_HEARING',
    label: 'Traiter le report d’audience',
    dueDays: 1,
    priority: ActionPriority.HIGH,
    results: [
      { code: 'RESCHEDULED', label: 'Nouvelle date enregistrée' },
      { code: 'FOLLOW_UP_REQUIRED', label: 'Relance nécessaire' },
    ],
  },
  {
    family: 'NEGOTIATION',
    code: 'FOLLOW_UP_SETTLEMENT_PROPOSAL',
    label: 'Relancer une proposition amiable',
    dueDays: 5,
    results: [
      { code: 'ACCEPTED', label: 'Proposition acceptée' },
      { code: 'REFUSED', label: 'Proposition refusée' },
      { code: 'NO_RESPONSE', label: 'Sans réponse' },
    ],
  },
  {
    family: 'COMMUNICATION',
    code: 'CONTACT_CLIENT',
    label: 'Contacter le client',
    dueDays: 2,
    results: [
      { code: 'CONTACTED', label: 'Client contacté' },
      { code: 'UNREACHABLE', label: 'Client injoignable' },
    ],
  },
  {
    family: 'EVIDENCE',
    code: 'REQUEST_MISSING_DOCUMENT',
    label: 'Demander une pièce manquante',
    dueDays: 5,
    results: [
      { code: 'RECEIVED', label: 'Pièce reçue' },
      { code: 'REMINDER_REQUIRED', label: 'Relance nécessaire' },
    ],
  },
  {
    family: 'ENFORCEMENT',
    code: 'START_ENFORCEMENT',
    label: 'Engager l’exécution',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    results: [
      { code: 'STARTED', label: 'Exécution engagée' },
      { code: 'BLOCKED', label: 'Exécution bloquée' },
    ],
  },
  {
    family: 'ADMINISTRATION',
    code: 'UPDATE_CASE_DATA',
    label: 'Mettre à jour les données du dossier',
    dueDays: 3,
    results: [{ code: 'UPDATED', label: 'Dossier mis à jour' }],
  },
  {
    family: 'ADMINISTRATION',
    code: 'PREPARE_CLOSURE',
    label: 'Préparer la clôture du dossier',
    dueDays: 3,
    priority: ActionPriority.HIGH,
    results: [
      { code: 'READY_TO_CLOSE', label: 'Dossier prêt à clôturer' },
      { code: 'REMAINING_WORK', label: 'Travail restant' },
    ],
  },
];

const STANDARD_RESULTS = [
  { code: 'COMPLETED', label: 'Action réalisée' },
  { code: 'FOLLOW_UP_REQUIRED', label: 'Suite ou relance nécessaire' },
];

const FAMILY_FIELDS: Record<string, Record<string, unknown>> = {
  DOCUMENT_DRAFTING: {
    type: 'object',
    properties: {
      instructions: { type: 'string', label: 'Consignes de rédaction' },
      recipient: { type: 'string', label: 'Destinataire' },
      validationLevel: {
        type: 'string',
        label: 'Niveau de validation attendu',
      },
    },
  },
  PROCEDURE: {
    type: 'object',
    properties: {
      interlocutor: { type: 'string', label: 'Interlocuteur ou organisme' },
      filingReference: { type: 'string', label: 'Référence de dépôt' },
      proof: { type: 'string', label: 'Preuve ou accusé' },
    },
  },
  AUDIENCE: {
    type: 'object',
    properties: {
      keyPoints: { type: 'string', label: 'Points à soutenir ou vérifier' },
      attendee: { type: 'string', label: 'Personne présente' },
      hearingOutcome: { type: 'string', label: 'Résultat ou décision' },
    },
  },
  NEGOTIATION: {
    type: 'object',
    properties: {
      proposalTerms: {
        type: 'string',
        label: 'Montants ou engagements proposés',
      },
      negotiationLimits: { type: 'string', label: 'Limites de négociation' },
      responseDueAt: { type: 'string', label: 'Échéance de réponse' },
    },
  },
  ADVICE: {
    type: 'object',
    properties: {
      question: { type: 'string', label: 'Question à analyser' },
      assumptions: {
        type: 'string',
        label: 'Hypothèses et points de vigilance',
      },
      recommendation: {
        type: 'string',
        label: 'Recommandation ou décision retenue',
      },
    },
  },
  COMMUNICATION: {
    type: 'object',
    properties: {
      recipient: { type: 'string', label: 'Destinataire' },
      channel: { type: 'string', label: 'Canal' },
      expectedResponse: { type: 'string', label: 'Réponse attendue' },
      followUpDueAt: { type: 'string', label: 'Échéance de relance' },
    },
  },
  EVIDENCE: {
    type: 'object',
    properties: {
      expectedItem: { type: 'string', label: 'Pièce ou preuve concernée' },
      source: { type: 'string', label: 'Source' },
      confidentiality: { type: 'string', label: 'Niveau de confidentialité' },
      intendedUse: { type: 'string', label: 'Utilisation prévue' },
    },
  },
  ENFORCEMENT: {
    type: 'object',
    properties: {
      obligation: { type: 'string', label: 'Obligation à exécuter' },
      amount: { type: 'number', label: 'Montant' },
      remainingBalance: { type: 'number', label: 'Solde restant' },
      enforcementParty: { type: 'string', label: 'Intervenant' },
    },
  },
  ADMINISTRATION: {
    type: 'object',
    properties: {
      internalComment: { type: 'string', label: 'Commentaire interne' },
      reviewReason: { type: 'string', label: 'Motif de la revue' },
    },
  },
};

const ADDITIONAL_DEFINITION_DEFAULTS: typeof DEFINITION_DEFAULTS = [
  {
    family: 'DOCUMENT_DRAFTING',
    code: 'PREPARE_DOCUMENT_DRAFT',
    label: 'Préparer un brouillon',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.DOCUMENT_DRAFTING,
    results: STANDARD_RESULTS,
  },
  {
    family: 'DOCUMENT_DRAFTING',
    code: 'DRAFT_PROCEDURAL_DOCUMENT',
    label: 'Rédiger une assignation, requête ou conclusions',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.DOCUMENT_DRAFTING,
    results: STANDARD_RESULTS,
  },
  {
    family: 'DOCUMENT_DRAFTING',
    code: 'DRAFT_FORMAL_LETTER',
    label: 'Rédiger une lettre ou mise en demeure',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.DOCUMENT_DRAFTING,
    results: STANDARD_RESULTS,
  },
  {
    family: 'DOCUMENT_DRAFTING',
    code: 'DRAFT_AGREEMENT',
    label: 'Rédiger une convention ou un protocole',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.DOCUMENT_DRAFTING,
    results: STANDARD_RESULTS,
  },
  {
    family: 'DOCUMENT_DRAFTING',
    code: 'VALIDATE_DOCUMENT',
    label: 'Faire valider un document',
    dueDays: 2,
    fields: FAMILY_FIELDS.DOCUMENT_DRAFTING,
    results: STANDARD_RESULTS,
  },
  {
    family: 'DOCUMENT_DRAFTING',
    code: 'FINALIZE_DOCUMENT',
    label: 'Finaliser pour dépôt ou envoi',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.DOCUMENT_DRAFTING,
    results: STANDARD_RESULTS,
  },

  {
    family: 'PROCEDURE',
    code: 'SEIZE_JURISDICTION',
    label: 'Saisir une juridiction',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.PROCEDURE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'PROCEDURE',
    code: 'ENROLL_PROCEDURAL_ACT',
    label: 'Enrôler ou faire enregistrer un acte',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.PROCEDURE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'PROCEDURE',
    code: 'SERVE_OR_NOTIFY',
    label: 'Signifier ou notifier',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.PROCEDURE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'PROCEDURE',
    code: 'TRANSMIT_PROCEDURAL_EVIDENCE',
    label: 'Transmettre des pièces',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.PROCEDURE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'PROCEDURE',
    code: 'FOLLOW_UP_REGISTRY',
    label: 'Suivre un retour du greffe',
    dueDays: 5,
    fields: FAMILY_FIELDS.PROCEDURE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'PROCEDURE',
    code: 'COMPLETE_FORMALITY',
    label: 'Effectuer une formalité',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.PROCEDURE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'PROCEDURE',
    code: 'VERIFY_FORMALITY',
    label: 'Vérifier l’accomplissement d’une démarche',
    dueDays: 2,
    fields: FAMILY_FIELDS.PROCEDURE,
    results: STANDARD_RESULTS,
  },

  {
    family: 'AUDIENCE',
    code: 'CHECK_HEARING_EVIDENCE',
    label: 'Vérifier les pièces pour l’audience',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.AUDIENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'AUDIENCE',
    code: 'PREPARE_PLEADING',
    label: 'Préparer la plaidoirie ou les notes',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.AUDIENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'AUDIENCE',
    code: 'ATTEND_HEARING',
    label: 'Assister à l’audience',
    dueDays: 1,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.AUDIENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'AUDIENCE',
    code: 'WRITE_HEARING_REPORT',
    label: 'Faire le compte rendu d’audience',
    dueDays: 1,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.AUDIENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'AUDIENCE',
    code: 'EXECUTE_HEARING_FOLLOW_UP',
    label: 'Exécuter les suites décidées à l’audience',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.AUDIENCE,
    results: STANDARD_RESULTS,
  },

  {
    family: 'NEGOTIATION',
    code: 'PREPARE_NEGOTIATION_POSITION',
    label: 'Préparer une position de négociation',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.NEGOTIATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'NEGOTIATION',
    code: 'CONTACT_OPPOSING_PARTY',
    label: 'Contacter la partie adverse',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.NEGOTIATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'NEGOTIATION',
    code: 'SEND_SETTLEMENT_PROPOSAL',
    label: 'Envoyer une proposition',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.NEGOTIATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'NEGOTIATION',
    code: 'ORGANIZE_NEGOTIATION_MEETING',
    label: 'Organiser une réunion de négociation',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.NEGOTIATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'NEGOTIATION',
    code: 'REVIEW_COUNTER_PROPOSAL',
    label: 'Recevoir et étudier une contre-proposition',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.NEGOTIATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'NEGOTIATION',
    code: 'DRAFT_SETTLEMENT_PROTOCOL',
    label: 'Rédiger un protocole',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.NEGOTIATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'NEGOTIATION',
    code: 'SIGN_SETTLEMENT_AGREEMENT',
    label: 'Faire signer l’accord',
    dueDays: 3,
    fields: FAMILY_FIELDS.NEGOTIATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'NEGOTIATION',
    code: 'MONITOR_SETTLEMENT_EXECUTION',
    label: 'Suivre l’exécution de l’accord',
    dueDays: 7,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.NEGOTIATION,
    results: STANDARD_RESULTS,
  },

  {
    family: 'ADVICE',
    code: 'ANALYZE_EVIDENCE',
    label: 'Analyser des pièces',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ADVICE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADVICE',
    code: 'LEGAL_RESEARCH',
    label: 'Effectuer une recherche',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ADVICE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADVICE',
    code: 'PROVIDE_LEGAL_OPINION',
    label: 'Donner un avis',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ADVICE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADVICE',
    code: 'PREPARE_CONSULTATION',
    label: 'Préparer une consultation',
    dueDays: 5,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ADVICE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADVICE',
    code: 'ASSESS_RISKS',
    label: 'Évaluer les risques',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ADVICE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADVICE',
    code: 'DEFINE_STRATEGY',
    label: 'Définir la stratégie',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ADVICE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADVICE',
    code: 'REVISE_STRATEGY',
    label: 'Réviser la stratégie après un événement',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ADVICE,
    results: STANDARD_RESULTS,
  },

  {
    family: 'COMMUNICATION',
    code: 'INFORM_CLIENT',
    label: 'Informer le client',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.COMMUNICATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'COMMUNICATION',
    code: 'REQUEST_CLIENT_INFORMATION',
    label: 'Demander des informations au client',
    dueDays: 3,
    fields: FAMILY_FIELDS.COMMUNICATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'COMMUNICATION',
    code: 'CONTACT_OPPOSING_COUNSEL',
    label: 'Contacter le confrère adverse',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.COMMUNICATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'COMMUNICATION',
    code: 'WRITE_TO_COURT',
    label: 'Écrire à une juridiction ou au greffe',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.COMMUNICATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'COMMUNICATION',
    code: 'FOLLOW_UP_CONTACT',
    label: 'Relancer un interlocuteur',
    dueDays: 3,
    fields: FAMILY_FIELDS.COMMUNICATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'COMMUNICATION',
    code: 'PREPARE_CLIENT_REPORT',
    label: 'Faire un compte rendu',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.COMMUNICATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'COMMUNICATION',
    code: 'ORGANIZE_MEETING',
    label: 'Organiser un rendez-vous',
    dueDays: 5,
    fields: FAMILY_FIELDS.COMMUNICATION,
    results: STANDARD_RESULTS,
  },

  {
    family: 'EVIDENCE',
    code: 'RECEIVE_AND_CLASSIFY_EVIDENCE',
    label: 'Recevoir et classer une pièce',
    dueDays: 2,
    fields: FAMILY_FIELDS.EVIDENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'EVIDENCE',
    code: 'VERIFY_EVIDENCE',
    label: 'Vérifier l’authenticité ou la complétude d’une pièce',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.EVIDENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'EVIDENCE',
    code: 'REVIEW_EVIDENCE_CONTENT',
    label: 'Analyser une pièce',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.EVIDENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'EVIDENCE',
    code: 'PREPARE_EXHIBIT_LIST',
    label: 'Préparer un bordereau de pièces',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.EVIDENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'EVIDENCE',
    code: 'SELECT_EVIDENCE_FOR_TRANSMISSION',
    label: 'Sélectionner les pièces à transmettre',
    dueDays: 2,
    fields: FAMILY_FIELDS.EVIDENCE,
    results: STANDARD_RESULTS,
  },
  {
    family: 'EVIDENCE',
    code: 'COMMUNICATE_EVIDENCE',
    label: 'Transmettre ou communiquer les pièces',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.EVIDENCE,
    results: STANDARD_RESULTS,
  },

  {
    family: 'ENFORCEMENT',
    code: 'NOTIFY_DECISION',
    label: 'Notifier la décision',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.ENFORCEMENT,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ENFORCEMENT',
    code: 'SEND_ENFORCEMENT_NOTICE',
    label: 'Mettre en demeure',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.ENFORCEMENT,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ENFORCEMENT',
    code: 'APPOINT_ENFORCEMENT_OFFICER',
    label: 'Mandater un auxiliaire',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.ENFORCEMENT,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ENFORCEMENT',
    code: 'MONITOR_ENFORCEMENT',
    label: 'Suivre l’exécution',
    dueDays: 7,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ENFORCEMENT,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ENFORCEMENT',
    code: 'MONITOR_PAYMENT',
    label: 'Suivre un paiement',
    dueDays: 7,
    fields: FAMILY_FIELDS.ENFORCEMENT,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ENFORCEMENT',
    code: 'RECORD_DEFAULT',
    label: 'Constater un défaut',
    dueDays: 2,
    billable: true,
    billingMode: BillingCalculationMode.FIXED,
    fields: FAMILY_FIELDS.ENFORCEMENT,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ENFORCEMENT',
    code: 'VERIFY_ENFORCEMENT_COMPLETION',
    label: 'Vérifier la fin de l’exécution',
    dueDays: 3,
    fields: FAMILY_FIELDS.ENFORCEMENT,
    results: STANDARD_RESULTS,
  },

  {
    family: 'ADMINISTRATION',
    code: 'ASSIGN_COLLABORATOR',
    label: 'Affecter un collaborateur',
    dueDays: 1,
    fields: FAMILY_FIELDS.ADMINISTRATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADMINISTRATION',
    code: 'CREATE_INTERNAL_NOTE',
    label: 'Créer une note interne',
    dueDays: 1,
    fields: FAMILY_FIELDS.ADMINISTRATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADMINISTRATION',
    code: 'PLAN_DEADLINE',
    label: 'Planifier une échéance',
    dueDays: 1,
    fields: FAMILY_FIELDS.ADMINISTRATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADMINISTRATION',
    code: 'REVIEW_CASE',
    label: 'Faire une revue du dossier',
    dueDays: 3,
    billable: true,
    billingMode: BillingCalculationMode.HOURLY,
    fields: FAMILY_FIELDS.ADMINISTRATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADMINISTRATION',
    code: 'CHECK_FINANCIAL_STATUS',
    label: 'Vérifier la situation financière',
    dueDays: 2,
    fields: FAMILY_FIELDS.ADMINISTRATION,
    results: STANDARD_RESULTS,
  },
  {
    family: 'ADMINISTRATION',
    code: 'REOPEN_CASE',
    label: 'Réouvrir un dossier',
    dueDays: 1,
    fields: FAMILY_FIELDS.ADMINISTRATION,
    results: STANDARD_RESULTS,
  },
];

const ALL_DEFINITION_DEFAULTS = [
  ...DEFINITION_DEFAULTS,
  ...ADDITIONAL_DEFINITION_DEFAULTS,
];

const RULE_DEFAULTS = [
  {
    code: 'DRAFT_TO_REVIEW',
    label: 'Projet à relire',
    trigger: RecommendationTrigger.DOCUMENT_STATUS_CHANGED,
    definition: 'REVIEW_DRAFT',
    condition: { '==': [{ var: 'documents.pendingReview' }, true] },
    reason: 'Un projet de document attend une relecture.',
    priority: 80,
    specificity: 80,
  },
  {
    code: 'DOCUMENT_TO_SIGN',
    label: 'Document à signer',
    trigger: RecommendationTrigger.DOCUMENT_STATUS_CHANGED,
    definition: 'SIGN_DOCUMENT',
    condition: { '==': [{ var: 'documents.awaitingSignature' }, true] },
    reason: 'Un document validé attend une signature.',
    priority: 85,
    specificity: 85,
  },
  {
    code: 'HEARING_DUE',
    label: 'Audience proche',
    trigger: RecommendationTrigger.AUDIENCE_DUE,
    definition: 'PREPARE_HEARING',
    condition: { '<=': [{ var: 'audiences.nextInDays' }, 7] },
    reason: 'Une audience est prévue dans les sept prochains jours.',
    priority: 95,
    specificity: 90,
  },
  {
    code: 'HEARING_POSTPONED',
    label: 'Audience reportée',
    trigger: RecommendationTrigger.AUDIENCE_POSTPONED,
    definition: 'PROCESS_POSTPONED_HEARING',
    condition: { '>': [{ var: 'audiences.postponedCount' }, 0] },
    reason: 'Une audience reportée doit être replanifiée et communiquée.',
    priority: 95,
    specificity: 95,
  },
  {
    code: 'SETTLEMENT_FOLLOW_UP',
    label: 'Proposition à relancer',
    trigger: RecommendationTrigger.DEADLINE_REACHED,
    definition: 'FOLLOW_UP_SETTLEMENT_PROPOSAL',
    condition: { '==': [{ var: 'negotiation.followUpDue' }, true] },
    reason: 'Une proposition amiable est arrivée à son échéance de relance.',
    priority: 75,
    specificity: 75,
  },
  {
    code: 'MISSING_DOCUMENT',
    label: 'Pièce manquante',
    trigger: RecommendationTrigger.MISSING_DOCUMENT,
    definition: 'REQUEST_MISSING_DOCUMENT',
    condition: { '>': [{ var: 'documents.missingCount' }, 0] },
    reason: 'Le dossier comporte au moins une pièce attendue.',
    priority: 90,
    specificity: 90,
  },
  {
    code: 'OPENING_ANALYSIS',
    label: 'Analyse après ouverture',
    trigger: RecommendationTrigger.OPENING_VALIDATED,
    definition: 'ANALYSE_DOSSIER',
    condition: { '==': [{ var: 'dossier.lifecyclePhase' }, 'TREATMENT'] },
    reason: 'L’ouverture est validée : le dossier peut être analysé.',
    priority: 70,
    specificity: 60,
  },
  {
    code: 'NO_OPEN_ACTION',
    label: 'Dossier sans action',
    trigger: RecommendationTrigger.NO_OPEN_ACTION,
    definition: 'UPDATE_CASE_DATA',
    condition: { '==': [{ var: 'actions.openCount' }, 0] },
    reason: 'Aucune action n’est actuellement ouverte sur ce dossier.',
    priority: 20,
    specificity: 10,
  },
] as const;

@Injectable()
export class ActionCatalogService {
  constructor(
    @InjectRepository(ActionFamily)
    private readonly familyRepository: Repository<ActionFamily>,
    @InjectRepository(ActionDefinition)
    private readonly definitionRepository: Repository<ActionDefinition>,
    @InjectRepository(RecommendationRule)
    private readonly ruleRepository: Repository<RecommendationRule>,
    private readonly dataSource: DataSource,
  ) {}

  async ensureDefaults(): Promise<void> {
    const tenantId = getCurrentTenantId();
    const families = new Map<string, ActionFamily>();
    for (let index = 0; index < FAMILY_DEFAULTS.length; index++) {
      const [code, label] = FAMILY_DEFAULTS[index];
      let family = await this.familyRepository.findOne({
        where: { tenant_id: tenantId, code },
      });
      if (!family) {
        try {
          family = await this.familyRepository.save(
            this.familyRepository.create({
              tenant_id: tenantId,
              code,
              label,
              description: null,
              display_order: index + 1,
              is_active: true,
            }),
          );
        } catch (error) {
          if (!this.isDuplicate(error)) throw error;
          family = await this.familyRepository.findOne({
            where: { tenant_id: tenantId, code },
          });
          if (!family) throw error;
        }
      }
      families.set(code, family);
    }

    const definitions = new Map<string, ActionDefinition>();
    for (const item of ALL_DEFINITION_DEFAULTS) {
      let definition = await this.definitionRepository.findOne({
        where: { tenant_id: tenantId, code: item.code, version: 1 },
      });
      if (!definition) {
        try {
          definition = await this.definitionRepository.save(
            this.definitionRepository.create({
              tenant_id: tenantId,
              family_id: families.get(item.family)!.id,
              code: item.code,
              label: item.label,
              version: 1,
              specific_fields_schema: item.fields ?? {
                type: 'object',
                properties: {},
              },
              allowed_results: item.results,
              required_relations: null,
              default_due_days: item.dueDays ?? null,
              default_priority: item.priority ?? ActionPriority.NORMAL,
              is_required: false,
              billable_by_default: item.billable ?? false,
              billing_mode: item.billingMode ?? null,
              default_rate: null,
              is_active: true,
            }),
          );
        } catch (error) {
          if (!this.isDuplicate(error)) throw error;
          definition = await this.definitionRepository.findOne({
            where: { tenant_id: tenantId, code: item.code, version: 1 },
          });
          if (!definition) throw error;
        }
      }
      definitions.set(item.code, definition);
    }

    for (const item of RULE_DEFAULTS) {
      const exists = await this.ruleRepository.findOne({
        where: { tenant_id: tenantId, code: item.code, version: 1 },
      });
      if (!exists) {
        try {
          await this.ruleRepository.save(
            this.ruleRepository.create({
              tenant_id: tenantId,
              code: item.code,
              label: item.label,
              version: 1,
              trigger: item.trigger,
              condition_json: item.condition,
              action_definition_id: definitions.get(item.definition)!.id,
              reason_template: item.reason,
              priority: item.priority,
              specificity: item.specificity,
              due_offset_days: null,
              is_active: true,
            }),
          );
        } catch (error) {
          if (!this.isDuplicate(error)) throw error;
        }
      }
    }
  }

  private isDuplicate(error: unknown): boolean {
    const candidate = error as {
      code?: unknown;
      driverError?: { code?: unknown };
    };
    return (
      candidate.code === 'ER_DUP_ENTRY' ||
      candidate.driverError?.code === 'ER_DUP_ENTRY'
    );
  }

  async getFamilies(includeInactive = false): Promise<ActionFamily[]> {
    await this.ensureDefaults();
    const tenantId = getCurrentTenantId();
    const families = await this.familyRepository.find({
      where: includeInactive
        ? { tenant_id: tenantId }
        : { tenant_id: tenantId, is_active: true },
      order: { display_order: 'ASC' },
    });
    for (const family of families) {
      const definitions = await this.definitionRepository.find({
        where: includeInactive
          ? { tenant_id: tenantId, family_id: family.id }
          : { tenant_id: tenantId, family_id: family.id, is_active: true },
        order: { code: 'ASC', version: 'DESC' },
      });
      (
        family as ActionFamily & { definitions: ActionDefinition[] }
      ).definitions = includeInactive
        ? [
            ...new Map(
              definitions.map((definition) => [definition.code, definition]),
            ).values(),
          ].sort((left, right) => left.label.localeCompare(right.label))
        : definitions.sort((left, right) =>
            left.label.localeCompare(right.label),
          );
    }
    return families;
  }

  private normalizeFamilyCode(value: string): string {
    return value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async createFamily(dto: CreateActionFamilyDto): Promise<ActionFamily> {
    const tenantId = getCurrentTenantId();
    const code = this.normalizeFamilyCode(dto.code);
    if (!code)
      throw new ConflictException('Le code de la famille est invalide');
    const exists = await this.familyRepository.findOne({
      where: { tenant_id: tenantId, code },
    });
    if (exists) throw new ConflictException(`La famille ${code} existe déjà`);

    const last = await this.familyRepository.findOne({
      where: { tenant_id: tenantId },
      order: { display_order: 'DESC' },
    });
    return this.familyRepository.save(
      this.familyRepository.create({
        tenant_id: tenantId,
        code,
        label: dto.label.trim(),
        description: dto.description?.trim() || null,
        display_order: dto.display_order ?? (last?.display_order ?? 0) + 1,
        is_active: dto.is_active ?? true,
      }),
    );
  }

  async updateFamily(
    id: string,
    dto: UpdateActionFamilyDto,
  ): Promise<ActionFamily> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ActionFamily);
      const family = await repository
        .createQueryBuilder('family')
        .setLock('pessimistic_write')
        .where('family.id = :id AND family.tenant_id = :tenantId', {
          id,
          tenantId,
        })
        .getOne();
      if (!family) throw new NotFoundException('Famille d’action introuvable');

      if (dto.code !== undefined) {
        const code = this.normalizeFamilyCode(dto.code);
        if (!code)
          throw new ConflictException('Le code de la famille est invalide');
        const duplicate = await repository.findOne({
          where: { tenant_id: tenantId, code },
        });
        if (duplicate && duplicate.id !== family.id)
          throw new ConflictException(`La famille ${code} existe déjà`);
        family.code = code;
      }
      if (dto.label !== undefined) family.label = dto.label.trim();
      if (dto.description !== undefined)
        family.description = dto.description.trim() || null;
      if (dto.display_order !== undefined)
        family.display_order = dto.display_order;
      if (dto.is_active !== undefined) family.is_active = dto.is_active;
      return repository.save(family);
    });
  }

  async createDefinition(
    dto: CreateActionDefinitionDto,
  ): Promise<ActionDefinition> {
    const tenantId = getCurrentTenantId();
    const family = await this.familyRepository.findOne({
      where: { id: dto.family_id, tenant_id: tenantId },
    });
    if (!family)
      throw new NotFoundException(
        'Famille d’action introuvable dans ce cabinet',
      );

    const code = dto.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_');
    if (!code)
      throw new ConflictException('Le code de la définition est invalide');
    const exists = await this.definitionRepository.findOne({
      where: { tenant_id: tenantId, code },
    });
    if (exists)
      throw new ConflictException(
        `La définition ${code} existe déjà; créez une nouvelle version`,
      );

    return this.definitionRepository.save(
      this.definitionRepository.create({
        tenant_id: tenantId,
        family_id: family.id,
        code,
        label: dto.label.trim(),
        version: 1,
        specific_fields_schema: dto.specific_fields_schema ?? {
          type: 'object',
          properties: {},
        },
        allowed_results: dto.allowed_results ?? [],
        required_relations: dto.required_relations ?? null,
        default_due_days: dto.default_due_days ?? null,
        default_priority: dto.default_priority ?? ActionPriority.NORMAL,
        is_required: dto.is_required ?? false,
        billable_by_default: dto.billable_by_default ?? false,
        billing_mode: dto.billing_mode ?? null,
        default_rate: dto.default_rate ?? null,
        is_active: true,
      }),
    );
  }

  async reviseDefinition(
    id: string,
    dto: ReviseActionDefinitionDto,
  ): Promise<ActionDefinition> {
    const tenantId = getCurrentTenantId();
    return this.dataSource.transaction(async (manager) => {
      const source = await manager
        .getRepository(ActionDefinition)
        .createQueryBuilder('definition')
        .setLock('pessimistic_write')
        .where('definition.id = :id AND definition.tenant_id = :tenantId', {
          id,
          tenantId,
        })
        .getOne();
      if (!source)
        throw new NotFoundException('Définition d’action introuvable');

      const latest = await manager.getRepository(ActionDefinition).findOne({
        where: { tenant_id: tenantId, code: source.code },
        order: { version: 'DESC' },
      });
      if (!latest || latest.id !== source.id) {
        throw new ConflictException(
          'Cette définition n’est plus la version courante',
        );
      }

      const familyId = dto.family_id ?? source.family_id;
      const family = await manager
        .getRepository(ActionFamily)
        .findOne({ where: { id: familyId, tenant_id: tenantId } });
      if (!family)
        throw new NotFoundException(
          'Famille d’action introuvable dans ce cabinet',
        );

      await manager
        .getRepository(ActionDefinition)
        .update(
          { tenant_id: tenantId, code: source.code, is_active: true },
          { is_active: false },
        );
      return manager.getRepository(ActionDefinition).save(
        manager.getRepository(ActionDefinition).create({
          tenant_id: tenantId,
          family_id: family.id,
          code: source.code,
          label: dto.label?.trim() ?? source.label,
          version: source.version + 1,
          specific_fields_schema:
            dto.specific_fields_schema ?? source.specific_fields_schema,
          allowed_results: dto.allowed_results ?? source.allowed_results,
          required_relations:
            dto.required_relations ?? source.required_relations,
          default_due_days: dto.default_due_days ?? source.default_due_days,
          default_priority: dto.default_priority ?? source.default_priority,
          is_required: dto.is_required ?? source.is_required,
          billable_by_default:
            dto.billable_by_default ?? source.billable_by_default,
          billing_mode: dto.billing_mode ?? source.billing_mode,
          default_rate: dto.default_rate ?? source.default_rate,
          is_active: dto.is_active ?? true,
        }),
      );
    });
  }
}
