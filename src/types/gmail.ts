export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface EmailSummary {
  id: string;
  threadId?: string | null;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  bodyPreview: string;
  messageId: string;
}

export interface ReadEmailsOptions {
  query?: string;
  maxResults?: number;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
}

export interface CreateDraftOptions {
  to: string;
  subject: string;
  body: string;
  threadId?: string | null;
}

export interface ReplyToEmailOptions {
  messageId: string;
  body: string;
}

export interface MimeMessageOptions {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string | null;
}
