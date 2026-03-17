/**
 * Deep DNS diagnostic: test c-ares vs OS resolver
 */
import dns from 'node:dns';
import { Resolver } from 'node:dns/promises';

// Test 1: OS-level lookup (uses libuv/getaddrinfo — goes through Windows DNS client)
dns.lookup('google.com', (err, address) => {
  if (err) console.log('dns.lookup (OS) ERROR:', err.code);
  else console.log('dns.lookup (OS) OK:', address);
});

// Test 2: c-ares resolve (bypasses OS — direct UDP to DNS server)
dns.resolveMx('google.com', (err, addresses) => {
  if (err) console.log('dns.resolveMx (c-ares default) ERROR:', err.code);
  else console.log('dns.resolveMx (c-ares default) OK:', addresses[0]?.exchange);
});

// Test 3: Explicit resolver with system DNS
const resolver = new Resolver();
resolver.setServers(['1.1.1.1']);
resolver.resolveMx('google.com').then(
  (mx) => console.log('Resolver(1.1.1.1) OK:', mx[0]?.exchange),
  (err) => console.log('Resolver(1.1.1.1) ERROR:', err.code)
);

// Test 4: Explicit resolver with Google DNS
const resolver2 = new Resolver();
resolver2.setServers(['8.8.8.8']);
resolver2.resolveMx('google.com').then(
  (mx) => console.log('Resolver(8.8.8.8) OK:', mx[0]?.exchange),
  (err) => console.log('Resolver(8.8.8.8) ERROR:', err.code)
);

// Test 5: Try localhost DNS (Windows DNS Client service)
const resolver3 = new Resolver();
resolver3.setServers(['127.0.0.1']);
resolver3.resolveMx('google.com').then(
  (mx) => console.log('Resolver(127.0.0.1) OK:', mx[0]?.exchange),
  (err) => console.log('Resolver(127.0.0.1) ERROR:', err.code)
);

// Keep alive for async callbacks
setTimeout(() => process.exit(0), 10000);
