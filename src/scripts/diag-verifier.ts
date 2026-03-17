/**
 * Diagnostic: test emailVerifier.ts against a few known-good domains.
 * Isolates DNS resolution vs SMTP probe vs catch-all detection.
 */
import 'dotenv/config';
import { resolveMx } from 'node:dns/promises';
import { verifyEmail, probeSmtp } from '../services/emailVerifier.js';
import { prisma } from '../db/prisma.js';

const TEST_EMAILS = [
  'info@google.com',           // Google — guaranteed MX
  'test@outlook.com',          // Microsoft — guaranteed MX
  'nonexistent@thisdoesnotexist99999.com', // Should be INVALID (ENOTFOUND)
];

async function diagnose() {
  console.log('='.repeat(64));
  console.log('  EMAIL VERIFIER DIAGNOSTIC');
  console.log('='.repeat(64));
  console.log(`  LOCAL_DEMO_MODE = ${process.env.LOCAL_DEMO_MODE}`);
  console.log('');

  // Step 1: Raw DNS MX resolution
  console.log('  STEP 1: RAW DNS MX RESOLUTION');
  console.log('-'.repeat(64));
  for (const email of TEST_EMAILS) {
    const domain = email.split('@')[1];
    try {
      const mx = await resolveMx(domain);
      const primary = mx.sort((a, b) => a.priority - b.priority)[0];
      console.log(`  ✅ ${domain.padEnd(40)} → ${primary.exchange} (pri=${primary.priority})`);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      console.log(`  ❌ ${domain.padEnd(40)} → DNS error: ${code ?? err}`);
    }
  }

  // Step 2: SMTP probe (port 25)
  console.log('');
  console.log('  STEP 2: SMTP PORT 25 PROBE');
  console.log('-'.repeat(64));
  try {
    const mx = await resolveMx('google.com');
    const primary = mx.sort((a, b) => a.priority - b.priority)[0].exchange;
    console.log(`  Probing ${primary}:25 with info@google.com...`);
    const result = await probeSmtp('info@google.com', primary);
    console.log(`  Result: status=${result.status} code=${result.code} error=${result.error ?? 'none'}`);
    if (result.status === 'UNKNOWN' && result.error?.includes('timeout')) {
      console.log('  ⚠️  PORT 25 BLOCKED — ISP/firewall blocking outbound SMTP');
    }
  } catch (err) {
    console.log(`  ❌ SMTP probe failed: ${err}`);
  }

  // Step 3: Full verifyEmail pipeline
  console.log('');
  console.log('  STEP 3: FULL verifyEmail() PIPELINE');
  console.log('-'.repeat(64));
  for (const email of TEST_EMAILS) {
    const result = await verifyEmail(email);
    console.log(`  ${email.padEnd(45)} → ${result.status.padEnd(10)} provider=${result.mxProvider ?? 'N/A'}  conf=${result.confidence}  err=${result.error ?? 'none'}`);
  }

  // Step 4: Sample real leads from HVAC job
  console.log('');
  console.log('  STEP 4: SAMPLE REAL HVAC LEADS');
  console.log('-'.repeat(64));
  const contacts = await prisma.contact.findMany({
    where: {
      company: {
        scrapeJob: { query: { contains: 'HVAC' } }
      },
      workEmail: { not: null }
    },
    select: { workEmail: true, verificationStatus: true, mxProvider: true, confidenceScore: true },
    take: 5
  });

  if (contacts.length === 0) {
    console.log('  No HVAC contacts with email found.');
  } else {
    for (const ct of contacts) {
      console.log(`  ${(ct.workEmail ?? '').padEnd(40)} status=${ct.verificationStatus}  mx=${ct.mxProvider ?? 'null'}  conf=${ct.confidenceScore}`);
    }
    // Re-verify one
    if (contacts[0].workEmail) {
      console.log('');
      console.log(`  Re-verifying: ${contacts[0].workEmail}`);
      const fresh = await verifyEmail(contacts[0].workEmail);
      console.log(`  → status=${fresh.status}  provider=${fresh.mxProvider ?? 'N/A'}  conf=${fresh.confidence}  err=${fresh.error ?? 'none'}`);
    }
  }

  console.log('');
  console.log('='.repeat(64));
  await prisma.$disconnect();
}

diagnose().catch(async (e) => {
  console.error('[diag] Fatal:', e);
  await prisma.$disconnect();
  process.exit(1);
});
