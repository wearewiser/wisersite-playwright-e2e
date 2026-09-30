import { z } from 'zod';
import 'dotenv/config';

/**
 * Env config for the wisersite-and-payload-plugin suite (playwright.wisersite.config.ts) —
 * kept separate from src/config/env.ts (the bundled Employee Directory demo) so pointing
 * one suite at a different app/DB never touches the other's config or defaults.
 *
 * TENANT_SQL_* names match what wisersite-and-payload-plugin's own dev/.env.example uses
 * for its tenant Postgres analytics warehouse — the intent is to literally point both
 * projects at the same local Cloud SQL Auth Proxy / override, not to keep parallel copies.
 */
const envSchema = z.object({
  // Deliberately its own variable, not a reuse of the bundled demo's BASE_URL — the app
  // behaves differently under 127.0.0.1 vs localhost (its login redirect resolves to '/'
  // instead of '/login' when the Host header is 127.0.0.1), so the two suites must never
  // be able to silently inherit each other's host.
  WISERSITE_BASE_URL: z.string().url().default('http://localhost:3000'),
  TENANT_SQL_HOST: z.string(),
  TENANT_SQL_PORT: z.coerce.number().int().positive().default(5432),
  TENANT_SQL_USER: z.string(),
  TENANT_SQL_PASSWORD: z.string(),
  TENANT_SQL_NAME: z.string(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(1),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid wisersite environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const wisersiteEnv = loadEnv();
