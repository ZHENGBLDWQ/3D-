export const BACKGROUND_JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled", "retry_wait"] as const;
export type BackgroundJobStatus = (typeof BACKGROUND_JOB_STATUSES)[number];

export interface BackgroundJob<TPayload = Record<string, unknown>, TResult = Record<string, unknown>> {
  key: string;
  type: string;
  status: BackgroundJobStatus;
  payload: TPayload;
  result?: TResult;
  attempts: number;
  maxAttempts: number;
  runAfter?: string;
  createdAt: string;
  updatedAt: string;
}
