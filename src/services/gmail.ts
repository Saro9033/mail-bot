import type { OAuth2Client } from 'google-auth-library';
import type { gmail_v1 } from 'googleapis';
import { google } from '../config/google';
import type {
  EmailSummary,
  MimeMessageOptions,
  ReadEmailsOptions,
  ReplyToEmailOptions,
  SendEmailOptions,
  CreateDraftOptions,
} from '../types/gmail';

function getGmailClient(auth: OAuth2Client): gmail_v1.Gmail {
  return google.gmail({ version: 'v1', auth });
}

function decodeBase64(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  if (!headers) return '';
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? '';
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64(part.body.data)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

function createMimeMessage({
  to,
  subject,
  body,
  inReplyTo,
  references,
}: MimeMessageOptions): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
  ];

  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    lines.push(`References: ${references}`);
  }

  lines.push('', body);

  const raw = lines.join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

export async function verifyGmailAccess(auth: OAuth2Client): Promise<void> {
  const gmail = getGmailClient(auth);
  await gmail.users.getProfile({ userId: 'me' });
}

export async function readEmails(
  auth: OAuth2Client,
  { query = '', maxResults = 10 }: ReadEmailsOptions = {}
): Promise<EmailSummary[]> {
  const gmail = getGmailClient(auth);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query || undefined,
    maxResults: Math.min(maxResults, 50),
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) {
    return [];
  }

  const results: EmailSummary[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    });

    const headers = detail.data.payload?.headers;
    const body = extractBody(detail.data.payload);
    const preview = body.slice(0, 500);

    results.push({
      id: msg.id,
      threadId: detail.data.threadId,
      from: getHeader(headers, 'From'),
      subject: getHeader(headers, 'Subject'),
      date: getHeader(headers, 'Date'),
      snippet: detail.data.snippet ?? '',
      bodyPreview: preview,
      messageId: getHeader(headers, 'Message-ID'),
    });
  }

  return results;
}

export async function sendEmail(
  auth: OAuth2Client,
  { to, subject, body }: SendEmailOptions
): Promise<{ id?: string | null; threadId?: string | null }> {
  const gmail = getGmailClient(auth);
  const raw = createMimeMessage({ to, subject, body });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  return { id: res.data.id, threadId: res.data.threadId };
}

export async function createDraft(
  auth: OAuth2Client,
  { to, subject, body, threadId }: CreateDraftOptions
): Promise<{ draftId?: string | null; messageId?: string | null; threadId?: string | null }> {
  const gmail = getGmailClient(auth);
  const raw = createMimeMessage({ to, subject, body });

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw,
        threadId: threadId ?? undefined,
      },
    },
  });

  return {
    draftId: res.data.id,
    messageId: res.data.message?.id,
    threadId: res.data.message?.threadId,
  };
}

export async function replyToEmail(
  auth: OAuth2Client,
  { messageId, body }: ReplyToEmailOptions
): Promise<{
  id?: string | null;
  threadId?: string | null;
  to: string;
  subject: string;
}> {
  const gmail = getGmailClient(auth);

  const original = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = original.data.payload?.headers;
  const originalFrom = getHeader(headers, 'From');
  const originalSubject = getHeader(headers, 'Subject');
  const originalMessageId = getHeader(headers, 'Message-ID');
  const originalReferences = getHeader(headers, 'References');

  const to = originalFrom;
  const subject = originalSubject.startsWith('Re:')
    ? originalSubject
    : `Re: ${originalSubject}`;

  const references = originalReferences
    ? `${originalReferences} ${originalMessageId}`
    : originalMessageId;

  const raw = createMimeMessage({
    to,
    subject,
    body,
    inReplyTo: originalMessageId,
    references,
    threadId: original.data.threadId,
  });

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: original.data.threadId,
    },
  });

  return { id: res.data.id, threadId: res.data.threadId, to, subject };
}
