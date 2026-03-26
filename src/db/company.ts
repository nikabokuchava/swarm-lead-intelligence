import { prisma } from './prisma.js';

interface CompanyData {
    name: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    source: string;
    jobId?: string;
    userId: string; // Required - must be passed from job
    rating?: number | null;
    reviewCount?: number | null;
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
    if (!data.userId || data.userId === 'admin') {
        console.warn(`⚠️ Orphaned Company detected: "${data.name}" has no real userId (got: ${data.userId}). Check job ownership.`);
    }

    // Atomic find-and-create transaction to prevent TOCTOU race condition
    return await prisma.$transaction(async (tx) => {
        const existing = await tx.company.findFirst({
            where: {
                name: data.name,
                address: data.address || undefined
            }
        });

        if (existing) {
            return { company: null, isDuplicate: true };
        }

        const company = await tx.company.create({
            data: {
                name: data.name,
                phone: data.phone,
                website: data.website,
                address: data.address,
                source: data.source,
                jobId: data.jobId,
                userId: data.userId || 'admin',
                rating: data.rating ?? null,
                reviewCount: data.reviewCount ?? null
            }
        });

        // Atomic increment: track real-time quota on parent job
        if (data.jobId) {
            await tx.scrapeJob.update({
                where: { id: data.jobId },
                data: { resultsFound: { increment: 1 } }
            });
        }

        return { company, isDuplicate: false };
    });
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
 * Get companies that haven't been email-processed yet
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
    details: {
        email: string;
        confidence: number;
        source: string;
        type?: string;
        verificationStatus?: string;
        mxProvider?: string;
        isCLevel?: boolean;
        fullName?: string;
        title?: string;
    }[] = [],
    jobId?: string
) {
    // Atomic transaction: update Company + create Contacts together
    await prisma.$transaction(async (tx) => {
        // 1. Update the simple string array on Company
        await tx.company.update({
            where: { id: companyId },
            data: {
                emails: emails,
                emailScraped: true,
                emailScrapedAt: new Date()
            }
        });

        // 2. Create detailed Contact records (deduplicated)
        if (details.length > 0) {
            // In-memory dedup by normalized email before hitting DB
            const seen = new Set<string>();
            const dedupedDetails = details.filter(d => {
                const key = d.email.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            const contactsData = dedupedDetails.map(d => ({
                 companyId: companyId,
                 workEmail: d.email,
                 confidenceScore: d.confidence,
                 emailSource: d.source,
                 emailType: d.type || 'generic',
                 verificationStatus: d.verificationStatus || 'UNKNOWN',
                 mxProvider: d.mxProvider,
                 jobId: jobId,
                 fullName: d.fullName || 'Unknown',
                 title: d.title || null,
                 isCLevel: d.isCLevel ?? false
            }));

            await tx.contact.createMany({
                data: contactsData,
                skipDuplicates: true,
            });
        }
    });
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
