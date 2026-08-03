import { z } from 'zod';

import { ResourceError } from '../../lib/errors.js';

/**
 * RBAC settings — App\Http\Controllers\SettingsController.
 *
 * Stored values are sparse: only settings that have been changed exist as
 * rows, and the response is the defaults with those overrides applied. That
 * means a fresh install returns a full list from an empty table, and a default
 * changed in code takes effect for everyone who never touched that setting.
 */

/** SettingsController::DEFAULTS, verbatim — values are strings, not booleans. */
export const SETTING_DEFAULTS: Record<string, string> = {
  'rbac.require_2fa': 'false',
  'rbac.session_timeout_minutes': '60',
  'rbac.enable_audit_logging': 'true',
  'rbac.max_failed_login_attempts': '5',

  // Which widgets show on the RBAC dashboard — surfaced there via a settings
  // panel instead of a separate Settings page.
  'dashboard.show_total_users': 'true',
  'dashboard.show_active_users': 'true',
  'dashboard.show_total_roles': 'true',
  'dashboard.show_total_permissions': 'true',
  'dashboard.show_departments': 'true',
  'dashboard.show_locations': 'true',
  'dashboard.show_approval_levels': 'true',
  'dashboard.show_users_by_role_chart': 'true',
  'dashboard.show_users_by_department_chart': 'true',
  'dashboard.show_recent_activity': 'true',
};

export const DEFAULT_GROUP = 'rbac';

export interface SettingRow {
  key: string;
  value: string;
  group: string;
}

export interface SettingsRepository {
  /** Stored values for a group, keyed by setting key. */
  valuesFor(group: string): Promise<Record<string, string>>;
  upsert(key: string, value: string, group: string): Promise<void>;
}

const updateSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.string({ required_error: 'The settings.key field is required.' })
          .min(1, 'The settings.key field is required.'),
        value: z.string().nullish().transform((v) => v ?? ''),
      }),
      { required_error: 'The settings field is required.' },
    )
    .min(1, 'The settings field is required.'),
});

export class SettingsService {
  constructor(private readonly repo: SettingsRepository) {}

  /**
   * Defaults for the group, overridden by anything stored.
   *
   * Only keys prefixed with the group name are returned, so ?group=dashboard
   * yields the widget toggles and ?group=rbac the policy settings.
   */
  async list(group: string): Promise<SettingRow[]> {
    const stored = await this.repo.valuesFor(group);

    return Object.entries(SETTING_DEFAULTS)
      .filter(([key]) => key.startsWith(`${group}.`))
      .map(([key, fallback]) => ({
        key,
        value: stored[key] ?? fallback,
        group,
      }));
  }

  /**
   * Persist a batch, returning the values before and after for the audit log.
   *
   * Note the upsert matches on key alone, as Laravel's updateOrCreate does
   * here — a key belongs to exactly one group by naming convention, so the
   * group is written rather than matched on.
   */
  async update(
    group: string,
    input: unknown,
  ): Promise<{ before: Record<string, string>; after: Record<string, string> }> {
    const parsed = updateSchema.safeParse(input ?? {});
    if (!parsed.success) {
      throw new ResourceError(
        parsed.error.issues[0]?.message ?? 'The given data was invalid.',
        422,
      );
    }

    // Copied, not aliased: the upserts below must not be able to mutate the
    // snapshot that goes to the audit log.
    const before = { ...(await this.repo.valuesFor(group)) };
    const after: Record<string, string> = {};

    for (const item of parsed.data.settings) {
      await this.repo.upsert(item.key, item.value, group);
      after[item.key] = item.value;
    }

    return { before, after };
  }
}
