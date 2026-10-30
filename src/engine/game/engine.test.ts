import { describe, expect, it } from 'vitest';
import { createWindamereEngine, WINDAMERE_NOT_READY } from '../index';

describe('createWindamereEngine (stub until E2)', () => {
  it('is exported from the engine barrel and says it is not ready', () => {
    expect(() => createWindamereEngine()).toThrow(WINDAMERE_NOT_READY);
  });
});
