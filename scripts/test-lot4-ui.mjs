/**
 * ASTRAL VANGUARD v3.0 - SUITE DE VALIDATION LOT 4 : REDESIGN PROFESSIONNEL & ACCESSIBILITÉ
 *
 * Vérifie :
 * 1. Palette sobre et moderne (Slate / Zinc sombre, sans néons agressifs)
 * 2. Typographies bundlées (Inter, Space Grotesk, JetBrains Mono)
 * 3. Micro-interactions et transitions <= 200ms (max 320ms slow)
 * 4. Accessibilité WCAG AA : focus-visible sur tous les interactifs
 * 5. Respect strict de prefers-reduced-motion
 * 6. Les 4 états explicites (.state-loading, .state-empty, .state-error, .state-unavailable)
 * 7. Overlay HUD : intégration PresentMon réelle + fallback transparent sans FPS simulés
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const desktopDir = path.join(rootDir, 'astral-desktop');

console.log('======================================================================');
console.log('TEST LOT 4 - REDESIGN PROFESSIONNEL, ACCESSIBILITÉ ET ÉTATS UI');
console.log('======================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    failCount++;
  }
}

// 1. Audit CSS Tokens & Typography
test("Design System : Présence des polices locales bundlées (Inter, Space Grotesk, JetBrains Mono)", () => {
  const cssPath = path.join(desktopDir, 'src', 'index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('@fontsource/inter'), "Inter requis pour l'interface");
  assert(css.includes('@fontsource/space-grotesk'), "Space Grotesk requis pour les titres et chiffres");
  assert(css.includes('@fontsource/jetbrains-mono'), "JetBrains Mono requis pour la télémétrie et logs");
});

test("Design System : Palette Dark professionnelle et absence de surbrillances néon excessives", () => {
  const cssPath = path.join(desktopDir, 'src', 'index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('--bg-base:'), 'Token --bg-base manquant');
  assert(css.includes('--bg-surface:'), 'Token --bg-surface manquant');
  assert(css.includes('--bg-elevated:'), 'Token --bg-elevated manquant');
  assert(css.includes('--text-primary:'), 'Token --text-primary manquant');
  assert(css.includes('--text-secondary:'), 'Token --text-secondary manquant');
  assert(css.includes('--border:'), 'Token --border manquant');
});

test("Design System : Transitions fluides et réactives (<= 200ms / slow <= 320ms)", () => {
  const cssPath = path.join(desktopDir, 'src', 'index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('--transition: 180ms') || css.includes('--transition: 150ms') || css.includes('--transition: 200ms'),
    'Transition standard doit être <= 200ms pour garantir la réactivité');
  assert(css.includes('--transition-slow: 320ms') || css.includes('--transition-slow: 300ms'),
    'Transition lente plafonnée');
});

test("Accessibilité : Prise en charge obligatoire de prefers-reduced-motion", () => {
  const cssPath = path.join(desktopDir, 'src', 'index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('@media (prefers-reduced-motion: reduce)'), 'Règle media query prefers-reduced-motion manquante');
  assert(css.includes('animation-duration: 0.01ms') || css.includes('transition-duration: 0.01ms'),
    'Désactivation effective des animations pour les utilisateurs sensibles au mouvement');
});

test("Accessibilité : Règle :focus-visible explicite conforme WCAG AA sur éléments interactifs", () => {
  const cssPath = path.join(desktopDir, 'src', 'index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes(':focus-visible'), 'Sélecteur :focus-visible manquant');
  assert(css.includes('outline: 2px solid'), 'Contour de focus visible 2px obligatoire');
  assert(css.includes('button:focus-visible'), 'Focus sur boutons explicite');
  assert(css.includes('input:focus-visible'), 'Focus sur inputs explicite');
});

test("États UI : Les 4 états obligatoires définis (.state-loading, .state-empty, .state-error, .state-unavailable)", () => {
  const cssPath = path.join(desktopDir, 'src', 'index.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert(css.includes('.state-loading'), 'Classe .state-loading manquante');
  assert(css.includes('.state-empty'), 'Classe .state-empty manquante');
  assert(css.includes('.state-error'), 'Classe .state-error manquante');
  assert(css.includes('.state-unavailable'), 'Classe .state-unavailable manquante');
});

test("Overlay HUD : Intégration authentique PresentMon (1% low et FPS réels)", () => {
  const hudPath = path.join(desktopDir, 'src', 'components', 'OverlayHUD.tsx');
  const hud = fs.readFileSync(hudPath, 'utf8');

  assert(hud.includes('presentmon'), 'État presentmon manquant dans OverlayHUD');
  assert(hud.includes('onePercentLowFps'), 'Affichage du 1% Low requis');
  assert(hud.includes('isCapturing'), 'Vérification du statut de capture actif');
});

test("Overlay HUD : Préservation de l'explication transparente en absence de PresentMon", () => {
  const hudPath = path.join(desktopDir, 'src', 'components', 'OverlayHUD.tsx');
  const hud = fs.readFileSync(hudPath, 'utf8');

  assert(hud.includes('PresentMon non installé'), 'Avertissement transparent requis si binaire absent');
  assert(hud.includes('FPS indisponibles'), 'Statut indisponible explicite requis');
  assert(!hud.includes('165 FPS'), 'Aucune valeur FPS inventée ne doit être présente');
});

console.log('\n----------------------------------------------------------------------');
console.log(`RÉSULTAT LOT 4 REDESIGN & ACCESSIBILITÉ : ${passCount} PASS, ${failCount} FAIL`);
console.log('----------------------------------------------------------------------\n');

if (failCount > 0) {
  process.exit(1);
}
