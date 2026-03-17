import { recoverStaleLocks } from '../db/queue.js';
import { prisma } from '../db/company.js';

const result = await recoverStaleLocks();
console.log('Result:', JSON.stringify(result));
await prisma.$disconnect();
