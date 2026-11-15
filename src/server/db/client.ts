import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './schema.ts';

export type AppDb = DrizzleD1Database<typeof schema>;
export { schema };

