import puppeteerExtra from 'puppeteer-extra';
const puppeteer = puppeteerExtra.default || puppeteerExtra; // Handle ESM/CJS interop if needed, or just use puppeteerExtra
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

// Apply stealth plugin
puppeteer.use(StealthPlugin());

export class StealthBrowser {
  private browser: Browser | null = null;
  private pages: Page[] = [];

  constructor() {}

  async launch() {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      channel: 'chrome',
      headless: true, // Use 'new' or true based on version, stealth plugin handles detection
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });
  }

  async createPage(): Promise<Page> {
    if (!this.browser) await this.launch();
    
    const page = await this.browser!.newPage();
    
    // Stealth Evasion: Set a consistent User Agent behavior
    // We rely on the Stealth Plugin to handle navigator.webdriver and other overrides.
    // However, we can set a realistic User Agent if needed, but ensure it matches the platform/locale
    // handled by the plugin. For now, we trust the plugin's defaults or can utilize
    // page.setUserAgent ONLY if we know it won't break the plugin's heuristics.
    // The plugin docs suggest leaving it to the plugin or being very careful.
    
    // Add random mouse movements and scrolling to simulate human behavior
    // This will be called by the scraper logic on specific pages.
    
    this.pages.push(page);
    return page;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages = [];
    }
  }

  // Helper to mimic human behavior
  async simulateHuman(page: Page) {
      // Random mouse movement
      await page.mouse.move(
          Math.random() * 1000, 
          Math.random() * 1000
      );
      
      // Random scroll
      await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight / 2);
      });
      
      // Random delay
      const delay = Math.floor(Math.random() * 2000) + 1000;
      await new Promise(r => setTimeout(r, delay));
  }
}
