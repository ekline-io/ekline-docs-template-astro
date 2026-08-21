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
 * Is the demo login live? Two conditions, both required:
 *
 * - The flag, in one of its two documented spellings. Unset — every fork,
 *   every ordinary deployment — means `/demo-login` answers the same bare 404
 *   as everything else the auth surface refuses.
 * - `authConfigured()`, because the token this route signs is verified by
 *   `/auth/callback` with `DOCS_SSO_SECRET`. A picker that hands out tokens
 *   nothing can verify would be a dead end wearing a working UI.
 *
 * **This read cannot throw, and that is a property to preserve.**
 * `src/config/auth.mjs` explains at length why a throw on the request path is
 * a worse failure than a `false` — a 500 with a stack trace instead of the
 * documented fail-closed 404. An unconstrained optional string is the one env
 * shape whose validation cannot fail: Astro maps `''` to `undefined`, so the
 * value is always `string | undefined` and every one of those fails
 * `isDemoFlagEnabled`. Constraining the field later — `boolean`, `min`,
 * `enum` — would trade that for a throw on exactly the malformed input this
 * currently refuses quietly.
 *
 * The variable is read inside the function rather than snapshotted at module
 * load, which is the opposite of what `parseSsoUrl` does next door and is
 * deliberate: Astro reassigns these `export let` bindings when the adapter
 * calls `setGetEnv`, so a module-load `const` could freeze a pre-`setGetEnv`
 * value.
 */
export function demoLoginConfigured() {
	return isDemoFlagEnabled(DOCS_UNSAFE_DEMO_LOGIN) && authConfigured();
}
