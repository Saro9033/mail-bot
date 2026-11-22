import mongoose, { Document, Schema } from 'mongoose';

export interface IWatchdogStats {
  emailsRead: number;
  emailsForwarded: number;
  emailsSkipped: number;
}

export interface IWatchdogRule {
  type: string;
  forwardToEmail: string;
}

export interface IWatchdogConfig extends Document {
  userId: string;
  enabled: boolean;
  rules: IWatchdogRule[];
  processedMessageIds: string[];
  stats: IWatchdogStats;
  createdAt: Date;
  updatedAt: Date;
}

const watchdogRuleSchema = new Schema<IWatchdogRule>(
  {
    type: { type: String, required: true },
    forwardToEmail: { type: String, required: true },
  },
  { _id: false }
);

const watchdogStatsSchema = new Schema<IWatchdogStats>(
  {
    emailsRead: { type: Number, default: 0 },
    emailsForwarded: { type: Number, default: 0 },
    emailsSkipped: { type: Number, default: 0 },
  },
  { _id: false }
);

const watchdogConfigSchema = new Schema<IWatchdogConfig>(
  {
    userId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    rules: { type: [watchdogRuleSchema], default: [] },
    processedMessageIds: { type: [String], default: [] },
    stats: {
      type: watchdogStatsSchema,
      default: () => ({ emailsRead: 0, emailsForwarded: 0, emailsSkipped: 0 }),
    },
  },
  { timestamps: true }
);

export const WatchdogConfig = mongoose.model<IWatchdogConfig>(
  'WatchdogConfig',
  watchdogConfigSchema
);
