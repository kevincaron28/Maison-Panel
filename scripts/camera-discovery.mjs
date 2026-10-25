import { execFile } from 'node:child_process';
import net from 'node:net';

// Finds the camera again when DHCP gives it a new address: probe the /24 for RTSP,
// then confirm the hardware (MAC) address from the Windows ARP cache. LAN only.
export const normalizeMac = mac => String(mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');

export function macFromArp(output, ip) {
  for (const line of String(output).split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === ip && /^[0-9a-f]{2}([-:][0-9a-f]{2}){5}$/i.test(parts[1] || '')) return normalizeMac(parts[1]);
  }
  return '';
}

export function redact(text) {
  return String(text).replace(/(rtsp|https?):\/\/[^@\s/]+@/gi, '$1://***@');
}

function portOpen(host, port, timeout) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port });
    const done = ok => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeout, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

const arp = ip => new Promise(resolve =>
  execFile('arp', ['-a', ip], { windowsHide: true, timeout: 3000 }, (error, stdout) => resolve(error ? '' : stdout)));

export async function findCamera(currentHost, mac, { probe = portOpen, lookup = arp, timeout = 400, batch = 32 } = {}) {
  const wanted = normalizeMac(mac);
  if (!/^[0-9a-f]{12}$/.test(wanted) || !/^\d+\.\d+\.\d+\.\d+$/.test(currentHost)) return null;
  const prefix = currentHost.split('.').slice(0, 3).join('.');
  const hosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);
  for (let i = 0; i < hosts.length; i += batch) {
    const slice = hosts.slice(i, i + batch);
    const open = (await Promise.all(slice.map(async host => (await probe(host, 554, timeout)) ? host : null))).filter(Boolean);
    for (const host of open) if (macFromArp(await lookup(host), host) === wanted) return host;
  }
  return null;
}
