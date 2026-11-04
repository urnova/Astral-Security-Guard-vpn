import assert from 'assert';

/**
 * Normalise la version de pilote Windows WDDM en version commerciale constructeur.
 *
 * Pour NVIDIA :
 * Sous Windows, le pilote WDDM se termine par un groupe de chiffres dont les 5 derniers
 * correspondent à la version commerciale NVIDIA majeure.mineure (ex: 32.0.16.1742 -> 617.42, 31.0.15.6174 -> 561.74).
 */
export function parseGpuDriverVersion(rawVersion, gpuName = '') {
  if (!rawVersion || typeof rawVersion !== 'string') return { display: 'Inconnue', raw: '' };
  const raw = rawVersion.trim();
  const nameLower = gpuName.toLowerCase();

  if (nameLower.includes('nvidia') || nameLower.includes('geforce') || nameLower.includes('quadro') || nameLower.includes('rtx') || nameLower.includes('gtx')) {
    // Les 5 derniers chiffres composent la version NVIDIA (3 chiffres majeurs + 2 chiffres mineurs)
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length >= 5) {
      const last5 = digitsOnly.slice(-5);
      const major = parseInt(last5.slice(0, 3), 10);
      const minor = last5.slice(3);
      if (major >= 100 && major <= 999) {
        return { display: `${major}.${minor}`, raw };
      }
    }
  }

  // Fallback propre : version brute sans falsification
  return { display: raw, raw };
}

// ── Tests de non-régression avec cas réels vérifiés ──────────────────────────
console.log('--- Test de conversion des versions de pilotes GPU ---');

// Cas 1 : Pilote hôte actuel (NVIDIA-SMI 617.42 sur Windows 11)
const t1 = parseGpuDriverVersion('32.0.16.1742', 'NVIDIA GeForce RTX 3060 Ti');
assert.strictEqual(t1.display, '617.42', 'Cas 1: 32.0.16.1742 doit être converti en 617.42');
console.log('✔ Cas 1 validé : 32.0.16.1742 ->', t1.display);

// Cas 2 : Pilote antérieur stable NVIDIA (561.74)
const t2 = parseGpuDriverVersion('31.0.15.6174', 'NVIDIA GeForce RTX 4070');
assert.strictEqual(t2.display, '561.74', 'Cas 2: 31.0.15.6174 doit être converti en 561.74');
console.log('✔ Cas 2 validé : 31.0.15.6174 ->', t2.display);

// Cas 3 : Pilote historique NVIDIA (472.12)
const t3 = parseGpuDriverVersion('30.0.14.7212', 'NVIDIA GeForce GTX 1080');
assert.strictEqual(t3.display, '472.12', 'Cas 3: 30.0.14.7212 doit être converti en 472.12');
console.log('✔ Cas 3 validé : 30.0.14.7212 ->', t3.display);

// Cas 4 : Pilote Intel Graphics (doit conserver sa version réelle sans déformation)
const t4 = parseGpuDriverVersion('31.0.101.5333', 'Intel(R) UHD Graphics 770');
assert.strictEqual(t4.display, '31.0.101.5333', 'Cas 4: Intel doit préserver sa version brute');
console.log('✔ Cas 4 validé (Intel) : 31.0.101.5333 ->', t4.display);

// Cas 5 : Pilote AMD Adrenalin (doit conserver sa version réelle sans déformation)
const t5 = parseGpuDriverVersion('23.12.1', 'AMD Radeon RX 7900 XTX');
assert.strictEqual(t5.display, '23.12.1', 'Cas 5: AMD doit préserver sa version brute');
console.log('✔ Cas 5 validé (AMD) : 23.12.1 ->', t5.display);

console.log('✅ Tous les tests de conversion de pilotes sont passés avec succès.');
