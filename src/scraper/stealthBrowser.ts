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

  get openPagesCount() {
    return this.pages.length;
  }

  isConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  async launch() {
    if (this.browser) return;

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
    ];

    if (process.env.PROXY_SERVER) {
      args.push(`--proxy-server=${process.env.PROXY_SERVER}`);
    }

    this.browser = await puppeteer.launch({
      channel: 'chrome',
      headless: true,
      protocolTimeout: 120000,
      args,
    });
  }

  async createPage(): Promise<Page> {
    if (!this.browser) await this.launch();
    
    const page = await this.browser!.newPage();
    
    // Handle Proxy Authentication
    if (process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
      await page.authenticate({
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
      });
    }

    // Enable request interception for bandwidth optimization
    await page.setRequestInterception(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page.on('request', (req: any) => {
      const resourceType = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

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

  async simulateHuman(page: Page, fastMode: boolean = false) {
      // Random mouse movement
      await page.mouse.move(
          Math.random() * 1000, 
          Math.random() * 1000
      );
      
      // Random scroll
      await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight / 2);
      });
      
      // Random delay (1-3 seconds normal, 0.3-1s fast)
      const delay = fastMode 
          ? Math.floor(Math.random() * 700) + 300 
          : Math.floor(Math.random() * 2000) + 1000;
          
      await new Promise(r => setTimeout(r, delay));
  }
}
