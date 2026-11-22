import mongoose, { Document, Schema } from 'mongoose';

export type PendingActionType =
  | 'send_email'
  | 'send_emails'
  | 'reply_to_email'
  | 'compose_email'
  | 'create_draft';

export interface IPendingAction extends Document {
  userId: string;
  action: PendingActionType;
  payload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const pendingActionSchema = new Schema<IPendingAction>(
  {
    userId: { type: String, required: true, unique: true },
    action: {
      type: String,
      enum: ['send_email', 'send_emails', 'reply_to_email', 'compose_email', 'create_draft'],
      required: true,
    },
    payload: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const PendingAction = mongoose.model<IPendingAction>(
  'PendingAction',
  pendingActionSchema
);
