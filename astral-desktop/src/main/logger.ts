import fs from 'fs';
import path from 'path';
import { app } from 'electron';

class Logger {
  private logPath: string;
  private logDir: string;

  constructor() {
    try {
      const appData = app.getPath('userData') || path.join(process.env.APPDATA || 'C:\\', 'AstralVanguard');
      this.logDir = path.join(appData, 'logs');
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.logPath = path.join(this.logDir, 'vanguard-technical.log');
    } catch {
      this.logDir = process.cwd();
      this.logPath = path.join(this.logDir, 'vanguard-technical.log');
    }
  }

  private write(level: string, message: string, details?: any) {
    const timestamp = new Date().toISOString();
    let line = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    if (details) {
      if (typeof details === 'object') {
        try {
          line += `\n  Details: ${JSON.stringify(details, null, 2)}`;
        } catch {
          line += `\n  Details: ${String(details)}`;
        }
      } else {
        line += `\n  Details: ${details}`;
      }
    }
    line += '\n';

    try {
      fs.appendFileSync(this.logPath, line, 'utf8');
    } catch (e) {
      console.error('Failed to write to log file:', e);
    }
  }

  info(msg: string, details?: any) {
    this.write('INFO', msg, details);
    console.log(`[INFO] ${msg}`);
  }

  warn(msg: string, details?: any) {
    this.write('WARN', msg, details);
    console.warn(`[WARN] ${msg}`);
  }

  error(msg: string, details?: any) {
    this.write('ERROR', msg, details);
    console.error(`[ERROR] ${msg}`, details || '');
  }

  debug(msg: string, details?: any) {
    this.write('DEBUG', msg, details);
    console.debug(`[DEBUG] ${msg}`);
  }

  getLogs(maxLines = 100): string {
    try {
      if (!fs.existsSync(this.logPath)) return 'Aucun log enregistré pour le moment.';
      const content = fs.readFileSync(this.logPath, 'utf8');
      const lines = content.split('\n');
      return lines.slice(-maxLines).join('\n');
    } catch (e: any) {
      return `Impossible de lire les logs : ${e.message}`;
    }
  }

  getLogFilePath(): string {
    return this.logPath;
  }
}

export const logger = new Logger();
