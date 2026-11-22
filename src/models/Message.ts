import mongoose, { Document, Schema } from 'mongoose';

export type MessageRole = 'user' | 'assistant';

export interface IMessage extends Document {
  userId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    userId: { type: String, required: true, index: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

messageSchema.index({ userId: 1, createdAt: 1 });

export const Message = mongoose.model<IMessage>('Message', messageSchema);
