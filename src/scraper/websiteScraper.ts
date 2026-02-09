/**
 * Website Scraper
 * Visits company websites to extract emails
 */

import { extractEmailsFromHtml, getBestEmail, getAllEmails } from '../utils/emailExtractor.js';

interface ScrapedEmailResult {
    primaryEmail: string | null;
    allEmails: string[];
    pagesScraped: string[];
    error?: string;
}

// Pages to check for contact info
const CONTACT_PAGES = [
    '',           // homepage
    '/contact',
    '/contact-us',
    '/kontakt',
    '/about',
    '/about-us',
    '/imprint',
    '/impressum',
];

/**
 * Scrape emails from a company website
 */
export async function scrapeEmailsFromWebsite(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    page: any,
    websiteUrl: string,
    maxPages = 3
): Promise<ScrapedEmailResult> {
    const result: ScrapedEmailResult = {
        primaryEmail: null,
        allEmails: [],
        pagesScraped: [],
    };

    if (!websiteUrl) {
        result.error = 'No website URL provided';
        return result;
    }

    // Normalize URL
    let baseUrl = websiteUrl;
    if (!baseUrl.startsWith('http')) {
        baseUrl = 'https://' + baseUrl;
    }
    
    // Remove trailing slash
    baseUrl = baseUrl.replace(/\/$/, '');

    const allExtractedEmails: ReturnType<typeof extractEmailsFromHtml> = [];
    let pagesChecked = 0;

    for (const path of CONTACT_PAGES) {
        if (pagesChecked >= maxPages) break;

        const targetUrl = baseUrl + path;
        
        try {
            // Navigate with timeout
            await page.goto(targetUrl, { 
                waitUntil: 'domcontentloaded', 
                timeout: 10000 
            });

            // Wait a bit for JS to render
            await new Promise(r => setTimeout(r, 500));

            // Get page content
            const html = await page.content();
            
            // Extract emails
            const emails = extractEmailsFromHtml(html);
            allExtractedEmails.push(...emails);
            
            result.pagesScraped.push(targetUrl);
            pagesChecked++;

            // Small delay between pages
            await new Promise(r => setTimeout(r, 800));

        } catch {
            // Page might not exist, continue to next
            continue;
        }
    }

    // Deduplicate and get results
    const uniqueEmails = [...new Set(getAllEmails(allExtractedEmails))];
    result.allEmails = uniqueEmails;
    result.primaryEmail = getBestEmail(allExtractedEmails);

    return result;
}

/**
 * Create a new browser page configured for email scraping
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createEmailScraperPage(browser: any) {
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block unnecessary resources for faster loading
    await page.setRequestInterception(true);
    page.on('request', (req: { resourceType: () => string; abort: () => void; continue: () => void }) => {
        const type = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    return page;
}
