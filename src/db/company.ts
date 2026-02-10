import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CompanyData {
    name: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    source: string;
}

/**
 * Check if a company already exists by name and address
 */
export async function findExistingCompany(name: string, address: string | null): Promise<boolean> {
    const existing = await prisma.company.findFirst({
        where: {
            name: name,
            address: address || undefined
        }
    });
    return existing !== null;
}

/**
 * Create a new company if it doesn't already exist
 * Returns the company if created, null if duplicate
 */
export async function createCompanyIfNotExists(data: CompanyData) {
    // Check for duplicate
    const isDuplicate = await findExistingCompany(data.name, data.address);
    
    if (isDuplicate) {
        return { company: null, isDuplicate: true };
    }

    // Create new company
    const company = await prisma.company.create({
        data: {
            name: data.name,
            phone: data.phone,
            website: data.website,
            address: data.address,
            source: data.source
        }
    });

    return { company, isDuplicate: false };
}

/**
 * Get all companies
 */
export async function getAllCompanies() {
    return prisma.company.findMany({
        orderBy: { createdAt: 'desc' }
    });
}

/**
 * Get companies that haven't been email scraped yet
 */
export async function getCompaniesWithoutEmails(limit = 50) {
    return prisma.company.findMany({
        where: {
            emailScraped: false,
            website: { not: null }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
    });
}

/**
 * Update company with extracted emails and save details to Contact model
 */
export async function updateCompanyEmails(
    companyId: string, 
    emails: string[], 
    details: { email: string; confidence: number; source: string; type?: string }[] = [],
    jobId?: string
) {
    // 1. Update the simple string array on Company
    await prisma.company.update({
        where: { id: companyId },
        data: {
            emails: emails,
            emailScraped: true,
            emailScrapedAt: new Date()
        }
    });

    // 2. Create detailed Contact records
    if (details.length > 0) {
        // We use createMany or individual creates. Prisma doesn't support createMany with relations 
        // easily on some DBs, but for Postgres it does. 
        // However, we want to set companyId.
        
        const contactsData = details.map(d => ({
             companyId: companyId,
             workEmail: d.email, // Map to correct Prisma field
             confidenceScore: d.confidence,
             emailSource: d.source,
             emailType: d.type || 'generic',
             jobId: jobId,
             fullName: 'Unknown' // Default, as we don't extract names yet
        }));

        await prisma.contact.createMany({
            data: contactsData
        });
    }
}

/**
 * Connect to database
 */
export async function connectDB() {
    await prisma.$connect();
}

/**
 * Disconnect from database
 */
export async function disconnectDB() {
    await prisma.$disconnect();
}

export { prisma };
