/** Admin portal: platform settings and reports (staff only; enforced in SQL). */
import { AppError, toAppError } from '@itm/core';
import type { Json, Tables } from '@itm/types';
import type { ItmClient } from './client';

export type PlatformSetting = Tables<'platform_settings'>;
export type RateLimit = { max: number; window_seconds: number };

export type Count = { key: string; count: number };
export type AdminReport = {
  range: { from: string; to: string };
  requests: { created: number; by_status: Count[]; by_service_type: Count[]; by_urgency: Count[]; top_machine_types: Count[] };
  funnel: { created: number; provider_accepted: number; estimate_accepted: number; completed: number; cancelled: number };
  response: { median_hours_to_first_acceptance: number | null; no_acceptance_after_48h: number };
  complaints: {
    opened: number; by_category: Count[]; by_status: Count[];
    acknowledged_on_time: number; acknowledged_late: number; overdue_now: number;
  };
  providers: {
    by_kind_status: Array<{ kind: string; status: string; count: number }>;
    waiting_verification: number; median_hours_to_review: number | null;
  };
  accounts: { new: number };
};

export function isRateLimit(v: Json): v is RateLimit & Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    && typeof (v as Record<string, unknown>).max === 'number'
    && typeof (v as Record<string, unknown>).window_seconds === 'number';
}

export async function listPlatformSettings(client: ItmClient): Promise<PlatformSetting[]> {
  const { data, error } = await client.from('platform_settings').select('*').order('key');
  if (error) throw toAppError(error);
  return data ?? [];
}

export async function setPlatformSetting(client: ItmClient, key: string, value: Json): Promise<void> {
  const { error } = await client.rpc('set_platform_setting', { p_key: key, p_value: value });
  if (error) throw toAppError(error);
}

/** Dates are YYYY-MM-DD Indian calendar days, inclusive. */
export async function getAdminReport(client: ItmClient, from: string, to: string): Promise<AdminReport> {
  const { data, error } = await client.rpc('admin_report', { p_from: from, p_to: to });
  if (error) throw toAppError(error);
  if (!data) throw new AppError('unknown');
  return data as unknown as AdminReport;
}
