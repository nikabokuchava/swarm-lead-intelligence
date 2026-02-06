import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as winston from 'winston';
import pg from 'pg';

const { Client } = pg;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const puppeteer = puppeteerExtra as any;

const stealth = StealthPlugin();
puppeteer.use(stealth);

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'scraper.log' })
    ]
});

const dbClient = new Client({
    connectionString: "postgresql://admin:[REDACTED-DB-PASSWORD]@localhost:5432/swarm_leads"
});

async function main() {
    logger.info('🚀 Launching Speed Scraper...');

    try {
        await dbClient.connect();
        logger.info('🔌 Connected to DB');

        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US']
        });
        const page = await browser.newPage();

        // Fix for: ReferenceError: __name is not defined (tsx/esbuild helper leaking into page.evaluate context)
        // Define a no-op __name in the browser context before any scripts run.
        await page.evaluateOnNewDocument(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).__name = (fn: any) => fn;
        });

        // 1. Search
        const searchQuery = 'dentists in tbilisi';
        const url = `https://www.google.com/maps/search/${searchQuery.replace(' ', '+')}?hl=en`;
        logger.info(`🔍 Searching: ${url}`);

        // CRITICAL FIX: Changed from networkidle2 to domcontentloaded
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 2. Wait for Results (Robust Strategy)
        logger.info('⏳ Waiting for results container...');
        try {
            await page.waitForSelector('div[role="feed"]', { timeout: 10000 });
            logger.info('✅ Found results feed');
        } catch {
            logger.warn('⚠️ Feed selector timeout. Launching finding protocol anyway...');
        }

        // 3. Find and Click First Result
        logger.info('👆 Attempting to click first result...');
        const resultSelector = 'a.hfpxzc';

        try {
            await page.waitForSelector(resultSelector, { timeout: 5000 });
            await page.click(resultSelector);
            logger.info('✅ OTA Click sent');

            await new Promise(r => setTimeout(r, 4000));
        } catch {
            logger.error('❌ Could not click result. Trying fallback coordinates...');
            // Fallback: Click in the sidebar area
            await page.mouse.click(100, 300);
            await new Promise(r => setTimeout(r, 4000));
        }

        // 4. Extract Data
        logger.info('📄 reading details...');

        const data = await page.evaluate(() => {
            const getText = (sel: string) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                return el?.innerText?.trim() ?? '';
            };

            const name = getText('h1.DUwDvf') || getText('h1') || 'Unknown Name';

            const ariaElements = Array.from(document.querySelectorAll('[aria-label]'));

            const phoneEl = ariaElements.find(el => el.getAttribute('aria-label')?.includes('Phone:'));
            const phone = phoneEl ? phoneEl.getAttribute('aria-label')!.replace('Phone:', '').trim() : null;

            const addrEl = ariaElements.find(el => el.getAttribute('aria-label')?.includes('Address:'));
            const address = addrEl ? addrEl.getAttribute('aria-label')!.replace('Address:', '').trim() : 'Tbilisi, Georgia';

            const webEl = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null;
            const website = webEl?.href ?? null;

            return { name, phone, website, address };
        });

        logger.info(`✅ EXTRACTED: ${JSON.stringify(data, null, 2)}`);

        // 5. Save to DB
        if (data.name !== 'Unknown Name') {
            const res = await dbClient.query(`
                INSERT INTO "Lead" (name, phone, email, website, address, source)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id;
            `, [data.name, data.phone, null, data.website, data.address, 'google_maps_fast']);
            logger.info(`💾 Saved ID: ${res.rows[0].id}`);
        } else {
            logger.warn('⚠️ Name extraction failed, skipping DB insert.');
        }

        await browser.close();
        await dbClient.end();

    } catch (error) {
        logger.error('❌ Fatal Error:', error);
        if (dbClient) await dbClient.end();
    }
}

main();
