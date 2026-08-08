import { Router, Request, Response } from 'express';
import { createOAuth2Client, getAuthUrl, google } from '../config/google';
import { User } from '../models/User';
import {
  getUserWithAuth,
  setAuthCookies,
  clearAuthCookies,
  restoreSessionFromCookie,
} from '../services/auth';

const router = Router();

router.get('/google', (_req: Request, res: Response) => {
  try {
    const url = getAuthUrl();
    res.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Auth URL error:', message);
    res.status(500).json({ error: 'Failed to initiate Google sign-in.' });
  }
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, error } = req.query;

  if (error) {
    const errorStr = typeof error === 'string' ? error : 'auth_error';
    return res.redirect('/?auth_error=' + encodeURIComponent(errorStr));
  }

  if (!code || typeof code !== 'string') {
    return res.redirect('/?auth_error=missing_code');
  }

  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    if (!profile.email) {
      return res.redirect('/?auth_error=no_email');
    }

    if (!tokens.access_token) {
      return res.redirect('/?auth_error=missing_access_token');
    }

    const googleId = profile.id ?? profile.email;

    await User.findOneAndUpdate(
      { googleId },
      {
        googleId,
        email: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    req.session.userId = googleId;
    req.session.email = profile.email;
    setAuthCookies(res, googleId, tokens.access_token);

    res.redirect('/');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('OAuth callback error:', message);
    res.redirect('/?auth_error=' + encodeURIComponent(message));
  }
});

router.get('/status', async (req: Request, res: Response) => {
  restoreSessionFromCookie(req);

  const sessionData = await getUserWithAuth(req, res);

  if (sessionData) {
    return res.json({
      authenticated: true,
      email: sessionData.user.email,
    });
  }

  res.json({ authenticated: false, email: null });
});

router.post('/logout', (req: Request, res: Response) => {
  clearAuthCookies(res);

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to log out.' });
    }
    res.json({ success: true });
  });
});

export default router;
