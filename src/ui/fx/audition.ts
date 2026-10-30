/**
 * F4: the sound audition panel. Open the game with `?sfx=1` and ui calls `mountAudition(host)`:
 * one button per recipe, plus volume and mute bound to the shared engine. For tuning by ear.
 */
import { sfx as shared, type SoundEngine } from '../../audio';

export const wantsAudition = (search: string): boolean =>
  new URLSearchParams(search).get('sfx') === '1';

/** Build the panel into `host` and unlock audio on the first click. Returns a remover. */
export function mountAudition(host: HTMLElement, engine: SoundEngine = shared): () => void {
  const box = document.createElement('section');
  box.className = 'fx-audition';
  box.setAttribute('aria-label', 'Sound audition');
  box.style.cssText =
    'position:fixed;right:8px;bottom:8px;z-index:1000;max-height:70vh;overflow:auto;padding:8px;' +
    'background:var(--surface-raised,#222);color:var(--ink,#fff);border:1px solid var(--line,#888);' +
    'border-radius:8px;display:grid;gap:4px;font-size:13px;';

  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '1';
  vol.step = '0.05';
  vol.value = String(engine.settings.volume);
  vol.setAttribute('aria-label', 'Volume');
  vol.addEventListener('input', () => engine.setVolume(Number(vol.value)));

  const mute = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = engine.settings.muted;
  cb.addEventListener('change', () => engine.setMuted(cb.checked));
  mute.append(cb, ' Mute');

  box.append(vol, mute);
  for (const [id, recipe] of engine.recipes()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${id}: ${recipe.label}`;
    b.addEventListener('click', () => {
      engine.unlock();
      engine.play(id);
    });
    box.append(b);
  }
  host.append(box);
  return () => box.remove();
}
