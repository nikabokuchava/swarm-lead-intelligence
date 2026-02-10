import { prisma, connectDB, disconnectDB } from '../db/company.js';

async function main() {
    await connectDB();
    console.log('🔍 Checking recently scraped emails...\n');

    // 1. Get latest Contacts
    const contacts = await prisma.contact.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
            company: {
                select: { name: true, website: true }
            }
        }
    });

    console.log('📧 Latest 5 Contacts:');
    if (contacts.length === 0) console.log('   (No contacts found)');
    contacts.forEach(c => {
        console.log(`   - [${c.company.name}] ${c.workEmail} (Source: ${c.emailSource}, Type: ${c.emailType}, Confidence: ${c.confidenceScore}%)`);
    });

    console.log('\n🏢 Latest 5 Companies with Emails Scraped:');
    const companies = await prisma.company.findMany({
        where: { emailScraped: true },
        take: 5,
        orderBy: { emailScrapedAt: 'desc' },
        select: { name: true, emails: true, emailScrapedAt: true }
    });

    if (companies.length === 0) console.log('   (No companies found)');
    companies.forEach(c => {
        console.log(`   - [${c.name}] Emails: ${c.emails.join(', ')} (Scraped: ${c.emailScrapedAt?.toISOString()})`);
    });

    await disconnectDB();
}

main().catch(console.error);
