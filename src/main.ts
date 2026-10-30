import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import { APP_TITLE } from './shared/title';

const root = document.getElementById('app');
if (root) {
  root.style.cssText =
    'display:grid;place-items:center;min-height:100vh;margin:0;background:#1d2a2a;color:#f3e9d2;' +
    "font-family:'Fraunces Variable',serif;font-size:3rem;";
  root.textContent = APP_TITLE;
}
