/**
 * Generates a self-signed TLS certificate valid for:
 *   - localhost / 127.0.0.1
 *   - The current LAN IPv4 address (auto-detected)
 *
 * Output: certs/server.key  and  certs/server.crt
 *
 * Run: node scripts/generate-certs.js
 */

'use strict';

const selfsigned = require('selfsigned');
const fs = require('fs');
const path = require('path');
const os = require('os');

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

async function main() {
  const lanIp = getLanIp();
  const certsDir = path.join(__dirname, '..', 'certs');

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
  ];

  if (lanIp) {
    altNames.push({ type: 7, ip: lanIp });
    console.log(`Including LAN IP in cert SAN: ${lanIp}`);
  }

  console.log('Generating self-signed certificate...');

  const attrs = [
    { name: 'commonName', value: 'stream-chat-dev' },
    { name: 'organizationName', value: 'Local Development' },
  ];

  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    days: 365,
    algorithm: 'sha256',
    extensions: [
      { name: 'subjectAltName', altNames },
      { name: 'basicConstraints', cA: false },
      {
        name: 'keyUsage',
        keyCertSign: false,
        digitalSignature: true,
        keyEncipherment: true,
        dataEncipherment: true,
      },
      { name: 'extKeyUsage', serverAuth: true },
    ],
  });

  if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });

  fs.writeFileSync(path.join(certsDir, 'server.key'), pems.private);
  fs.writeFileSync(path.join(certsDir, 'server.crt'), pems.cert);

  console.log('✓ Certificates written to:');
  console.log('  certs/server.key');
  console.log('  certs/server.crt');
  console.log('');
  console.log('NOTE: Browsers will show a security warning for self-signed certs.');
  console.log('Click "Advanced → Proceed anyway" to continue.');
  if (lanIp) {
    console.log(`\nLAN access URLs (after starting dev server):`);
    console.log(`  Frontend : https://${lanIp}:4200`);
    console.log(`  Backend  : https://${lanIp}:4300`);
    console.log(`  Widget   : https://${lanIp}:4500/demo.html`);
  }
}

main().catch((err) => {
  console.error('Failed to generate certificates:', err.message);
  process.exit(1);
});
