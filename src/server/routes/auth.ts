import { Hono } from 'hono';
import { googleAuth } from '@hono/oauth-providers/google';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppEnv } from '../types.ts';
import { users } from '../db/schema.ts';
import {
  clearSessionCookie,
  getRuntimeConfig,
  isAllowedDomainEmail,
  issueSessionCookie,
} from '../lib/session.ts';
import { calculateGrade, getAcademicYear } from '../../shared/grade.ts';

const DevLoginSchema = z.object({
  userId: z.string().min(1),
});

export const authRoutes = new Hono<AppEnv>()
  .get('/me', async (c) => {
    const config = getRuntimeConfig(c);
    const user = c.get('user');
    return c.json({
      user: user
        ? {
            ...user,
            grade: calculateGrade(user.enrollmentYear),
          }
        : null,
      devLoginEnabled: config.enableDevLogin,
      googleOAuthConfigured: Boolean(config.googleClientId && config.googleClientSecret),
      allowedDomains: config.allowedDomains,
    });
  })
  .post('/logout', (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  })
  .get('/dev-users', async (c) => {
    const config = getRuntimeConfig(c);
    if (!config.enableDevLogin) {
      return c.json({ enabled: false, users: [] });
    }
    const db = c.get('db');
    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        enrollmentYear: users.enrollmentYear,
      })
      .from(users)
      .orderBy(asc(users.role), asc(users.enrollmentYear), asc(users.name));

    return c.json({
      enabled: true,
      users: allUsers.map((u) => ({
        ...u,
        grade: calculateGrade(u.enrollmentYear),
      })),
    });
  })
  .post('/dev-login', zValidator('json', DevLoginSchema), async (c) => {
    const config = getRuntimeConfig(c);
    if (!config.enableDevLogin) {
      return c.json({ error: '開発用ダミーログインは無効化されています。' }, 403);
    }

    const { userId } = c.req.valid('json');
    const db = c.get('db');
    const [found] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        enrollmentYear: users.enrollmentYear,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!found) {
      return c.json({ error: 'ユーザーが見つかりません。' }, 404);
    }

    await issueSessionCookie(c, found.id);
    return c.json({
      user: {
        ...found,
        grade: calculateGrade(found.enrollmentYear),
      },
    });
  })
  .get('/google', async (c, next) => {
    const config = getRuntimeConfig(c);
    if (!config.googleClientId || !config.googleClientSecret) {
      return c.redirect('/login?error=oauth_not_configured');
    }
    const origin = new URL(c.req.url).origin;
    const middleware = googleAuth({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
    });
    return middleware(c, next);
  })
  .get('/google/callback', async (c) => {
    const config = getRuntimeConfig(c);
    if (!config.googleClientId || !config.googleClientSecret) {
      return c.redirect('/login?error=oauth_not_configured');
    }
    const origin = new URL(c.req.url).origin;
    const middleware = googleAuth({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      scope: ['openid', 'email', 'profile'],
    });

    const maybeRedirect = await middleware(c, async () => {});
    if (maybeRedirect) {
      return maybeRedirect;
    }

    const googleUser = c.get('user-google');
    if (!googleUser?.email || googleUser.verified_email === false) {
      return c.redirect('/login?error=unverified_email');
    }

    const emailLower = googleUser.email.trim().toLowerCase();
    if (!isAllowedDomainEmail(emailLower, config)) {
      return c.redirect('/login?error=invalid_domain');
    }

    const db = c.get('db');
    const now = Date.now();
    const isInitialAdmin = config.initialAdminEmails.includes(emailLower);

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, emailLower))
      .limit(1);

    let targetUserId: string;

    if (existing) {
      targetUserId = existing.id;
      await db
        .update(users)
        .set({
          googleSub: googleUser.id ?? existing.googleSub,
          role: isInitialAdmin ? 'ADMIN' : existing.role,
          name: existing.name || googleUser.name || emailLower.split('@')[0],
          updatedAt: now,
        })
        .where(eq(users.id, existing.id));
    } else {
      if (!isInitialAdmin && !config.allowUnregisteredDomainUsers) {
        return c.redirect('/login?error=unregistered_member');
      }
      targetUserId = crypto.randomUUID();
      await db.insert(users).values({
        id: targetUserId,
        email: emailLower,
        googleSub: googleUser.id ?? null,
        name: googleUser.name?.trim() || emailLower.split('@')[0],
        role: isInitialAdmin ? 'ADMIN' : 'VOTER',
        enrollmentYear: getAcademicYear(),
        createdAt: now,
        updatedAt: now,
      });
    }

    await issueSessionCookie(c, targetUserId);
    return c.redirect('/');
  });
