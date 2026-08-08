import { Router, Request, Response } from 'express';
import { verifyGmailAccess } from '../services/gmail';
import { runAgent, runConfirmationAgent, analyzeUserIntent } from '../services/agent';
import { createGmailTools } from '../tools/gmailTools';
import { getMessages, saveMessage } from '../services/messages';
import { requireUserWithAuth } from '../services/auth';
import {
  getPendingAction,
  executePendingAction,
} from '../services/pendingAction';

const router = Router();

const MAX_MESSAGE_LENGTH = 1000;

router.get('/history', async (req: Request, res: Response) => {
  const sessionData = await requireUserWithAuth(req, res);
  if (!sessionData) return;

  const messages = await getMessages(sessionData.user.googleId);

  res.json({
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  });
});

router.post('/chat', async (req: Request, res: Response) => {
  const sessionData = await requireUserWithAuth(req, res);
  if (!sessionData) return;

  const { user, auth } = sessionData;
  const { message } = req.body as { message?: string };

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message must be a non-empty string.' });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Message too long. Maximum ${MAX_MESSAGE_LENGTH} characters.`,
    });
  }

  const trimmedMessage = message.trim();
  const userId = user.googleId;

  const historyMessages = await getMessages(userId);
  await saveMessage(userId, 'user', trimmedMessage);

  try {
    await verifyGmailAccess(auth);
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Gmail access verification failed:', errMessage);
    return res.status(401).json({
      error:
        'Gmail access expired or revoked. Please sign out and sign in again with Google.',
    });
  }

  try {
    const tools = createGmailTools(auth, userId);
    const intent = await analyzeUserIntent(trimmedMessage, historyMessages);

    // LLM detected confirmation — execute stored pending action directly (no loop)
    if (intent.isConfirmingAction) {
      const pending = await getPendingAction(userId);

      if (pending) {
        const reply = await executePendingAction(auth, pending);
        await saveMessage(userId, 'assistant', reply);
        return res.json({ reply });
      }

      // No stored pending (e.g. chat-only draft) — let agent execute once
      const reply = await runConfirmationAgent(trimmedMessage, tools, historyMessages);
      await saveMessage(userId, 'assistant', reply);
      return res.json({ reply });
    }

    const reply = await runAgent(trimmedMessage, tools, historyMessages, intent);
    await saveMessage(userId, 'assistant', reply);
    res.json({ reply });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat error:', errMessage);
    res.status(500).json({
      error: 'Failed to process your request. Please try again.',
    });
  }
});

export default router;
