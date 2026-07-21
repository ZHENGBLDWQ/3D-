export const SLICING_JOB_STATUSES = [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "cancel_requested",
  "cancelled",
  "timed_out",
] as const;

export type SlicingJobStatus = (typeof SLICING_JOB_STATUSES)[number];

export type SlicerProfileSnapshot = {
  id: string;
  name: string;
  version: string;
  sha256?: string;
  config: Record<string, unknown>;
};

export type SlicingRequest = {
  protocolVersion: 1;
  jobKey: string;
  input: { fileId: number; filename: string; format: "stl" | "3mf"; sha256: string };
  output: { format: "3mf"; objectKey: string };
  plateIndex?: number;
  timeoutSeconds: number;
  profiles: {
    printer: SlicerProfileSnapshot;
    process: SlicerProfileSnapshot;
    filaments: SlicerProfileSnapshot[];
  };
};

export type SlicingOutputMetadata = {
  filename: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  slicerName: "Bambu Studio";
  slicerVersion: string;
  plateCount?: number;
  estimatedSeconds?: number;
  totalFilamentGrams?: number;
  filamentUsage?: Array<{ slot: number; material?: string; color?: string; grams: number }>;
  generatedAt: string;
};

export type SlicingResult = {
  protocolVersion: 1;
  jobKey: string;
  status: Extract<SlicingJobStatus, "succeeded" | "failed" | "cancelled" | "timed_out">;
  output?: SlicingOutputMetadata;
  error?: { code: string; message: string };
  logTail?: string[];
};
