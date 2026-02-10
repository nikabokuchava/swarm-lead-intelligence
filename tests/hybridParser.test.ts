import { describe, it, expect } from 'vitest';
import { HybridParser } from '../src/utils/hybridParser';

describe('HybridParser', () => {
    const parser = new HybridParser();

    it('should extract simple email from text', async () => {
        const html = '<p>Contact us at test@mybusiness.io for more info.</p>';
        const result = await parser.extract(html);
        
        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('test@mybusiness.io');
        expect(result[0].source).toBe('REGEX');
    });

    it('should extract email from mailto link', async () => {
        // This checks if the parser handles attributes, which usually get stripped by strict sanitization
        const html = '<a href="mailto:support@realcompany.co">Email Us</a>';
        const result = await parser.extract(html);
        
        expect(result.some(r => r.email === 'support@realcompany.co')).toBe(true);
    });

    it('should deduplicate emails', async () => {
        const html = `
            <div>
                <p>test@mybusiness.io</p>
                <a href="mailto:test@mybusiness.io">Contact</a>
            </div>
        `;
        const result = await parser.extract(html);
        
        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('test@mybusiness.io');
    });

    it('should sanitize scripts and not execute them', async () => {
        // We can't easily test execution in Node, but we confirm the output is clean
        const html = '<div><script>alert("xss")</script>info@secure-startup.com</div>';
        const result = await parser.extract(html);
        
        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('info@secure-startup.com');
        // If script was treated as text, it might mess up parsing, but here we just check valid email extraction
    });

    it('should handle obfuscated emails (at/dot)', async () => {
        const html = '<p>reach me at **jane [at] creative-studio [dot] net**</p>';
        const result = await parser.extract(html);
        
        // This is expected to fail with current regex, serving as a reminder to improve it
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].email).toContain('jane@creative-studio.net');
    });

    it('should ignore generic placeholder emails', async () => {
        // Needs implementation in parser
        const html = 'example@email.com user@domain.com real@valid-company.com';
        const result = await parser.extract(html);
        
        const emails = result.map(r => r.email);
        expect(emails).not.toContain('example@email.com');
        expect(emails).toContain('real@valid-company.com');
    });
});
