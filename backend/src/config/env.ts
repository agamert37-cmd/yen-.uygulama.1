import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  WORKSPACES_ROOT: z.string().min(1).default('./workspaces'),
  DB_PATH: z.string().min(1).default('./data/panel.sqlite'),
  PANEL_DRIVER: z.enum(['mock', 'real']).default('mock'),
  PANEL_AUTH_TOKEN: z
    .string()
    .min(8, 'PANEL_AUTH_TOKEN must be at least 8 characters'),
  // Base domain running projects get published under (https://{subdomain}.PANEL_DOMAIN).
  // Unset disables publishing entirely - the vhost proxy becomes a no-op.
  PANEL_DOMAIN: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${details}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
