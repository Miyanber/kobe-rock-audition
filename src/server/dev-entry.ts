import { createApp } from './app.ts';
import { getLocalDb } from './db/local.ts';

const { app } = createApp(async () => {
  return getLocalDb();
});

export default app;

