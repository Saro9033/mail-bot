import mongoose, { Document, Schema } from 'mongoose';

export type WatchdogActivityAction =
  | 'forwarded'
  | 'skipped_other'
  | 'no_rule'
  | 'forward_failed';

export type WatchdogActivityStatus = 'success' | 'skipped' | 'failed';

export interface IWatchdogActivity extends Document {
  userId: string;
  messageId: string;
  subject: string;
  from: string;
  emailType: string;
  action: WatchdogActivityAction;
  forwardTo?: string;
  status: WatchdogActivityStatus;
  createdAt: Date;
  updatedAt: Date;
}

const watchdogActivitySchema = new Schema<IWatchdogActivity>(
  {
    userId: { type: String, required: true, index: true },
    messageId: { type: String, required: true },
    subject: { type: String, default: '' },
    from: { type: String, default: '' },
    emailType: { type: String, default: '' },
    action: {
      type: String,
      enum: ['forwarded', 'skipped_other', 'no_rule', 'forward_failed'],
      required: true,
    },
    forwardTo: { type: String },
    status: {
      type: String,
      enum: ['success', 'skipped', 'failed'],
      required: true,
    },
  },
  { timestamps: true }
);

watchdogActivitySchema.index({ userId: 1, createdAt: -1 });

export const WatchdogActivity = mongoose.model<IWatchdogActivity>(
  'WatchdogActivity',
  watchdogActivitySchema
);
