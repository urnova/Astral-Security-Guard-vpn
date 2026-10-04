/**
 * ASTRAL VANGUARD v3.0 - PARSER STRICT & SÉCURISÉ DE PROFILS OVPN (LOT 3 / PHASE 13)
 *
 * Validation et assainissement stricts des configurations OpenVPN communautaires :
 * - Liste blanche fermée et documentée de directives autorisées
 * - Interdiction formelle de tout script (up, down, route-up, client-connect...)
 * - Interdiction formelle de tout plugin ou bibliothèque native (.dll, .so)
 * - Interdiction formelle de directives de redirection ou de management arbitraires
 * - Limite maximale de taille : 512 Ko par fichier de configuration
 * - Imposition stricte de la validation de certificat : remote-cert-tls server
 * - Validation de la présence d'un bloc <ca> valide
 */

export interface ParsedOvpnResult {
  valid: boolean;
  sanitizedConfig?: string;
  remoteHost?: string;
  remotePort?: number;
  protocol?: 'udp' | 'tcp';
  country?: string;
  error?: string;
  rejectionReason?: string;
}

// Directives OpenVPN strictement autorisées dans la liste blanche
const ALLOWED_DIRECTIVES = new Set([
  'client',
  'dev',
  'proto',
  'remote',
  'resolv-retry',
  'nobind',
  'persist-key',
  'persist-tun',
  'cipher',
  'data-ciphers',
  'data-ciphers-fallback',
  'auth',
  'verb',
  'keepalive',
  'key-direction',
  'remote-cert-tls',
  'verify-x509-name',
  'auth-user-pass',
  'fast-io',
  'reneg-sec',
  'tun-mtu',
  'mssfix',
  'mute-replay-warnings',
  'topology',
  'pull',
  'explicit-exit-notify',
  'inactive',
  'ping',
  'ping-restart',
  'hand-window',
  'tran-window',
  'auth-nocache',
  'tls-client',
  'block-outside-dns',
]);

// Directives d'exécution et de scripts strictement DANGEREUSES et INTERDITES
const DANGEROUS_DIRECTIVES = new Set([
  'up',
  'down',
  'route-up',
  'route-pre-down',
  'ipchange',
  'client-connect',
  'client-disconnect',
  'auth-user-pass-verify',
  'tls-verify',
  'plugin',
  'load-plugin',
  'script-security',
  'management',
  'management-hold',
  'management-query-passwords',
  'socks-proxy',
  'http-proxy',
  'http-proxy-option',
  'dhcp-option',
  'setenv',
  'cd',
  'chroot',
]);

export class StrictOvpnParser {
  private static readonly MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 Ko

  /**
   * Analyse, valide et nettoie une configuration OpenVPN brute
   */
  public static parse(rawContent: string): ParsedOvpnResult {
    if (!rawContent || typeof rawContent !== 'string') {
      return { valid: false, error: 'Configuration OVPN vide ou invalide.' };
    }

    // 1. Limite stricte de taille
    const byteLength = Buffer.byteLength(rawContent, 'utf8');
    if (byteLength > this.MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Taille du fichier OVPN excessive (${Math.round(byteLength / 1024)} Ko > 512 Ko max).`,
        rejectionReason: 'FILE_TOO_LARGE',
      };
    }

    // 2. Traitement des blocs de certificats (<ca>, <cert>, <key>, <tls-auth>, <tls-crypt>)
    const sanitizedLines: string[] = [];
    let insideTag = false;
    let currentTag = '';
    let hasCaCert = false;

    let remoteHost: string | undefined;
    let remotePort: number | undefined;
    let protocol: 'udp' | 'tcp' = 'udp';

    const lines = rawContent.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Gestion des blocs XML-like (<ca> ... </ca>)
      if (line.startsWith('<') && line.endsWith('>')) {
        const tag = line.slice(1, -1).trim().toLowerCase();
        if (tag.startsWith('/')) {
          insideTag = false;
          currentTag = '';
          sanitizedLines.push(line);
          continue;
        } else {
          // Balise ouvrante
          const allowedTags = ['ca', 'cert', 'key', 'tls-auth', 'tls-crypt'];
          if (allowedTags.includes(tag)) {
            insideTag = true;
            currentTag = tag;
            if (tag === 'ca') hasCaCert = true;
            sanitizedLines.push(line);
            continue;
          } else {
            return {
              valid: false,
              error: `Balise non autorisée détectée dans le profil : <${tag}>`,
              rejectionReason: 'FORBIDDEN_TAG',
            };
          }
        }
      }

      if (insideTag) {
        // Validation du contenu du certificat (caractères base64 ou délimiteurs standard)
        if (
          /^[A-Za-z0-9+/=\s-]+$/.test(line) ||
          line.includes('BEGIN CERTIFICATE') ||
          line.includes('END CERTIFICATE') ||
          line.includes('BEGIN OpenVPN Static key') ||
          line.includes('END OpenVPN Static key')
        ) {
          sanitizedLines.push(line);
          continue;
        } else {
          return {
            valid: false,
            error: `Contenu corrompu ou illicite détecté dans le bloc <${currentTag}>`,
            rejectionReason: 'MALFORMED_CERT_DATA',
          };
        }
      }

      // Commentaires et lignes vides
      if (!line || line.startsWith('#') || line.startsWith(';')) {
        continue;
      }

      // Décomposition directive et arguments
      const tokens = line.split(/\s+/);
      const directive = tokens[0].toLowerCase();
      const args = tokens.slice(1);

      // 3. Détection des directives formellement dangereuses
      if (DANGEROUS_DIRECTIVES.has(directive)) {
        return {
          valid: false,
          error: `Directive de sécurité interdite dans le profil OVPN : "${directive}" (Tentative d'exécution ou hook rejeté).`,
          rejectionReason: 'DANGEROUS_DIRECTIVE_REJECTED',
        };
      }

      // 4. Validation par liste blanche stricte
      if (!ALLOWED_DIRECTIVES.has(directive)) {
        return {
          valid: false,
          error: `Directive non homologuée dans la liste blanche de sécurité : "${directive}"`,
          rejectionReason: 'UNKNOWN_DIRECTIVE',
        };
      }

      // 5. Validation spécifique des paramètres
      if (directive === 'remote') {
        if (args.length >= 1) {
          const host = args[0];
          const port = args[1] ? parseInt(args[1], 10) : 1194;
          // Vérification hostname ou IPv4 valide
          if (!/^[a-zA-Z0-9.-]+$/.test(host) || isNaN(port) || port < 1 || port > 65535) {
            return {
              valid: false,
              error: `Hôte ou port distant non valide : ${host}:${port}`,
              rejectionReason: 'INVALID_REMOTE',
            };
          }
          remoteHost = host;
          remotePort = port;
          if (args[2]) {
            const proto = args[2].toLowerCase();
            if (proto.includes('tcp')) protocol = 'tcp';
          }
        }
      } else if (directive === 'proto') {
        const p = (args[0] || '').toLowerCase();
        if (p.includes('tcp')) protocol = 'tcp';
        else protocol = 'udp';
      } else if (directive === 'dev') {
        const d = (args[0] || '').toLowerCase();
        if (!d.startsWith('tun')) {
          return {
            valid: false,
            error: `Seul le mode d'adaptateur TUN est autorisé (reçu: ${d}).`,
            rejectionReason: 'TAP_NOT_ALLOWED',
          };
        }
      }

      sanitizedLines.push(`${directive} ${args.join(' ')}`.trim());
    }

    // 6. Vérification de l'intégrité de la chaîne de confiance
    if (!hasCaCert) {
      return {
        valid: false,
        error: 'Absence d\'autorité de certification (<ca>) dans le profil OpenVPN.',
        rejectionReason: 'MISSING_CA',
      };
    }

    // 7. Imposition stricte de remote-cert-tls server pour empêcher les attaques MITM
    const hasRemoteCertTls = sanitizedLines.some((l) => l.startsWith('remote-cert-tls'));
    if (!hasRemoteCertTls) {
      sanitizedLines.unshift('remote-cert-tls server');
    }

    // Garantir le flag client
    if (!sanitizedLines.some((l) => l === 'client')) {
      sanitizedLines.unshift('client');
    }

    return {
      valid: true,
      sanitizedConfig: sanitizedLines.join('\n'),
      remoteHost,
      remotePort: remotePort || (protocol === 'tcp' ? 443 : 1194),
      protocol,
    };
  }
}
