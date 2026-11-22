import { Router, Request, Response } from 'express';
import { requireUserWithAuth } from '../services/auth';
import {
  getWatchdogConfig,
  updateWatchdogConfig,
  sanitizeRules,
  isValidForwardEmail,
  getWatchdogActivity,
  scanWatchdogForUser,
} from '../services/watchdog';
import { WATCHDOG_TYPES, isWatchdogType } from '../config/watchdog';
import type { IWatchdogRule } from '../models/WatchdogConfig';

const router = Router();

function formatConfigResponse(config: Awaited<ReturnType<typeof getWatchdogConfig>>) {
  return {
    enabled: config.enabled,
    rules: config.rules,
    types: WATCHDOG_TYPES,
    stats: config.stats ?? { emailsRead: 0, emailsForwarded: 0, emailsSkipped: 0 },
  };
}

router.get('/', async (req: Request, res: Response) => {
  const sessionData = await requireUserWithAuth(req, res);
  if (!sessionData) return;

  const userId = sessionData.user.googleId;
  const config = await getWatchdogConfig(userId);
  const activity = await getWatchdogActivity(userId);

  res.json({
    ...formatConfigResponse(config),
    activity,
  });
});

router.put('/', async (req: Request, res: Response) => {
  const sessionData = await requireUserWithAuth(req, res);
  if (!sessionData) return;

  const { enabled, rules } = req.body as {
    enabled?: boolean;
    rules?: IWatchdogRule[];
  };

  if (rules !== undefined) {
    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: 'rules must be an array.' });
    }

    for (const rule of rules) {
      if (!rule.type || typeof rule.type !== 'string' || !isWatchdogType(rule.type)) {
        return res.status(400).json({
          error: `Invalid type. Use one of: ${WATCHDOG_TYPES.join(', ')}`,
        });
      }
      if (!rule.forwardToEmail || !isValidForwardEmail(rule.forwardToEmail)) {
        return res.status(400).json({
          error: `Invalid forward email for type "${rule.type}".`,
        });
      }
    }
  }

  const config = await updateWatchdogConfig(sessionData.user.googleId, {
    enabled,
    rules: rules ? sanitizeRules(rules) : undefined,
  });

  res.json(formatConfigResponse(config));
});

router.post('/scan', async (req: Request, res: Response) => {
  const sessionData = await requireUserWithAuth(req, res);
  if (!sessionData) return;

  const userId = sessionData.user.googleId;

  try {
    const config = await scanWatchdogForUser(userId);
    const activity = await getWatchdogActivity(userId);

    res.json({
      ...formatConfigResponse(config),
      activity,
      scanned: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scan failed';
    res.status(500).json({ error: message });
  }
});

export default router;
