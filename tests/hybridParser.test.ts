import { describe, it, expect, vi } from 'vitest';
import { HybridParser } from '../src/utils/hybridParser';
import { generateObject } from 'ai';

vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

describe('HybridParser', () => {
    const parser = new HybridParser();

    // --- Standard email extraction ---

    it('should extract simple email from text', async () => {
        const html = '<p>Contact us at test@mybusiness.io for more info.</p>';
        const result = await parser.extract(html);

        expect(result.emails).toHaveLength(1);
        expect(result.emails[0].email).toBe('test@mybusiness.io');
        expect(result.emails[0].source).toBe('REGEX');
    });

    it('should extract email from mailto link', async () => {
        const html = '<a href="mailto:support@realcompany.co">Email Us</a>';
        const result = await parser.extract(html);

        expect(result.emails.some(r => r.email === 'support@realcompany.co')).toBe(true);
    });

    it('should extract complex email with dots, hyphens, and year', async () => {
        const html = '<p>Email: first.last-2024@domain.co.uk</p>';
        const result = await parser.extract(html);

        expect(result.emails.some(r => r.email === 'first.last-2024@domain.co.uk')).toBe(true);
    });

    it('should extract email with plus addressing', async () => {
        const html = '<p>Email: user+tag@company.com</p>';
        const result = await parser.extract(html);

        expect(result.emails.some(r => r.email === 'user+tag@company.com')).toBe(true);
    });

    // --- Deduplication ---

    it('should deduplicate emails', async () => {
        const html = `
            <div>
                <p>test@mybusiness.io</p>
                <a href="mailto:test@mybusiness.io">Contact</a>
            </div>
        `;
        const result = await parser.extract(html);

        expect(result.emails).toHaveLength(1);
        expect(result.emails[0].email).toBe('test@mybusiness.io');
    });

    // --- Security ---

    it('should sanitize scripts and not execute them', async () => {
        const html = '<div><script>alert("xss")</script>info@secure-startup.com</div>';
        const result = await parser.extract(html);

        expect(result.emails).toHaveLength(1);
        expect(result.emails[0].email).toBe('info@secure-startup.com');
    });

    // --- Obfuscated ---

    it('should handle obfuscated emails (at/dot)', async () => {
        const html = '<p>reach me at **jane [at] creative-studio [dot] net**</p>';
        const result = await parser.extract(html);

        expect(result.emails.length).toBeGreaterThan(0);
        expect(result.emails[0].email).toContain('jane@creative-studio.net');
    });

    // --- Placeholder filtering ---

    it('should ignore generic placeholder emails', async () => {
        const html = 'example@email.com user@domain.com real@valid-company.com';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('example@email.com');
        expect(emails).toContain('real@valid-company.com');
    });

    // --- Generic email fallback ---

    it('should keep generic emails (info@, admin@) when no personal email exists', async () => {
        const html = '<p>Contact: info@company.com</p>';
        const result = await parser.extract(html);

        expect(result.emails).toHaveLength(1);
        expect(result.emails[0].email).toBe('info@company.com');
        expect(result.emails[0].type).toBe('generic');
    });

    it('should keep both generic and personal emails, with personal sorted first', async () => {
        const html = '<p>info@company.com john.doe@company.com</p>';
        const result = await parser.extract(html);

        expect(result.emails).toHaveLength(2);
        expect(result.emails[0].type).toBe('personal');
        expect(result.emails[0].email).toBe('john.doe@company.com');
        expect(result.emails[1].type).toBe('generic');
        expect(result.emails[1].email).toBe('info@company.com');
    });

    it('should keep multiple generic emails when no personal email exists', async () => {
        const html = '<p>info@company.com support@company.com</p>';
        const result = await parser.extract(html);

        expect(result.emails).toHaveLength(2);
        expect(result.emails.every(r => r.type === 'generic')).toBe(true);
    });

    // --- Garbage filtering ---

    it('should reject emails with 8+ consecutive digits in local part', async () => {
        const html = '<p>13053949814info@company.com real@company.com</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('13053949814info@company.com');
        expect(emails).toContain('real@company.com');
    });

    it('should reject emails with invalid TLD (too long)', async () => {
        const html = '<p>user@domain.cosmonday real@company.com</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('user@domain.cosmonday');
        expect(emails).toContain('real@company.com');
    });

    it('should reject emails with URL fragment garbage', async () => {
        const html = '<p>follofollo@weird.com real@company.com</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('follofollo@weird.com');
        expect(emails).toContain('real@company.com');
    });

    it('should accept valid short TLDs (.io, .co, .uk)', async () => {
        const html = '<p>test@startup.io admin@site.co ceo@firm.uk</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).toContain('test@startup.io');
        expect(emails).toContain('admin@site.co');
        expect(emails).toContain('ceo@firm.uk');
    });

    // --- HTML sanitization concatenation garbage ---

    it('should reject phone-concatenated local parts (e.g., 6473reservation@)', async () => {
        const html = '<p>6473reservation@bestclinic.com real@bestclinic.com</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('6473reservation@bestclinic.com');
        expect(emails).toContain('real@bestclinic.com');
    });

    it('should not include trailing domain suffix from HTML concatenation (e.g., gmail.com-ra)', async () => {
        const html = '<p>test@gmail.com-ra real@bestclinic.com</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('test@gmail.com-ra');
        expect(emails).toContain('test@gmail.com');
    });

    it('should reject concatenated TLD from sanitization (e.g., .com.can)', async () => {
        const html = '<p>info@bestclinic.com.can real@bestclinic.com</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('info@bestclinic.com.can');
    });

    it('should reject URL-merged local parts (e.g., pmwww.domain.huinfo@)', async () => {
        const html = '<p>pmwww.bestclinic.huinfo@bestclinic.hu real@bestclinic.com</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('pmwww.bestclinic.huinfo@bestclinic.hu');
        expect(emails).toContain('real@bestclinic.com');
    });

    it('should reject concatenated TLD segments (e.g., .huinfo)', async () => {
        const html = '<p>events@bestclinic.huinfo real@bestclinic.com</p>';
        const result = await parser.extract(html);

        const emails = result.emails.map(r => r.email);
        expect(emails).not.toContain('events@bestclinic.huinfo');
        expect(emails).toContain('real@bestclinic.com');
    });

    it('should still accept legitimate double-TLD domains (e.g., .co.uk)', async () => {
        const html = '<p>first.last@company.co.uk</p>';
        const result = await parser.extract(html);

        expect(result.emails.some(r => r.email === 'first.last@company.co.uk')).toBe(true);
    });

    // --- LLM Confidence Clamping ---

    it('should clamp LLM confidence scores > 100 to 100 and < 0 to 0', async () => {
        const { generateObject } = await import('ai');
        const mockGenerateObject = generateObject as any;
        mockGenerateObject.mockResolvedValue({
            object: {
                emails: [
                    { email: 'high@test.com', confidence: 999, source: 'LLM', type: 'personal' },
                    { email: 'low@test.com', confidence: -50, source: 'LLM', type: 'personal' }
                ],
                keyPeople: []
            }
        });

        process.env.OPENAI_API_KEY = 'test-key';
        const html = '<p>Nothing interesting here, leaving it to LLM</p>';
        const result = await parser.extract(html, true);

        const highEmail = result.emails.find(r => r.email === 'high@test.com');
        const lowEmail = result.emails.find(r => r.email === 'low@test.com');

        expect(highEmail).toBeDefined();
        expect(highEmail?.confidence).toBe(100);

        expect(lowEmail).toBeDefined();
        expect(lowEmail?.confidence).toBe(0);
    });
});
