import mongoose, { Schema, Document } from 'mongoose';

export type IngestionStatus =
  | 'QUEUED'
  | 'CLONING'
  | 'PARSING_AST'
  | 'BUILDING_GRAPH'
  | 'CHUNKING'
  | 'EMBEDDING'
  | 'INDEXING'
  | 'READY'
  | 'FAILED';

export interface IRepository extends Document {
  id: string;
  userId: string;
  name: string;
  owner: string;
  url: string;
  branch: string;
  status: IngestionStatus;
  progress: number; // 0 to 100
  stageMessage: string;
  localPath: string;
  languages: Record<string, number>;
  frameworks: string[];
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalRoutes: number;
    totalModels: number;
    totalChunks: number;
  };
  commitSha?: string;
  lastIndexedCommitSha?: string;
  incrementalStats?: {
    isIncremental: boolean;
    changedFiles: number;
    addedFiles: number;
    deletedFiles: number;
    skippedFiles: number;
    embeddingsRegenerated: number;
    indexingTimeSec: number;
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RepositorySchema = new Schema<IRepository>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    owner: { type: String, required: true },
    url: { type: String, required: true },
    branch: { type: String, default: 'main' },
    status: {
      type: String,
      enum: ['QUEUED', 'CLONING', 'PARSING_AST', 'BUILDING_GRAPH', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'READY', 'FAILED'],
      default: 'QUEUED',
      index: true,
    },
    progress: { type: Number, default: 0 },
    stageMessage: { type: String, default: 'Job queued' },
    localPath: { type: String, required: true },
    languages: { type: Schema.Types.Mixed, default: {} },
    frameworks: { type: [String], default: [] },
    stats: {
      totalFiles: { type: Number, default: 0 },
      totalSymbols: { type: Number, default: 0 },
      totalRoutes: { type: Number, default: 0 },
      totalModels: { type: Number, default: 0 },
      totalChunks: { type: Number, default: 0 },
    },
    commitSha: { type: String },
    lastIndexedCommitSha: { type: String },
    incrementalStats: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  {
    timestamps: true,
  }
);

// Compound index for strict multi-tenant isolation
RepositorySchema.index({ userId: 1, id: 1 });

export const RepositoryModel = mongoose.model<IRepository>('Repository', RepositorySchema);

// In-Memory store fallback for standalone / test mode
export const inMemoryRepos = new Map<string, any>();
