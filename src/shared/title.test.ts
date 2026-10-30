import { expect, it } from 'vitest';
import { APP_TITLE } from './title';

it('names the game', () => {
  expect(APP_TITLE).toBe("Windamere's Wonders");
});
