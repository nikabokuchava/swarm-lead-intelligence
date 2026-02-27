import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');
const samplesDir = path.join(rootDir, 'samples');

const prisma = new PrismaClient();

function escapeCSV(value: string): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  console.log('Fetching verified premium leads...');
  
  if (!fs.existsSync(samplesDir)) {
    fs.mkdirSync(samplesDir, { recursive: true });
  }

  const companies = await prisma.company.findMany({
    where: {
      emails: { isEmpty: false },
      contacts: {
        some: {
          verificationStatus: 'VALID',
          confidenceScore: { gte: 80 },
        },
      },
    },
    include: {
      contacts: {
        where: {
          verificationStatus: 'VALID',
          confidenceScore: { gte: 80 },
        },
        orderBy: {
          confidenceScore: 'desc',
        },
      },
    },
  });

  if (companies.length === 0) {
    console.log('No premium leads found matching the criteria.');
    return;
  }

  const headers = ['Company Name', 'Phone', 'Website', 'Address', 'Email', 'AI Confidence', 'MX Provider'];
  const csvRows = [headers.join(',')];

  companies.forEach(company => {
    // Take the best contact based on confidence score
    const bestContact = company.contacts[0];
    
    const row = [
      escapeCSV(company.name),
      escapeCSV(company.phone || ''),
      escapeCSV(company.website || ''),
      escapeCSV(company.address || ''),
      escapeCSV(bestContact?.workEmail || company.emails[0] || ''),
      escapeCSV(bestContact?.confidenceScore?.toString() || ''),
      escapeCSV(bestContact?.mxProvider || '')
    ];
    csvRows.push(row.join(','));
  });

  const csvPath = path.join(samplesDir, 'sample-leads.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n') + '\n', 'utf8');
  
  console.log(`Successfully exported ${companies.length} premium leads to ${csvPath}`);
}

main()
  .catch(e => {
    console.error('Error generating sample CSV:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
