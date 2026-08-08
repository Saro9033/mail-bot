import { DynamicStructuredTool } from '@langchain/core/tools';
import type { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import {
  readEmails,
  replyToEmail,
  sendEmail,
  createDraft,
} from '../services/gmail';
import { validateEmailContent } from '../utils/emailValidation';
import { savePendingAction } from '../services/pendingAction';
import { formatApiError } from '../utils/errors';

function getErrorMessage(err: unknown): string {
  return formatApiError(err);
}

const confirmedSchema = z
  .boolean()
  .describe(
    'Set to true ONLY after the user has explicitly confirmed. Must be false when first proposing an action.'
  );

const draftFieldsSchema = z.object({
  to: z
    .string()
    .describe('Recipient email(s) — one address or comma-separated'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Complete email body with real names — no placeholders'),
  threadId: z
    .string()
    .optional()
    .describe('Optional Gmail thread id for reply drafts (from read_emails)'),
});

function buildConfirmationResponse(
  action: string,
  draft: Record<string, unknown>
): string {
  return JSON.stringify({
    success: false,
    requires_confirmation: true,
    action,
    draft,
    message:
      'Draft saved. Show it ONCE in markdown and ask the user to confirm. Do NOT call this tool again — the server will execute when the user confirms.',
  });
}

async function handleDraftAction(
  auth: OAuth2Client,
  userId: string,
  action: 'compose_email' | 'create_draft',
  payload: { to: string; subject: string; body: string; threadId?: string },
  confirmed: boolean
): Promise<string> {
  const placeholderError = validateEmailContent(payload.subject, payload.body);
  if (placeholderError) {
    return JSON.stringify({ success: false, error: placeholderError });
  }

  if (!confirmed) {
    await savePendingAction(userId, action, payload);
    return buildConfirmationResponse(action, payload);
  }

  try {
    const result = await createDraft(auth, payload);
    return JSON.stringify({ success: true, savedAsDraft: true, ...result });
  } catch (err) {
    return JSON.stringify({ success: false, error: getErrorMessage(err) });
  }
}

export function createGmailTools(auth: OAuth2Client, userId: string): DynamicStructuredTool[] {
  const readEmailsTool = new DynamicStructuredTool({
    name: 'read_emails',
    description:
      "Search/read emails. Gmail query examples: is:unread, from:john@mail.com, to:jane@mail.com, in:sent, in:drafts, after:2026/08/01. No confirmation needed.",
    schema: z.object({
      query: z.string().optional().describe('Gmail search query string'),
      maxResults: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of emails to return (default 10)'),
    }),
    func: async ({ query, maxResults }) => {
      try {
        const emails = await readEmails(auth, { query, maxResults });
        return JSON.stringify({ success: true, count: emails.length, emails });
      } catch (err) {
        return JSON.stringify({ success: false, error: getErrorMessage(err) });
      }
    },
  });

  const sendEmailTool = new DynamicStructuredTool({
    name: 'send_email',
    description:
      'Send one email immediately. For drafts use compose_email or create_draft. Comma-separated to for same message to multiple people.',
    schema: z.object({
      to: z.string().describe('Recipient email(s)'),
      subject: z.string().describe('Email subject line'),
      body: z.string().describe('Complete email body — no placeholders'),
      confirmed: confirmedSchema,
    }),
    func: async ({ to, subject, body, confirmed }) => {
      const placeholderError = validateEmailContent(subject, body);
      if (placeholderError) {
        return JSON.stringify({ success: false, error: placeholderError });
      }

      if (!confirmed) {
        await savePendingAction(userId, 'send_email', { to, subject, body });
        return buildConfirmationResponse('send_email', { to, subject, body });
      }

      try {
        const result = await sendEmail(auth, { to, subject, body });
        return JSON.stringify({ success: true, sent: true, ...result });
      } catch (err) {
        return JSON.stringify({ success: false, error: getErrorMessage(err) });
      }
    },
  });

  const sendEmailsTool = new DynamicStructuredTool({
    name: 'send_emails',
    description: 'Send multiple emails with different content per recipient.',
    schema: z.object({
      emails: z
        .array(
          z.object({
            to: z.string(),
            subject: z.string(),
            body: z.string(),
          })
        )
        .min(1),
      confirmed: confirmedSchema,
    }),
    func: async ({ emails, confirmed }) => {
      for (const email of emails) {
        const err = validateEmailContent(email.subject, email.body);
        if (err) {
          return JSON.stringify({ success: false, error: err });
        }
      }

      if (!confirmed) {
        await savePendingAction(userId, 'send_emails', { emails });
        return buildConfirmationResponse('send_emails', { emails });
      }

      try {
        const results = [];
        for (const email of emails) {
          const result = await sendEmail(auth, email);
          results.push({ to: email.to, ...result });
        }
        return JSON.stringify({ success: true, sent: true, count: results.length, results });
      } catch (err) {
        return JSON.stringify({ success: false, error: getErrorMessage(err) });
      }
    },
  });

  const composeEmailTool = new DynamicStructuredTool({
    name: 'compose_email',
    description:
      'Compose a new email and save as Gmail draft (does NOT send). Use confirmed=false to preview, confirmed=true after user confirms to save draft. Optional threadId for reply drafts.',
    schema: draftFieldsSchema.extend({ confirmed: confirmedSchema }),
    func: async ({ to, subject, body, threadId, confirmed }) =>
      handleDraftAction(auth, userId, 'compose_email', { to, subject, body, threadId }, confirmed),
  });

  const createDraftTool = new DynamicStructuredTool({
    name: 'create_draft',
    description:
      'Save an email as a draft in Gmail (does NOT send). Use when user asks to save/create a draft. confirmed=false previews, confirmed=true saves to Drafts folder.',
    schema: draftFieldsSchema.extend({ confirmed: confirmedSchema }),
    func: async ({ to, subject, body, threadId, confirmed }) =>
      handleDraftAction(auth, userId, 'create_draft', { to, subject, body, threadId }, confirmed),
  });

  const replyToEmailTool = new DynamicStructuredTool({
    name: 'reply_to_email',
    description:
      'Send a reply immediately. For reply drafts use compose_email with threadId. Use id from read_emails.',
    schema: z.object({
      messageId: z.string().describe('Gmail API message id from read_emails id field'),
      body: z.string().describe('Complete reply body — no placeholders'),
      confirmed: confirmedSchema,
    }),
    func: async ({ messageId, body, confirmed }) => {
      const placeholderError = validateEmailContent('', body);
      if (placeholderError) {
        return JSON.stringify({ success: false, error: placeholderError });
      }

      if (!confirmed) {
        await savePendingAction(userId, 'reply_to_email', { messageId, body });
        return buildConfirmationResponse('reply_to_email', { messageId, body });
      }

      try {
        const result = await replyToEmail(auth, { messageId, body });
        return JSON.stringify({ success: true, sent: true, ...result });
      } catch (err) {
        return JSON.stringify({ success: false, error: getErrorMessage(err) });
      }
    },
  });

  return [
    readEmailsTool,
    sendEmailTool,
    sendEmailsTool,
    composeEmailTool,
    createDraftTool,
    replyToEmailTool,
  ];
}
