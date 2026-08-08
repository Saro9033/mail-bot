import type { Request, Response } from 'express';
import type { OAuth2Client } from 'google-auth-library';
import { getAuthenticatedClient } from '../config/google';
import { User, IUser } from '../models/User';

const UID_COOKIE = 'mail_chatbot_uid';
const ACCESS_TOKEN_COOKIE = 'mail_chatbot_token';

const UID_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ACCESS_TOKEN_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour (Google default)

export interface UserWithAuth {
  user: IUser;
  auth: OAuth2Client;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function getCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge,
  };
}

export function setAuthCookies(res: Response, googleId: string, accessToken: string): void {
  res.cookie(UID_COOKIE, googleId, {
    ...getCookieOptions(UID_MAX_AGE_MS),
    signed: true,
  });
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, getCookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
}

export function clearAuthCookies(res: Response): void {
  const base = { path: '/', httpOnly: true, sameSite: 'lax' as const };
  res.clearCookie(UID_COOKIE, base);
  res.clearCookie(ACCESS_TOKEN_COOKIE, base);
}

export function restoreSessionFromCookie(req: Request): void {
  if (req.session.userId) return;

  const signedUid = req.signedCookies?.[UID_COOKIE] as string | undefined;
  if (!signedUid || typeof signedUid !== 'string') return;

  req.session.userId = signedUid;
}

export async function resolveUserId(req: Request): Promise<string | null> {
  restoreSessionFromCookie(req);

  if (req.session.userId) {
    return req.session.userId;
  }

  const signedUid = req.signedCookies?.[UID_COOKIE] as string | undefined;
  return signedUid ?? null;
}

async function refreshAndPersistTokens(
  user: IUser,
  auth: OAuth2Client,
  res?: Response
): Promise<void> {
  const { token } = await auth.getAccessToken();

  if (!token) {
    throw new AuthError('Failed to obtain access token');
  }

  if (token !== user.accessToken) {
    user.accessToken = token;
    await user.save();
  }

  const credentials = auth.credentials;
  if (credentials.refresh_token && credentials.refresh_token !== user.refreshToken) {
    user.refreshToken = credentials.refresh_token;
    await user.save();
  }

  if (res) {
    setAuthCookies(res, user.googleId, token);
  }
}

export async function getUserWithAuth(
  req: Request,
  res?: Response
): Promise<UserWithAuth | null> {
  const userId = await resolveUserId(req);
  if (!userId) return null;

  const user = await User.findOne({ googleId: userId });
  if (!user) return null;

  if (!req.session.email) {
    req.session.email = user.email;
  }

  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
  const accessToken =
    cookieToken && cookieToken === user.accessToken ? cookieToken : user.accessToken;

  const auth = getAuthenticatedClient({
    accessToken,
    refreshToken: user.refreshToken,
  });

  try {
    await refreshAndPersistTokens(user, auth, res);
  } catch {
    return null;
  }

  return { user, auth };
}

export async function requireUserWithAuth(
  req: Request,
  res: Response
): Promise<UserWithAuth | null> {
  const sessionData = await getUserWithAuth(req, res);

  if (!sessionData) {
    res.status(401).json({ error: 'Not authenticated. Please sign in with Google.' });
    return null;
  }

  return sessionData;
}
