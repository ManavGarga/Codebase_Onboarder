export interface IngestionJob {
  jobId: string;
  repositoryId: string;
  userId: string;
  url: string;
  branch: string;
  stage: string;
  progress: number;
  logs: Array<{ timestamp: string; message: string; stage: string }>;
  error?: string;
  completedAt?: string;
  accessToken?: string;
}

export const inMemoryJobs = new Map<string, IngestionJob>();
