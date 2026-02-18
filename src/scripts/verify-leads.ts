import { prisma } from '../db/company.js';
import { verifyEmail } from '../services/emailVerifier.js';
import cliProgress from 'cli-progress';

async function main() {
    console.log('🔍 Starting Email Verification Backfill...');

    // 1. Fetch all UNKNOWN contacts
    const contacts = await prisma.contact.findMany({
        where: {
            verificationStatus: 'UNKNOWN',
            workEmail: { not: null }
        },
        select: {
            id: true,
            workEmail: true
        }
    });

    if (contacts.length === 0) {
        console.log('✅ No pending verifications found.');
        return;
    }

    console.log(`📋 Found ${contacts.length} contacts to verify.`);

    // 2. Initialize Progress Bar
    const bar = new cliProgress.SingleBar({
        format: 'Verification |{bar}| {percentage}% | {value}/{total} | {status}',
        barCompleteChar: '█',
        barIncompleteChar: '░',
        hideCursor: true
    }, cliProgress.Presets.shades_classic);

    bar.start(contacts.length, 0, { status: 'Starting...' });

    let updated = 0;
    let valid = 0;
    let invalid = 0;
    let unknown = 0;

    // 3. Process in chunks to avoid overwhelming DNS
    const CHUNK_SIZE = 10;
    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
        const chunk = contacts.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (contact) => {
            if (!contact.workEmail) return;

            try {
                // Verify
                const result = await verifyEmail(contact.workEmail);
                
                // Update stats
                if (result.status === 'VALID') valid++;
                else if (result.status === 'INVALID') invalid++;
                else unknown++;

                // Update DB
                await prisma.contact.update({
                    where: { id: contact.id },
                    data: {
                        verificationStatus: result.status,
                        mxProvider: result.mxProvider
                    }
                });

                updated++;
                bar.increment({ status: `Verifying: ${contact.workEmail}` });
            } catch (err) {
                // In case of DB error or other unexpected issues
                // VerifyEmail service already handles DNS errors gracefully
                bar.increment({ status: `Error: ${contact.workEmail}` });
            }
        }));

        // Small delay to be nice to DNS servers
        await new Promise(r => setTimeout(r, 100)); // 100ms delay
    }

    bar.stop();

    console.log('\n🏁 Backfill Complete!');
    console.log(`✅ Valid: ${valid}`);
    console.log(`❌ Invalid: ${invalid}`);
    console.log(`❓ Unknown: ${unknown}`);
    console.log(`Total Updated: ${updated}`);
}

main()
    .catch((e) => {
        console.error('Fatal Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
