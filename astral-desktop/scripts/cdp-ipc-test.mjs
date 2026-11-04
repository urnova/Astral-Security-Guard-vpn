// cdp-ipc-test.mjs - Test IPC bridge via CDP WebSocket (no browser needed)
// Connects to the running Electron app via Chrome DevTools Protocol
import net from 'net';
import http from 'http';

const WS_ID = process.argv[2] || 'C407798381102EDC7AB4D2B5500067E0';
const WS_HOST = 'localhost';
const WS_PORT = 9229;
const WS_PATH = `/devtools/page/${WS_ID}`;

let msgId = 1;
let socket;
let buffer = '';
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending.set(id, { resolve, reject });
    const msg = JSON.stringify({ id, method, params });
    const frame = buildWsFrame(msg);
    socket.write(frame);
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }
    }, 8000);
  });
}

function buildWsFrame(data) {
  const payload = Buffer.from(data, 'utf8');
  const len = payload.length;
  const mask = Buffer.from([0x01, 0x02, 0x03, 0x04]);
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
  let header;
  if (len <= 125) {
    header = Buffer.from([0x81, 0x80 | len, ...mask]);
  } else if (len <= 65535) {
    header = Buffer.from([0x81, 0xFE, len >> 8, len & 0xFF, ...mask]);
  } else {
    throw new Error('Frame too large');
  }
  return Buffer.concat([header, masked]);
}

function parseWsFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0F;
  if (!fin || opcode !== 1) return null;
  let len = buf[1] & 0x7F;
  let offset = 2;
  if (len === 126) { len = (buf[2] << 8) | buf[3]; offset = 4; }
  if (buf.length < offset + len) return null;
  return { data: buf.slice(offset, offset + len).toString('utf8'), totalLen: offset + len };
}

async function evalInRenderer(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return result.result?.result?.value;
}

async function main() {
  return new Promise((resolve, reject) => {
    socket = new net.Socket();
    
    const key = Buffer.from(`vanguard-test-${Date.now()}`).toString('base64');
    const handshake = [
      `GET ${WS_PATH} HTTP/1.1`,
      `Host: ${WS_HOST}:${WS_PORT}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      '',
      '',
    ].join('\r\n');

    let handshakeDone = false;
    let rawBuf = Buffer.alloc(0);

    socket.connect(WS_PORT, WS_HOST, () => { socket.write(handshake); });

    socket.on('data', async (chunk) => {
      rawBuf = Buffer.concat([rawBuf, chunk]);
      
      if (!handshakeDone) {
        const str = rawBuf.toString('utf8');
        if (str.includes('\r\n\r\n')) {
          handshakeDone = true;
          const httpEnd = str.indexOf('\r\n\r\n') + 4;
          rawBuf = rawBuf.slice(httpEnd);
          
          try {
            // Enable Runtime domain
            await send('Runtime.enable', {});
            
            // Test 1: Check window.api exists
            const apiExists = await evalInRenderer('typeof window.api');
            console.log('window.api type:', apiExists);

            // Test 2: Get maintenance schedule via IPC
            const schedCode = `(async () => { const r = await window.api?.getMaintenanceSchedule?.(); return JSON.stringify(r); })()`;
            const sched = await evalInRenderer(schedCode);
            console.log('Maintenance schedule:', sched);

            // Test 3: Get hardware info (GPU)
            const hwCode = `(async () => { const r = await window.api?.getHardwareInfo?.(); return JSON.stringify({ gpuName: r?.hardware?.gpuName, gpuDriver: r?.hardware?.gpuDriver, biosVersion: r?.hardware?.biosVersion, biosCheckStatus: r?.hardware?.biosCheckStatus }); })()`;
            const hw = await evalInRenderer(hwCode);
            console.log('Hardware info:', hw);

            // Test 4: Check scheduler notification function
            const schedNotify = await evalInRenderer('typeof window.api?.saveMaintenanceSchedule');
            console.log('saveMaintenanceSchedule bridge type:', schedNotify);

            // Test 5: Scan disk junk (C drive) — read only, no cleanup
            const scanCode = `(async () => { const r = await window.api?.scanDiskJunk?.('C'); return JSON.stringify({ success: r?.success, totalFormatted: r?.totalFormatted, errorMessage: r?.errorMessage, categoryCount: r?.categories?.length }); })()`;
            const scan = await evalInRenderer(scanCode);
            console.log('Disk scan result (C):', scan);

            console.log('\nALL CDP IPC TESTS DONE');
            socket.destroy();
            resolve();
          } catch (e) {
            console.error('CDP test error:', e.message);
            socket.destroy();
            reject(e);
          }
        }
        return;
      }

      while (rawBuf.length > 0) {
        const frame = parseWsFrame(rawBuf);
        if (!frame) break;
        rawBuf = rawBuf.slice(frame.totalLen);
        try {
          const msg = JSON.parse(frame.data);
          if (msg.id && pending.has(msg.id)) {
            const { resolve } = pending.get(msg.id);
            pending.delete(msg.id);
            resolve(msg);
          }
        } catch {}
      }
    });

    socket.on('error', (e) => { console.error('Socket error:', e.message); reject(e); });
    socket.on('close', () => { if (pending.size > 0) reject(new Error('Connection closed with pending requests')); });
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
