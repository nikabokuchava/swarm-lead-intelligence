import { verifyEmail } from '../services/emailVerifier.js';

async function main() {
    console.log('Testing DNS Resolution...');
    
    const emails = [
        'test@gmail.com',
        'test@microsoft.com',
        'invalid-email@nonexistent-domain-12345.com'
    ];

    for (const email of emails) {
        console.log(`Verifying: ${email}`);
        const result = await verifyEmail(email);
        console.log(`Result:`, result);
    }
}

main();
