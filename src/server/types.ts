import type { D1Database } from '@cloudflare/workers-types';
import type { AppDb } from './db/client.ts';
import type { Role } from '../shared/schema/index.ts';

export interface EnvBindings {
  DB?: D1Database;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_GOOGLE_DOMAIN?: string;
  INITIAL_ADMIN_EMAILS?: string;
  SESSION_SECRET?: string;
  ALLOW_UNREGISTERED_DOMAIN_USERS?: string;
  ENABLE_DEV_LOGIN?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  enrollmentYear: number;
}

export interface AppVariables {
  db: AppDb;
  user: AuthUser | null;
  'user-google'?: {
    id?: string;
    email?: string;
    verified_email?: boolean;
    name?: string;
    hd?: string;
    picture?: string;
  };
}

export interface AppEnv {
  Bindings: EnvBindings;
  Variables: AppVariables;
}

