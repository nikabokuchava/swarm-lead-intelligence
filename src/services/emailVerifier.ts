import { resolveMx, setServers } from 'node:dns/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// Set public DNS to avoid local resolution issues
setServers(['8.8.8.8', '1.1.1.1']);

export interface EmailVerificationResult {
  status: 'VALID' | 'INVALID' | 'UNKNOWN';
  mxProvider?: string;
  error?: string;
}

export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  const domain = email.split('@')[1];
  
  if (!domain) {
    return { status: 'INVALID', error: 'Invalid email format' };
  }

  // Helper to determine provider from MX string
  const getProvider = (mx: string) => {
    const lower = mx.toLowerCase();
    if (lower.includes('google') || lower.includes('gmail')) return 'Google';
    if (lower.includes('outlook') || lower.includes('protection.outlook')) return 'Outlook';
    if (lower.includes('zoho')) return 'Zoho';
    if (lower.includes('proton')) return 'ProtonMail';
    if (lower.includes('aws') || lower.includes('amazon')) return 'AWS SES';
    return 'Other';
  };

  try {
    // 1. Try Native Node DNS
    const mxRecords = await resolveMx(domain);

    if (!mxRecords || mxRecords.length === 0) {
      return { status: 'INVALID', error: 'No MX records found' };
    }

    const primaryMx = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange;
    return { status: 'VALID', mxProvider: getProvider(primaryMx) };
    
  } catch (error: any) {
    // 2. Fallback to System DNS (nslookup) if Node DNS fails (e.g. ECONNREFUSED)
    if (error.code === 'ECONNREFUSED' || error.syscall === 'queryMx') {
        try {
            // Windows/Linux stats
            const command = process.platform === 'win32' 
                ? `nslookup -type=mx ${domain}` 
                : `dig +short MX ${domain}`;

            // Catch stderr as well
            const { stdout, stderr } = await execAsync(command);
            const output = (stdout || '') + (stderr || '');

            if (output.includes('Non-existent domain') || output.includes('NXDOMAIN') || output.includes("can't find")) {
                 return { status: 'INVALID', error: 'Domain not found (System DNS)' };
            }

            // Parse for common providers in stdout
            if (output.includes('mail exchanger')) {
                // Windows nslookup output check
                const provider = getProvider(output);
                return { status: 'VALID', mxProvider: provider };
            }
 
            // Only return VALID if we explicitly see success indicators
            // Unlike generic string length check which caused false positives
            if (process.platform !== 'win32' && output.length > 5) {
                // Dig output usually just lists records
                 return { status: 'VALID', mxProvider: getProvider(output) };
            }
            
            // If we got here, we executed but found nothing specific
            return { status: 'INVALID', error: 'No MX records found (System DNS)' };

        } catch (sysError: any) {
             // Fallback failed too or command error (like non-zero exit code for not found)
             if (sysError.stdout?.includes('Non-existent domain') || sysError.message?.includes('Non-existent domain')) {
                 return { status: 'INVALID', error: 'Domain not found' };
             }
             return { status: 'UNKNOWN', error: sysError.message };
        }
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
        return { status: 'INVALID', error: 'Domain not found' };
    }
    // Timeout or other network error - don't mark as invalid to be safe
    return { status: 'UNKNOWN', error: error.message };
  }
}
