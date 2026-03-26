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
    rating?: number | null;
    reviewCount?: number | null;
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
                ...(process.env.PUPPETEER_EXECUTABLE_PATH
                  ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
                  : { channel: 'chrome' }),
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
        const gl = process.env.GOOGLE_MAPS_GL || 'us';
        const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en&gl=${gl}`;
        logger.info(`🔍 Searching: ${url}`);
        await this.page!.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Handle Google GDPR consent page (EU VPS IPs trigger this)
        await this.handleConsentPage();

        // Simulate human behavior after navigation to reduce bot-detection risk
        if (this._stealthBrowser) {
            await this._stealthBrowser.simulateHuman(this.page!, 'high');
        }
    }

    private async handleConsentPage() {
        try {
            const currentUrl = this.page!.url();
            if (currentUrl.includes('consent.google.com')) {
                logger.info('🍪 Google consent page detected, accepting...');
                // Try multiple selectors for the "Accept all" button
                const acceptSelectors = [
                    'button[aria-label="Accept all"]',
                    'form:last-of-type button',
                    'button:has-text("Accept all")',
                    '[data-ved] button',
                ];
                for (const sel of acceptSelectors) {
                    try {
                        const btn = await this.page!.$(sel);
                        if (btn) {
                            await btn.click();
                            await this.page!.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
                            logger.info('✅ Consent accepted, redirected to Maps');
                            return;
                        }
                    } catch { /* try next selector */ }
                }
                // Fallback: click all buttons and find the right one by text
                const buttons = await this.page!.$$('button');
                for (const btn of buttons) {
                    const text = await btn.evaluate((el: Element) => el.textContent?.trim() || '');
                    if (text.toLowerCase().includes('accept')) {
                        await btn.click();
                        await this.page!.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
                        logger.info('✅ Consent accepted via text match');
                        return;
                    }
                }
                logger.warn('⚠️ Could not find consent accept button');
            }
        } catch (err) {
            logger.warn('⚠️ Consent handling error (continuing):', err);
        }
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
        const maxAttempts = 60; // Increased attempts to accommodate explicit mouse scrolls

        // Attempt initial hover over the feed container to focus scroll context
        try {
            await this.page!.hover('div[role="feed"]');
        } catch {
            logger.warn('⚠️ Could not hover over feed container.');
        }

        for (let i = 0; i < maxAttempts; i++) {
            // Hover over the last known result element to keep the mouse in the feed area
            try {
                const elements = await this.page!.$$(resultSelector);
                if (elements.length > 0) {
                    await elements[elements.length - 1].hover();
                }
            } catch {
                // Ignore hover errors if the element disappeared
            }

            // Simulate explicit mouse wheel scroll OR PageDown
            await this.page!.mouse.wheel({ deltaY: 3000 });
            await this.page!.keyboard.press('PageDown');

            try {
                // Wait for the DOM to append new elements OR until SCROLL_DELAY_MS passes
                await this.page!.waitForFunction(
                    (sel: string, prev: number) => document.querySelectorAll(sel).length > prev,
                    { timeout: config.SCROLL_DELAY_MS || 3000 },
                    resultSelector,
                    previousCount
                );
            } catch {
                // Timeout reached and no new elements appeared
            }

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
            
            if (noChangeCount >= 6) {
                // Check if Google Maps explicitly told us there are no more results
                const isEndOfList = await this.page!.evaluate(() => {
                    const markers = Array.from(document.querySelectorAll('span, p, div'));
                    return markers.some(el => el.textContent?.includes("You've reached the end of the list."));
                });

                if (isEndOfList) {
                    logger.info('🛑 Reached the explicit end of the Google Maps list.');
                    break;
                }

                logger.info('🛑 No new results after 6 scrolls. Stopping collection.');
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

        // Simulate human behavior after navigating to each business detail page
        if (this._stealthBrowser) {
            await this._stealthBrowser.simulateHuman(this.page!, 'medium');
        }

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

            // Rating: deterministic extraction via aria-label (same pattern as Phone/Address)
            const ratingEl = ariaElements.find(el => {
                const label = el.getAttribute('aria-label') || '';
                return /[\d.]+\s*star/i.test(label);
            });
            const ratingLabel = ratingEl?.getAttribute('aria-label') || '';
            const ratingParsed = ratingLabel.match(/([\d.]+)\s*star/i);
            const rating = ratingParsed ? parseFloat(ratingParsed[1]) : null;

            // Review Count: deterministic extraction via aria-label
            const reviewEl = ariaElements.find(el => {
                const label = el.getAttribute('aria-label') || '';
                return /[\d,]+\s*review/i.test(label);
            });
            const reviewLabel = reviewEl?.getAttribute('aria-label') || '';
            const reviewParsed = reviewLabel.match(/([\d,]+)\s*review/i);
            const reviewCount = reviewParsed ? parseInt(reviewParsed[1].replace(/,/g, ''), 10) : null;

            return { name, phone, website, address, rating, reviewCount };
        });
    }
}
