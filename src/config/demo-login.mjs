/**
 * The demo login's env gate. Server code only — it imports `astro:env/server`,
 * so neither `astro.config.mjs` nor the `node --test` suites can import it;
 * the pure logic lives in `src/lib/demo-login.mjs` for exactly that reason
 * (the split `src/config/auth.mjs` documents).
 */
import { DOCS_UNSAFE_DEMO_LOGIN } from 'astro:env/server';
import { authConfigured } from './auth.mjs';
import { isDemoFlagEnabled } from '../lib/demo-login.mjs';

/**
 * Is the demo login live? Two conditions, both required, checked
 * independently:
 *
 * - The flag, in one of its two documented spellings. Unset — every fork,
 *   every ordinary deployment — means `/demo-login` answers the same bare 404
 *   as everything else the auth surface refuses.
 * - `authConfigured()`, because the token this route signs is verified by
 *   `/auth/callback` with `DOCS_SSO_SECRET`. A picker that hands out tokens
 *   nothing can verify would be a dead end wearing a working UI.
 */
export function demoLoginConfigured() {
	return isDemoFlagEnabled(DOCS_UNSAFE_DEMO_LOGIN) && authConfigured();
}
