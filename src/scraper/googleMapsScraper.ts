import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Puppeteer from 'puppeteer';
import { config } from '../config/index.js';
import { createAppLogger } from '../utils/logger.js';
import { StealthBrowser } from './stealthBrowser.js';

type Browser = Awaited<ReturnType<typeof Puppeteer.launch>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;

// Standalone puppeteer instance (only used when no StealthBrowser is injected)
const standalonePuppeteer = (puppeteerExtra.default || puppeteerExtra) as any;
standalonePuppeteer.use(StealthPlugin());

const logger = createAppLogger();

export interface GoogleMapsResult {
    name: string;
    phone: string | null;
    website: string | null;
    address: string | null;
}

/**
 * ARC-02: GoogleMapsScraper now accepts an external StealthBrowser instance.
 * 
 * - When stealthBrowser is provided: reuses the caller's Chromium process.
 *   `close()` only closes our page, not the whole browser.
 * - When not provided: launches its own browser (CLI / backward-compat mode).
 *   `close()` shuts down that browser.
 */
export class GoogleMapsScraper {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private _stealthBrowser: StealthBrowser | null = null;
    private _ownsBrowser = true;

    constructor() {}

    async init(headless: boolean = true, stealthBrowser?: StealthBrowser) {
        if (stealthBrowser) {
            // Shared-browser mode: reuse caller's StealthBrowser
            this._stealthBrowser = stealthBrowser;
            this._ownsBrowser = false;
            this.page = await stealthBrowser.createPage();
        } else {
            // Standalone mode: launch own browser (CLI backward-compat)
            this._ownsBrowser = true;
            this.browser = await standalonePuppeteer.launch({
                channel: 'chrome',
                headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=en-US']
            }) as Browser;
            this.page = await this.browser.newPage();
        }

        // Fix for: ReferenceError: __name is not defined
        await this.page.evaluateOnNewDocument(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).__name = (fn: unknown) => fn;
        });
    }

    async close() {
        if (this._stealthBrowser && this.page) {
            // Shared-browser mode: close only our page
            await this._stealthBrowser.closePage(this.page);
            this.page = null;
            this._stealthBrowser = null;
        } else if (this._ownsBrowser && this.browser) {
            // Standalone mode: tear down whole browser
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    async search(query: string) {
        const url = `https://www.google.com/maps/search/${query.replace(/ /g, '+')}?hl=en`;
        logger.info(`🔍 Searching: ${url}`);
        await this.page!.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }

    async collectResultLinks(maxResults: number): Promise<string[]> {
        logger.info('📜 Starting to collect result links...');
        const resultSelector = 'a.hfpxzc';
        
        try {
            await this.page!.waitForSelector('div[role="feed"]', { timeout: 60000 });
            await this.page!.waitForSelector(resultSelector, { timeout: 60000 });
        } catch {
            logger.warn('⚠️ Feed or results container not found immediately.');
            return [];
        }

        let previousCount = 0;
        let noChangeCount = 0;
        const maxAttempts = 30;

        for (let i = 0; i < maxAttempts; i++) {
            await this.page!.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) feed.scrollTop = feed.scrollHeight;
            });

            await new Promise(r => setTimeout(r, config.SCROLL_DELAY_MS));

            const currentLinks = await this.page!.evaluate((sel: string) => {
                return document.querySelectorAll(sel).length;
            }, resultSelector);

            logger.info(`🔄 Scrolling... Current links: ${currentLinks} (attempt ${i + 1}/${maxAttempts})`);

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

        const hrefs = await this.page!.evaluate((sel: string) => {
            const elements = Array.from(document.querySelectorAll(sel)) as HTMLAnchorElement[];
            return elements.map(el => el.href).filter(href => href && href.length > 0);
        }, resultSelector);

        const uniqueHrefs = [...new Set(hrefs as string[])];
        logger.info(`✅ Collected ${uniqueHrefs.length} unique links.`);
        return uniqueHrefs.slice(0, maxResults);
    }

    async extractDetails(href: string): Promise<GoogleMapsResult> {
        logger.info(`👉 Processing: ${href}`);
        await this.page!.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 });

        try {
            await this.page!.waitForSelector('h1.DUwDvf', { timeout: 15000 });
        } catch {
            try {
                await this.page!.waitForSelector('h1', { timeout: 5000 });
            } catch {
                logger.warn('⚠️ Header not found, extraction might be partial.');
            }
        }

        return await this.page!.evaluate(() => {
            const getText = (sel: string) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                return el?.innerText?.trim() ?? '';
            };

            const name = getText('h1.DUwDvf') || getText('h1') || 'Unknown Name';

            const ariaElements = Array.from(document.querySelectorAll('[aria-label]'));
            const phoneEl = ariaElements.find(el => el.getAttribute('aria-label')?.includes('Phone:'));
            const phone = phoneEl ? phoneEl.getAttribute('aria-label')!.replace('Phone:', '').trim() : null;

            const addrEl = ariaElements.find(el => el.getAttribute('aria-label')?.includes('Address:'));
            const address = addrEl ? addrEl.getAttribute('aria-label')!.replace('Address:', '').trim() : null;

            const webEl = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null;
            const website = webEl?.href ?? null;

            return { name, phone, website, address };
        });
    }
}
