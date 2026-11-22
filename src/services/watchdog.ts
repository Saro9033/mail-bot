import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { OAuth2Client } from 'google-auth-library';
import { createChatModel } from './agent';
import { User, IUser } from '../models/User';
import {
  WatchdogConfig,
  IWatchdogConfig,
  IWatchdogRule,
  IWatchdogStats,
} from '../models/WatchdogConfig';
import {
  WatchdogActivity,
  WatchdogActivityAction,
  WatchdogActivityStatus,
} from '../models/WatchdogActivity';
import { getAuthForUser } from './auth';
import { readEmails, sendEmail, markAsRead } from './gmail';
import {
  WATCHDOG_TYPES,
  WatchdogType,
  isWatchdogType,
  normalizeWatchdogType,
} from '../config/watchdog';

export { WATCHDOG_TYPES };

const MAX_PROCESSED_IDS = 300;
const POLL_INTERVAL_MS = Number(process.env.WATCHDOG_POLL_MS) || 3 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidForwardEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function sanitizeRules(rules: IWatchdogRule[]): IWatchdogRule[] {
  const seen = new Set<string>();

  return rules
    .map((rule) => ({
      type: normalizeWatchdogType(rule.type) ?? rule.type.trim(),
      forwardToEmail: rule.forwardToEmail.trim().toLowerCase(),
    }))
    .filter((rule) => isWatchdogType(rule.type) && isValidForwardEmail(rule.forwardToEmail))
    .filter((rule) => {
      const key = `${rule.type.toLowerCase()}|${rule.forwardToEmail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function getWatchdogConfig(userId: string): Promise<IWatchdogConfig> {
  let config = await WatchdogConfig.findOne({ userId });
  if (!config) {
    config = await WatchdogConfig.create({ userId, enabled: false, rules: [] });
  }
  return config;
}

export async function updateWatchdogConfig(
  userId: string,
  updates: { enabled?: boolean; rules?: IWatchdogRule[] }
): Promise<IWatchdogConfig> {
  const config = await getWatchdogConfig(userId);

  if (typeof updates.enabled === 'boolean') {
    config.enabled = updates.enabled;
  }

  if (updates.rules) {
    config.rules = sanitizeRules(updates.rules);
  }

  await config.save();
  return config;
}

async function classifyEmail(
  subject: string,
  bodyPreview: string,
  snippet: string
): Promise<WatchdogType | 'Other'> {
  const llm = createChatModel();

  const response = await llm.invoke([
    new SystemMessage(
      `Classify this inbound email into exactly one category or Other.

Categories (use exact label in JSON):
- Product or Service Inquiry — questions about products, services, features, availability, how something works.
- Pricing and Quote Request — pricing, quotation, cost estimate, RFQ, budget, price list.
- Collaboration or Partnership — partnership, collaboration, joint venture, sponsorship, business alliance.
- LinkedIn Message — messages from LinkedIn.
- Other — newsletters, notifications, personal mail, spam, unrelated topics.

Reply with JSON only, e.g. {"type":"Product or Service Inquiry"} or {"type":"Other"}`
    ),
    new HumanMessage(
      `Subject: ${subject}\nSnippet: ${snippet}\nBody preview: ${bodyPreview.slice(0, 800)}`
    ),
  ]);

  try {
    const text = String(response.content).trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as { type?: string };
    const normalized = normalizeWatchdogType(parsed.type ?? '');
    if (normalized) return normalized;
    return 'Other';
  } catch {
    return 'Other';
  }
}

function findMatchingRule(
  rules: IWatchdogRule[],
  emailType: WatchdogType
): IWatchdogRule | undefined {
  const normalized = emailType.toLowerCase();
  return rules.find((rule) => rule.type.toLowerCase() === normalized);
}

async function forwardInboundEmail(
  auth: OAuth2Client,
  email: {
    from: string;
    subject: string;
    date: string;
    bodyPreview: string;
    snippet: string;
  },
  emailType: WatchdogType,
  forwardTo: string
): Promise<void> {
  const subject = `Fwd: ${email.subject} [${emailType}]`;
  const body = [
    `Auto-forwarded by Mail Chatbot watchdog (${emailType}).`,
    '',
    '---------- Forwarded message ----------',
    `From: ${email.from}`,
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
    '',
    email.bodyPreview || email.snippet,
  ].join('\n');

  await sendEmail(auth, { to: forwardTo, subject, body });
}

function rememberProcessedId(config: IWatchdogConfig, messageId: string): void {
  if (config.processedMessageIds.includes(messageId)) return;
  config.processedMessageIds.push(messageId);
  if (config.processedMessageIds.length > MAX_PROCESSED_IDS) {
    config.processedMessageIds = config.processedMessageIds.slice(-MAX_PROCESSED_IDS);
  }
}

function ensureStats(config: IWatchdogConfig): IWatchdogStats {
  if (!config.stats) {
    config.stats = { emailsRead: 0, emailsForwarded: 0, emailsSkipped: 0 };
  }
  return config.stats;
}

async function logActivity(
  userId: string,
  entry: {
    messageId: string;
    subject: string;
    from: string;
    emailType: string;
    action: WatchdogActivityAction;
    forwardTo?: string;
    status: WatchdogActivityStatus;
  }
): Promise<void> {
  await WatchdogActivity.create({ userId, ...entry });

  const excess = await WatchdogActivity.countDocuments({ userId });
  if (excess > 120) {
    const oldest = await WatchdogActivity.find({ userId })
      .sort({ createdAt: 1 })
      .limit(excess - 100)
      .select('_id');
    const ids = oldest.map((doc) => doc._id);
    if (ids.length > 0) {
      await WatchdogActivity.deleteMany({ _id: { $in: ids } });
    }
  }
}

export async function getWatchdogActivity(
  userId: string,
  limit = 50
): Promise<
  Array<{
    subject: string;
    from: string;
    emailType: string;
    action: WatchdogActivityAction;
    forwardTo?: string;
    status: WatchdogActivityStatus;
    createdAt: Date;
  }>
> {
  const rows = await WatchdogActivity.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return rows.map((row) => ({
    subject: row.subject,
    from: row.from,
    emailType: row.emailType,
    action: row.action,
    forwardTo: row.forwardTo,
    status: row.status,
    createdAt: row.createdAt,
  }));
}

export async function scanWatchdogForUser(userId: string): Promise<IWatchdogConfig> {
  const user = await User.findOne({ googleId: userId });
  if (!user) {
    throw new Error('User not found');
  }

  const config = await getWatchdogConfig(userId);
  await processWatchdogForUser(user, config);
  return config;
}

export async function processWatchdogForUser(
  user: IUser,
  config: IWatchdogConfig
): Promise<void> {
  if (!config.enabled || config.rules.length === 0) return;

  const auth = await getAuthForUser(user);
  if (!auth) return;

  const stats = ensureStats(config);
  const userId = config.userId;

  const unreadEmails = await readEmails(auth, {
    query: 'is:unread in:inbox',
    maxResults: 15,
  });

  for (const email of unreadEmails) {
    if (!email.id || config.processedMessageIds.includes(email.id)) continue;

    stats.emailsRead += 1;

    const emailType = await classifyEmail(
      email.subject,
      email.bodyPreview,
      email.snippet
    );

    if (emailType === 'Other') {
      stats.emailsSkipped += 1;
      await logActivity(userId, {
        messageId: email.id,
        subject: email.subject,
        from: email.from,
        emailType: 'Other',
        action: 'skipped_other',
        status: 'skipped',
      });
      rememberProcessedId(config, email.id);
      continue;
    }

    const rule = findMatchingRule(config.rules, emailType);
    if (!rule) {
      await logActivity(userId, {
        messageId: email.id,
        subject: email.subject,
        from: email.from,
        emailType,
        action: 'no_rule',
        status: 'skipped',
      });
      continue;
    }

    try {
      await forwardInboundEmail(auth, email, emailType, rule.forwardToEmail);
      stats.emailsForwarded += 1;
      await logActivity(userId, {
        messageId: email.id,
        subject: email.subject,
        from: email.from,
        emailType,
        action: 'forwarded',
        forwardTo: rule.forwardToEmail,
        status: 'success',
      });
      await markAsRead(auth, email.id);
      rememberProcessedId(config, email.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Forward failed';
      await logActivity(userId, {
        messageId: email.id,
        subject: email.subject,
        from: email.from,
        emailType,
        action: 'forward_failed',
        forwardTo: rule.forwardToEmail,
        status: 'failed',
      });
      console.error(`Watchdog forward failed for ${userId}:`, message);
    }
  }

  await config.save();
}

export async function runAllWatchdogs(): Promise<void> {
  const configs = await WatchdogConfig.find({ enabled: true });
  if (configs.length === 0) return;

  for (const config of configs) {
    const user = await User.findOne({ googleId: config.userId });
    if (!user) continue;

    try {
      await processWatchdogForUser(user, config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Watchdog error for ${config.userId}:`, message);
    }
  }
}

export function startWatchdogPoller(): void {
  setInterval(() => {
    runAllWatchdogs().catch((err) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('Watchdog poller error:', message);
    });
  }, POLL_INTERVAL_MS);

  console.log(`Watchdog poller started (every ${POLL_INTERVAL_MS / 1000}s)`);
}
