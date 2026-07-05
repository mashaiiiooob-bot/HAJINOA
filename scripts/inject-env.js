#!/usr/bin/env node
// Runs as Vercel's "Build Command". This project has no bundler, so instead
// of a real build step we just substitute placeholder tokens in index.html
// with real values pulled from Vercel Project Settings -> Environment Variables.
import { readFileSync, writeFileSync } from 'node:fs';

const indexPath = new URL('../index.html', import.meta.url);
let html = readFileSync(indexPath, 'utf8');

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
for (const key of required) {
  const value = process.env[key];
  if (!value) {
    console.error(`[inject-env] Missing required env var: ${key}`);
    console.error('[inject-env] Set it in Vercel -> Project Settings -> Environment Variables.');
    process.exit(1);
  }
  html = html.split(`__${key}__`).join(value);
}

writeFileSync(indexPath, html);
console.log('[inject-env] index.html updated with runtime config.');
