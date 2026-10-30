/**
 * Loads the text game under tsx (plain node). `src/` is written for Vite, where
 * `import.meta.env.BASE_URL` exists; under node it is undefined and the Windamere presenter throws
 * when it is built. This hook swaps the expression for a constant in any file that uses it. It
 * must be installed before the game code is imported, hence the dynamic import. Drop it once ui
 * guards the access (Needs in the status file).
 */
import { registerHooks } from 'node:module';
import type * as GameModule from './game';

export async function loadGame(): Promise<typeof GameModule> {
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (result.source == null || !url.startsWith('file:') || url.includes('/node_modules/')) {
        return result;
      }
      const text = result.source.toString();
      if (!text.includes('import.meta.env')) return result;
      const env = '({ BASE_URL: "/", DEV: false, PROD: true })';
      return { ...result, source: text.replaceAll('import.meta.env', env) };
    },
  });
  return import('./game');
}
