import {
  ActionBillingDecision,
  BillingCalculationMode,
  DossierActionStatus,
  RecommendationTrigger,
} from './case-workflow.enums';

const DAY_MS = 86_400_000;

export function getActionDeadlineState(
  action: { status: DossierActionStatus; due_at?: Date | string | null },
  now: Date | number = new Date(),
): { isOverdue: boolean; overdueDays: number } {
  const isOpen = [
    DossierActionStatus.TODO,
    DossierActionStatus.IN_PROGRESS,
    DossierActionStatus.ON_HOLD,
  ].includes(action.status);
  if (!isOpen || !action.due_at) {
    return { isOverdue: false, overdueDays: 0 };
  }

  const dueAt =
    action.due_at instanceof Date
      ? action.due_at.getTime()
      : new Date(action.due_at).getTime();
  const nowTime = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(dueAt) || dueAt > nowTime) {
    return { isOverdue: false, overdueDays: 0 };
  }

  return {
    isOverdue: true,
    overdueDays: Math.max(1, Math.ceil((nowTime - dueAt) / DAY_MS)),
  };
}

export function recommendationTriggersForEvaluation(
  trigger: RecommendationTrigger,
): RecommendationTrigger[] {
  if (trigger === RecommendationTrigger.MANUAL) {
    return [RecommendationTrigger.MANUAL, RecommendationTrigger.NO_OPEN_ACTION];
  }
  if (trigger === RecommendationTrigger.NO_OPEN_ACTION) {
    return [RecommendationTrigger.NO_OPEN_ACTION];
  }
  return [trigger, RecommendationTrigger.NO_OPEN_ACTION];
}

export function shouldSuppressRecommendationAction(input: {
  ruleTrigger: RecommendationTrigger;
  definitionCode: string;
  openDefinitionCodes: string[];
  lastCompletedDefinitionCode: string | null;
}): boolean {
  if (input.openDefinitionCodes.includes(input.definitionCode)) return true;
  return (
    input.ruleTrigger === RecommendationTrigger.NO_OPEN_ACTION &&
    input.lastCompletedDefinitionCode === input.definitionCode
  );
}

export interface DynamicFieldIssue {
  field: string;
  message: string;
}

export interface LegacyMappingCandidate {
  match_pattern: string;
  match_mode: 'CONTAINS' | 'EXACT';
  action_definition_code: string;
}

export function normalizeLegacyValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function resolveLegacyMapping(
  label: string,
  mappings: LegacyMappingCandidate[],
): string | null {
  const normalized = normalizeLegacyValue(label);
  for (const mapping of mappings) {
    const tokens = mapping.match_pattern
      .split('|')
      .map(normalizeLegacyValue)
      .filter(Boolean);
    const matches =
      mapping.match_mode === 'EXACT'
        ? tokens.some((token) => token === normalized)
        : tokens.some((token) => normalized.includes(token));
    if (matches) return mapping.action_definition_code;
  }
  return null;
}

interface DynamicFieldSchema {
  type?: string;
  enum?: unknown[];
}

interface RelationRequirement {
  min?: number;
  roles?: string[];
}

interface RelationLink {
  role?: string;
}

export function validateRequiredRelations(
  requirements: Record<string, unknown> | null,
  links: {
    documents?: RelationLink[];
    audiences?: RelationLink[];
    previous_actions?: RelationLink[];
  },
): string[] {
  if (!requirements) return [];
  const labels: Record<string, string> = {
    documents: 'document',
    audiences: 'audience',
    previous_actions: 'action precedente',
  };
  const issues: string[] = [];

  for (const key of Object.keys(labels)) {
    const raw = requirements[key];
    if (raw === undefined || raw === false || raw === null) continue;
    const requirement: RelationRequirement =
      typeof raw === 'object'
        ? (raw as RelationRequirement)
        : { min: raw === true ? 1 : Number(raw) };
    const configuredMinimum = Number(requirement.min ?? 1);
    const minimum = Number.isFinite(configuredMinimum)
      ? Math.max(0, configuredMinimum)
      : 1;
    const entries = links[key as keyof typeof links] ?? [];
    if (entries.length < minimum) {
      issues.push(
        `Au moins ${minimum} ${labels[key]}${minimum > 1 ? 's' : ''} doit etre lie a cette action`,
      );
    }
    for (const role of Array.isArray(requirement.roles)
      ? requirement.roles
      : []) {
      if (!entries.some((entry) => entry.role === role)) {
        issues.push(
          `Une relation ${labels[key]} avec le role ${role} est obligatoire`,
        );
      }
    }
  }
  return issues;
}

export function validateDynamicPayload(
  schema: Record<string, unknown> | null,
  data: Record<string, unknown> | undefined,
  requiredProperty: 'required' | 'required_on_start' = 'required',
): DynamicFieldIssue[] {
  if (!schema) return [];
  const payload = data ?? {};
  const issues: DynamicFieldIssue[] = [];
  const requiredConfig = schema[requiredProperty];
  const required = Array.isArray(requiredConfig)
    ? requiredConfig.filter((key): key is string => typeof key === 'string')
    : [];
  for (const key of required) {
    if (
      payload[key] === undefined ||
      payload[key] === null ||
      payload[key] === ''
    ) {
      issues.push({
        field: key,
        message: `Le champ spécifique « ${key} » est obligatoire`,
      });
    }
  }
  const properties =
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, DynamicFieldSchema>)
      : {};
  for (const [key, value] of Object.entries(payload)) {
    const expected = properties[key]?.type;
    if (!expected || value == null) continue;
    const valid =
      expected === 'array'
        ? Array.isArray(value)
        : expected === 'integer'
          ? Number.isInteger(value)
          : typeof value === expected;
    if (!valid)
      issues.push({
        field: key,
        message: `Le champ spécifique « ${key} » doit être de type ${expected}`,
      });
    const allowedValues = properties[key]?.enum;
    if (
      valid &&
      Array.isArray(allowedValues) &&
      !allowedValues.includes(value)
    ) {
      issues.push({
        field: key,
        message: `La valeur du champ spécifique « ${key} » n’est pas autorisée`,
      });
    }
  }
  return issues;
}

const ALLOWED_JSON_LOGIC_OPERATORS = new Set([
  'var',
  '==',
  '===',
  '!=',
  '!==',
  '>',
  '>=',
  '<',
  '<=',
  'and',
  'or',
  '!',
  '!!',
  'if',
  'in',
  'missing',
  'missing_some',
  '+',
  '-',
  '*',
  '/',
  '%',
  'min',
  'max',
  'cat',
  'substr',
]);

export function findForbiddenJsonLogicOperator(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const forbidden = findForbiddenJsonLogicOperator(entry);
      if (forbidden) return forbidden;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!ALLOWED_JSON_LOGIC_OPERATORS.has(key)) return key;
    const forbidden = findForbiddenJsonLogicOperator(child);
    if (forbidden) return forbidden;
  }
  return null;
}

export function recommendationScore(input: {
  dangerLevel: number;
  dossierPriority: number;
  nextDeadlineInDays: number;
  rulePriority: number;
  specificity: number;
}): number {
  const criticality =
    Number(input.dangerLevel || 0) * 10 + Number(input.dossierPriority || 0);
  const deadlineUrgency = Math.max(
    0,
    100 - Math.max(0, Number(input.nextDeadlineInDays)),
  );
  return (
    criticality * 1_000_000 +
    deadlineUrgency * 10_000 +
    input.rulePriority * 100 +
    input.specificity
  );
}

export function validateDeadlineExtension(
  currentDueAt: Date | null,
  proposedDueAt: Date,
  now = new Date(),
): string | null {
  if (Number.isNaN(proposedDueAt.getTime()))
    return 'La nouvelle échéance est invalide';
  if (proposedDueAt.getTime() <= now.getTime())
    return 'La nouvelle échéance doit être située dans le futur';
  if (currentDueAt && proposedDueAt.getTime() <= currentDueAt.getTime()) {
    return 'La nouvelle échéance doit être postérieure à l’échéance actuelle';
  }
  return null;
}

export interface BillingCalculationInput {
  decision: ActionBillingDecision;
  mode: BillingCalculationMode | null;
  durationMinutes?: number | null;
  definitionRate?: number | null;
  hourlyRate?: number | null;
  fixedFee?: number | null;
  percentageRate?: number | null;
  percentageBase?: number | null;
  taxRate?: number | null;
  decisionReason?: string | null;
}

export interface BillingCalculationResult {
  quantity: number;
  unitPrice: number;
  net: number;
  tax: number;
  gross: number;
  reviewReason: string | null;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateActionBilling(
  input: BillingCalculationInput,
): BillingCalculationResult {
  let quantity = 1;
  let unitPrice = Number(input.definitionRate ?? 0);
  let reviewReason: string | null = null;
  if (input.decision === ActionBillingDecision.NEEDS_REVIEW) {
    reviewReason = input.decisionReason || 'Décision tarifaire à confirmer';
  } else if (input.mode === BillingCalculationMode.HOURLY) {
    quantity = Number(input.durationMinutes ?? 0) / 60;
    unitPrice = Number(input.definitionRate ?? input.hourlyRate ?? 0);
    if (!input.durationMinutes || unitPrice <= 0)
      reviewReason = 'Durée ou tarif horaire manquant';
  } else if (input.mode === BillingCalculationMode.PERCENTAGE) {
    quantity = Number(input.percentageRate ?? 0) / 100;
    unitPrice = Number(input.percentageBase ?? 0);
    if (quantity <= 0 || unitPrice <= 0)
      reviewReason = 'Taux ou base de calcul manquant';
  } else {
    unitPrice = Number(input.definitionRate ?? input.fixedFee ?? 0);
    if (unitPrice <= 0) reviewReason = 'Tarif forfaitaire manquant';
  }
  const net = reviewReason ? 0 : money(quantity * unitPrice);
  const tax = money((net * Number(input.taxRate ?? 0)) / 100);
  return {
    quantity,
    unitPrice,
    net,
    tax,
    gross: money(net + tax),
    reviewReason,
  };
}
