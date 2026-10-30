/** Shapes shared by the session server (`serve.ts`) and the CLI (`cli.ts`). */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PLAYTEST_DIR = join(REPO_ROOT, 'playtest');
export const SESSION_FILE = join(PLAYTEST_DIR, 'session.json');
export const BUGS_DIR = join(PLAYTEST_DIR, 'bugs');

/** Written by `pt:serve`, read by every `pt` call. */
export interface SessionInfo {
  port: number;
  pid: number;
  /** `text`: the engine in-process, no browser (layer 1). */
  mode: 'text';
  /** Number of seats, 2..7. */
  seats: number;
  /** 1-based seats played by hand. */
  humans: number[];
  seed: string;
  level: string;
  startedAt: string;
}

export interface CommandRequest {
  /** 0-based seat; -1 for seat-less commands (stop, report). */
  seat: number;
  cmd: string;
  args: string[];
  flags: Record<string, string>;
}

export interface CommandResponse {
  out: string;
  /** For `probe`: true when the seat should stop waiting. */
  ready?: boolean;
}
