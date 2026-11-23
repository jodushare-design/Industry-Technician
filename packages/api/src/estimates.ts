/** Estimates: provider drafts/sends/withdraws; customer accepts/rejects/requests changes. */
import { AppError, estimateDraftSchema, parseOrThrow, toAppError, type EstimateDraftInput } from '@itm/core';
import type { EstimateKind, Json, Tables } from '@itm/types';
import type { ItmClient } from './client';

export type EstimateRevision = Tables<'estimate_revisions'>;
export type Estimate = Tables<'estimates'>;

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}

export async function saveEstimateDraft(
  client: ItmClient,
  input: { requestId: string; providerId: string; estimateId?: string | null; kind: EstimateKind; title?: string; fields: EstimateDraftInput },
): Promise<string> {
  const fields = parseOrThrow(estimateDraftSchema, input.fields);
  const id = unwrap(
    await client.rpc('save_estimate_draft', {
      p_request: input.requestId,
      p_provider: input.providerId,
      p_estimate: input.estimateId ?? null,
      p_kind: input.kind,
      p_title: input.title?.trim() || null,
      p_fields: fields as unknown as Json,
    }),
  );
  if (!id) throw new AppError('unknown');
  return id;
}

export async function discardEstimateDraft(client: ItmClient, revisionId: string): Promise<void> {
  unwrap(await client.rpc('discard_estimate_draft', { p_revision: revisionId }));
}

export async function sendEstimateRevision(client: ItmClient, revisionId: string): Promise<string> {
  const hash = unwrap(await client.rpc('send_estimate_revision', { p_revision: revisionId }));
  if (!hash) throw new AppError('unknown');
  return hash;
}

export async function withdrawEstimateRevision(client: ItmClient, revisionId: string, reason: string): Promise<void> {
  unwrap(await client.rpc('withdraw_estimate_revision', { p_revision: revisionId, p_reason: reason }));
}

/** The customer's decision on the exact revision they were shown (contentHash from that view). */
export async function decideEstimate(
  client: ItmClient,
  revisionId: string,
  decision: 'accept' | 'reject' | 'request_revision',
  contentHash: string,
  note?: string,
): Promise<void> {
  unwrap(await client.rpc('decide_estimate', { p_revision: revisionId, p_decision: decision, p_hash: contentHash, p_note: note?.trim() || null }));
}

/** All estimates on a request (RLS: customers see sent ones; providers see their own incl. drafts). */
export async function listEstimates(client: ItmClient, requestId: string) {
  const estimates = unwrap(await client.from('estimates').select('*').eq('request_id', requestId).order('created_at')) ?? [];
  if (!estimates.length) return [] as (Estimate & { revisions: EstimateRevision[] })[];
  const revisions =
    unwrap(await client.from('estimate_revisions').select('*').in('estimate_id', estimates.map((e) => e.id)).order('revision_no', { ascending: false })) ?? [];
  return estimates.map((e) => ({ ...e, revisions: revisions.filter((r) => r.estimate_id === e.id) }));
}
