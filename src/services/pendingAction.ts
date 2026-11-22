import type { OAuth2Client } from 'google-auth-library';
import {
  PendingAction,
  IPendingAction,
  PendingActionType,
} from '../models/PendingAction';
import { sendEmail, replyToEmail, createDraft } from './gmail';

export async function savePendingAction(
  userId: string,
  action: PendingActionType,
  payload: Record<string, unknown>
): Promise<void> {
  await PendingAction.findOneAndUpdate(
    { userId },
    { userId, action, payload },
    { upsert: true, new: true }
  );
}

export async function getPendingAction(userId: string): Promise<IPendingAction | null> {
  return PendingAction.findOne({ userId });
}

export async function clearPendingAction(userId: string): Promise<void> {
  await PendingAction.deleteOne({ userId });
}

async function saveAsDraft(
  auth: OAuth2Client,
  payload: Record<string, unknown>
): Promise<string> {
  const to = String(payload.to ?? '');
  const subject = String(payload.subject ?? '');
  const body = String(payload.body ?? '');
  const threadId = payload.threadId ? String(payload.threadId) : undefined;

  await createDraft(auth, { to, subject, body, threadId });
  return `Draft saved in Gmail for **${to}**.

**Subject:** ${subject}

Open Gmail → **Drafts** to review and send.`;
}

export async function executePendingAction(
  auth: OAuth2Client,
  pending: IPendingAction
): Promise<string> {
  const { action, payload } = pending;

  switch (action) {
    case 'send_email': {
      const to = String(payload.to ?? '');
      const subject = String(payload.subject ?? '');
      const body = String(payload.body ?? '');
      await sendEmail(auth, { to, subject, body });
      await clearPendingAction(pending.userId);
      return `Your email has been sent successfully to **${to}**.

**Subject:** ${subject}`;
    }

    case 'send_emails': {
      const emails = payload.emails as Array<{ to: string; subject: string; body: string }>;
      const sent: string[] = [];
      for (const email of emails) {
        await sendEmail(auth, email);
        sent.push(email.to);
      }
      await clearPendingAction(pending.userId);
      return `Your email(s) have been sent successfully to: **${sent.join(', ')}**.`;
    }

    case 'reply_to_email': {
      const messageId = String(payload.messageId ?? '');
      const body = String(payload.body ?? '');
      await replyToEmail(auth, { messageId, body });
      await clearPendingAction(pending.userId);
      return 'Your reply has been sent successfully.';
    }

    case 'compose_email':
    case 'create_draft': {
      const reply = await saveAsDraft(auth, payload);
      await clearPendingAction(pending.userId);
      return reply;
    }

    default:
      throw new Error(`Unknown pending action: ${action}`);
  }
}
