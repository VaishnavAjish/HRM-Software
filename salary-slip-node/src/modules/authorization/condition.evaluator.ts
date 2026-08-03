import {
  isConditionOperator,
  type ComparisonNode,
  type ConditionNode,
  type EvaluationContext,
  type Operand,
} from './authorization.types.js';

/**
 * Evaluates a validated JSON condition tree.
 *
 * Port of App\Services\Authorization\ConditionEvaluator.
 *
 * It never executes code. There is no eval(), no `new Function`, no template
 * interpolation into SQL, and no regex compiled straight from user input —
 * `matches` builds its pattern from an escaped literal so a policy author
 * cannot smuggle in a catastrophic backtracking expression and stall the
 * request loop for everyone. A policy is data, and this file is the only place
 * that data turns into a boolean.
 */

export class InvalidConditionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InvalidConditionError';
  }
}

/** Deepest nesting accepted. Matches the PHP limit. */
const MAX_DEPTH = 12;
/** Widest `all`/`any` accepted. Matches the PHP limit. */
const MAX_GROUP = 50;
/** Longest `matches` pattern accepted, before escaping. */
const MAX_PATTERN = 256;

/**
 * Laravel's Arr::get, narrowed to plain objects.
 *
 * Returns undefined for a missing path rather than throwing, because a
 * condition over an attribute the resource does not carry must evaluate to
 * "not satisfied", not to a 500.
 */
export function getPath(source: unknown, path: string): unknown {
  if (!path) return undefined;

  let current: unknown = source;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;

    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export class ConditionEvaluator {
  /**
   * `null`/absent conditions mean "unconditional", which is an ALLOW-shaped
   * answer — a permission with no conditions attached is not thereby denied.
   */
  evaluate(tree: ConditionNode | null | undefined, context: EvaluationContext): boolean {
    if (!tree || (isRecord(tree) && Object.keys(tree).length === 0)) return true;

    if (isRecord(tree) && 'all' in tree) {
      const children = (tree as { all: unknown }).all;
      // An empty `all` is vacuously true, matching PHP's every() on [].
      if (!Array.isArray(children)) return false;
      return children.every((child) => this.evaluate(child as ConditionNode, context));
    }

    if (isRecord(tree) && 'any' in tree) {
      const children = (tree as { any: unknown }).any;
      // An empty `any` is false, matching PHP's contains() on [].
      if (!Array.isArray(children)) return false;
      return children.some((child) => this.evaluate(child as ConditionNode, context));
    }

    if (isRecord(tree) && 'not' in tree) {
      return !this.evaluate((tree as { not: ConditionNode }).not, context);
    }

    return this.compare(tree as ComparisonNode, context);
  }

  /**
   * Structural check, run before a policy is stored and again before it is
   * evaluated.
   *
   * Validating at write time alone would not be enough: rows predate the
   * validator, and a policy edited directly in the database must not be able
   * to take the engine down.
   */
  validate(tree: ConditionNode | null | undefined, depth = 0): void {
    if (!tree) return;

    if (depth > MAX_DEPTH) throw new InvalidConditionError('INVALID_POLICY_CONDITION_DEPTH');
    if (!isRecord(tree)) throw new InvalidConditionError('INVALID_POLICY_CONDITION');

    for (const group of ['all', 'any'] as const) {
      if (group in tree) {
        const children = (tree as Record<string, unknown>)[group];
        if (!Array.isArray(children) || children.length > MAX_GROUP) {
          throw new InvalidConditionError('INVALID_POLICY_CONDITION_GROUP');
        }
        for (const child of children) this.validate(child as ConditionNode, depth + 1);
        return;
      }
    }

    if ('not' in tree) {
      this.validate((tree as { not: ConditionNode }).not, depth + 1);
      return;
    }

    if (!isConditionOperator((tree as ComparisonNode).operator)) {
      throw new InvalidConditionError('INVALID_POLICY_CONDITION');
    }
  }

  private compare(node: ComparisonNode, context: EvaluationContext): boolean {
    const operator = node?.operator;
    if (!isConditionOperator(operator)) {
      throw new InvalidConditionError('INVALID_POLICY_CONDITION');
    }

    const left = this.operand(node.left ?? node.attribute, context, true);
    const right = this.operand(node.right ?? node.value, context, false);

    switch (operator) {
      case 'equals':
        return left === right;
      case 'not_equals':
        return left !== right;
      case 'contains':
        return this.contains(left, right);
      case 'not_contains':
        return !this.contains(left, right);
      case 'in':
        return Array.isArray(right) && right.includes(left);
      case 'not_in':
        return !Array.isArray(right) || !right.includes(left);
      case 'greater_than':
        return this.ordered(left, right, (a, b) => a > b);
      case 'greater_than_or_equal':
        return this.ordered(left, right, (a, b) => a >= b);
      case 'less_than':
        return this.ordered(left, right, (a, b) => a < b);
      case 'less_than_or_equal':
        return this.ordered(left, right, (a, b) => a <= b);
      case 'between': {
        if (!Array.isArray(right) || right.length !== 2) return false;
        return (
          this.ordered(left, right[0], (a, b) => a >= b) &&
          this.ordered(left, right[1], (a, b) => a <= b)
        );
      }
      case 'starts_with':
        return typeof left === 'string' && typeof right === 'string' && left.startsWith(right);
      case 'ends_with':
        return typeof left === 'string' && typeof right === 'string' && left.endsWith(right);
      case 'exists':
        return left !== null && left !== undefined;
      case 'not_exists':
        return left === null || left === undefined;
      case 'matches':
        return this.globMatch(left, right);
      case 'is_owner':
        return this.same(context, 'subject.id', 'resource.owner_id');
      case 'is_creator':
        return this.same(context, 'subject.id', 'resource.created_by');
      case 'is_assignee':
        return this.same(context, 'subject.id', 'resource.assigned_to');
      case 'is_manager':
        return this.hasRelationship(context, 'manager_of');
      case 'is_direct_report':
        return this.hasRelationship(context, 'direct_manager_of');
      case 'is_indirect_report':
        return this.hasRelationship(context, 'indirect_manager_of');
      case 'is_same_company':
        return this.same(context, 'subject.company_code', 'resource.company_code');
      case 'is_same_branch':
        return this.same(context, 'subject.branch_id', 'resource.branch_id');
      case 'is_same_department':
        return this.same(context, 'subject.department', 'resource.department');
      case 'is_same_team':
        return this.same(context, 'subject.team_id', 'resource.team_id');
    }
  }

  /**
   * Resolve an operand to a value.
   *
   * Three forms, matching the PHP:
   *   {path: "resource.status"}  explicit, works on either side
   *   "subject.company_code"     bare path, left-hand side only
   *   "$resource.status"         $-prefixed path, right-hand side only
   *
   * The asymmetry is deliberate. The right-hand side is usually a literal, and
   * a string literal that happened to look like "resource.pending" would
   * otherwise silently become a lookup that resolves to undefined — a
   * condition that never matches and no error to explain why.
   */
  private operand(operand: Operand, context: EvaluationContext, pathsByDefault: boolean): unknown {
    if (isRecord(operand) && 'path' in operand) {
      return getPath(context, String(operand.path));
    }

    if (pathsByDefault && typeof operand === 'string' && /^(subject|resource|environment|action)\./.test(operand)) {
      return getPath(context, operand);
    }

    if (!pathsByDefault && typeof operand === 'string' && operand.startsWith('$')) {
      return getPath(context, operand.slice(1));
    }

    return operand;
  }

  private contains(haystack: unknown, needle: unknown): boolean {
    if (Array.isArray(haystack)) return haystack.includes(needle);
    return typeof haystack === 'string' && typeof needle === 'string' && haystack.includes(needle);
  }

  /**
   * Ordered comparison over numbers, date strings and plain strings.
   *
   * DELIBERATE DIVERGENCE from PHP. PHP 8 compares a non-numeric string to a
   * number by casting the number to a string, so `"abc" > 5` is true there and
   * false here. Reproducing that would mean reproducing a coercion table that
   * surprises everyone who reads the policy; a mismatched pair simply does not
   * satisfy the condition instead. Numeric strings still compare numerically,
   * which is the case policies actually rely on ("amount" arriving as "5000").
   */
  private ordered(left: unknown, right: unknown, compare: (a: number | string, b: number | string) => boolean): boolean {
    if (left === null || left === undefined || right === null || right === undefined) return false;

    const leftNum = this.numeric(left);
    const rightNum = this.numeric(right);
    if (leftNum !== null && rightNum !== null) return compare(leftNum, rightNum);

    if (typeof left === 'string' && typeof right === 'string') return compare(left, right);

    return false;
  }

  private numeric(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'bigint') return Number(value);
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;

      // ISO dates are the other ordered type policies use ("valid until").
      const time = Date.parse(value);
      return Number.isNaN(time) ? null : time;
    }
    return null;
  }

  /**
   * Glob match, `*` and `?` only.
   *
   * The pattern is regex-escaped first and the two wildcards reintroduced
   * afterwards, so every other metacharacter is a literal. That is what stops
   * a policy condition from becoming a denial-of-service vector.
   */
  private globMatch(value: unknown, pattern: unknown): boolean {
    if (typeof value !== 'string' || typeof pattern !== 'string') return false;
    if (pattern.length > MAX_PATTERN) return false;

    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const source = `^${escaped.replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`;

    return new RegExp(source, 'u').test(value);
  }

  /** Both sides must be present; compared as strings so 7 and "7" match. */
  private same(context: EvaluationContext, leftPath: string, rightPath: string): boolean {
    const a = getPath(context, leftPath);
    const b = getPath(context, rightPath);
    if (a === null || a === undefined || b === null || b === undefined) return false;

    return String(a) === String(b);
  }

  private hasRelationship(context: EvaluationContext, relationship: string): boolean {
    const relationships = getPath(context, 'relationships');
    if (Array.isArray(relationships)) return relationships.includes(relationship);
    return relationships === relationship;
  }
}

export const conditions = new ConditionEvaluator();
