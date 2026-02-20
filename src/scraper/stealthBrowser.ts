import puppeteerExtra from 'puppeteer-extra';
const puppeteer = puppeteerExtra.default || puppeteerExtra;
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Puppeteer from 'puppeteer';

type Browser = Awaited<ReturnType<typeof Puppeteer.launch>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;

// Apply stealth plugin
puppeteer.use(StealthPlugin());

// Realistic User-Agent rotation pool (Chrome 120+ on Windows/Mac)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
];

function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export class StealthBrowser {
  private browser: Browser | null = null;
  private pages: Page[] = [];

  constructor() {}

  async launch() {
    if (this.browser) return;

    this.browser = await puppeteer.launch({
      channel: 'chrome',
      headless: true,
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
    
    // Rotate User-Agent per page session
    const ua = getRandomUserAgent();
    await page.setUserAgent(ua);

    // Set realistic viewport
    await page.setViewport({
        width: 1366 + Math.floor(Math.random() * 200),
        height: 768 + Math.floor(Math.random() * 100),
    });
    
    this.pages.push(page);

    // ARC-10: Auto-remove page from tracking array when it closes
    page.once('close', () => {
      this.pages = this.pages.filter(p => p !== page);
    });

    return page;
  }

  /** Close a single page and let the event listener clean up tracking */
  async closePage(page: Page): Promise<void> {
    try {
      await page.close();
    } catch {
      // Page may already be closed — ignore
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages = [];
    }
  }

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
      
      // Random delay (1-3 seconds)
      const delay = Math.floor(Math.random() * 2000) + 1000;
      await new Promise(r => setTimeout(r, delay));
  }
}
