import { waitForSiteReady, discoverBackendOrigins } from './tools.js';
import { generateTestIdentity, identityToFields } from './testIdentity.js';

const url = process.argv[2] || 'https://go-trade-web.onrender.com/';

async function main() {
  console.log(`Warming up ${url} ...`);
  const res = await waitForSiteReady(url, async (attempt, reason) => {
    console.log(`  attempt ${attempt}: ${reason}`);
  });
  console.log(res);

  const backends = await discoverBackendOrigins(url);
  console.log('Backend origins:', backends);
  for (const origin of backends) {
    console.log(origin, await waitForSiteReady(origin));
  }

  const identity = generateTestIdentity('3f9a1c2e-1111-2222-3333-444455556666');
  console.log(identity);
  console.log(identityToFields(identity, { email: 'override@example.com', phone: '' }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
