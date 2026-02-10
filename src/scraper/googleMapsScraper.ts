import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from '../config/index.js';
import * as winston from 'winston';

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
        new winston.transports.File({ filename: config.LOG_FILE })
    ]
});

export interface GoogleMapsResult {
    name: string;
    phone: string | null;
    website: string | null;
    address: string | null;
}

export class GoogleMapsScraper {
    private browser: any;
    private page: any;

    constructor() {}

    async init(headless: boolean = true) {
        this.browser = await puppeteer.launch({
            headless: headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US']
        });
        this.page = await this.browser.newPage();
        
        // Fix for: ReferenceError: __name is not defined
        await this.page.evaluateOnNewDocument(() => {
            (globalThis as any).__name = (fn: any) => fn;
        });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async search(query: string) {
        const url = `https://www.google.com/maps/search/${query.replace(/ /g, '+')}?hl=en`;
        logger.info(`🔍 Searching: ${url}`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }

    async collectResultLinks(maxResults: number): Promise<string[]> {
        logger.info('📜 Starting to collect result links...');
        const resultSelector = 'a.hfpxzc';
        
        try {
            await this.page.waitForSelector('div[role="feed"]', { timeout: 15000 });
            await this.page.waitForSelector(resultSelector, { timeout: 10000 });
        } catch {
            logger.warn('⚠️ Feed or results container not found immediately.');
            return [];
        }

        let previousCount = 0;
        let noChangeCount = 0;
        const maxAttempts = 30;

        for (let i = 0; i < maxAttempts; i++) {
            await this.page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) {
                    feed.scrollTop = feed.scrollHeight;
                }
            });

            await new Promise(r => setTimeout(r, config.SCROLL_DELAY_MS));

            const currentLinks = await this.page.evaluate((sel: string) => {
                return document.querySelectorAll(sel).length;
            }, resultSelector);

            logger.info(`🔄 Scroll attempt ${i + 1}: Found ${currentLinks} links`);

            if (currentLinks === previousCount) {
                noChangeCount++;
            } else {
                noChangeCount = 0;
            }

            previousCount = currentLinks;

            if (currentLinks >= maxResults) {
                logger.info('🎯 Reached max results limit.');
                break;
            }

            if (noChangeCount >= 3) {
                logger.info('🛑 No new results after 3 scrolls. Stopping collection.');
                break;
            }
        }

        const hrefs = await this.page.evaluate((sel: string) => {
            const elements = Array.from(document.querySelectorAll(sel)) as HTMLAnchorElement[];
            return elements.map(el => el.href).filter(href => href && href.length > 0);
        }, resultSelector);

        const uniqueHrefs = [...new Set(hrefs as string[])];
        logger.info(`✅ Collected ${uniqueHrefs.length} unique links.`);
        return uniqueHrefs.slice(0, maxResults);
    }

    async extractDetails(href: string): Promise<GoogleMapsResult> {
        logger.info(`👉 Processing: ${href}`);
        await this.page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });

        try {
            await this.page.waitForSelector('h1.DUwDvf', { timeout: 8000 });
        } catch {
            try {
                await this.page.waitForSelector('h1', { timeout: 3000 });
            } catch {
                logger.warn('⚠️ Header not found, extraction might be partial.');
            }
        }

        return await this.page.evaluate(() => {
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
    }
}
