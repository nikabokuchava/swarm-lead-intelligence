/**
 * Website Scraper - Agentic Implementation
 * Uses Stealth Browser and Hybrid Parsing to extracting emails
 */

import { StealthBrowser } from './stealthBrowser.js'; 
import { HybridParser } from '../utils/hybridParser.js';
import { Page } from 'puppeteer';

interface ScrapedEmailResult {
    primaryEmail: string | null;
    allEmails: string[];
    pagesScraped: string[];
    error?: string;
    details?: { email: string; confidence: number; source: string; type?: string }[];
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
 * Scrape emails from a company website using Stealth Agent
 */
// Helper to extract relevant internal links
async function findInternalContactLinks(page: Page, baseUrl: string): Promise<string[]> {
    const links = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        return anchors
            .map(a => a.href)
            .filter(href => href && href.length > 0);
    });

    const uniqueLinks = new Set<string>();
    const baseDomain = new URL(baseUrl).hostname;

    for (const link of links) {
        try {
            const url = new URL(link);
            // Must be same domain
            if (url.hostname !== baseDomain && !url.hostname.endsWith('.' + baseDomain)) {
                continue;
            }
            
            // Keywords to look for
            const lowerHref = link.toLowerCase();
            if (
                lowerHref.includes('contact') || 
                lowerHref.includes('about') || 
                lowerHref.includes('team') || 
                lowerHref.includes('impressum') ||
                lowerHref.includes('legal')
            ) {
                uniqueLinks.add(link);
            }
        } catch {
            // Invalid URL, ignore
        }
    }
    
    return Array.from(uniqueLinks);
}

/**
 * Scrape emails from a company website using Stealth Agent & Deep Crawl
 */
export async function scrapeEmailsFromWebsite(
    providedBrowser: StealthBrowser | null, 
    websiteUrl: string,
    maxPages = 3
): Promise<ScrapedEmailResult> {
    const result: ScrapedEmailResult = {
        primaryEmail: null,
        allEmails: [],
        pagesScraped: [],
        details: []
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
    baseUrl = baseUrl.replace(/\/$/, '');

    // Initialize tools
    const browser = providedBrowser || new StealthBrowser(); // Fallback if not provided
    const parser = new HybridParser();
    
    const allFindings: { email: string; confidence: number; source: string; type?: string }[] = [];
    const visitedUrls = new Set<string>();
    const urlsToVisit: string[] = [baseUrl]; // Start with homepage

    // Add default contact pages as candidates
    for (const path of CONTACT_PAGES) {
        if (path) urlsToVisit.push(baseUrl + path);
    }

    let pagesChecked = 0;

    let page: Page | null = null;

    try {
        page = await browser.createPage();

        while (urlsToVisit.length > 0 && pagesChecked < maxPages) {
            const targetUrl = urlsToVisit.shift()!;
            
            // Avoid duplicates
            if (visitedUrls.has(targetUrl)) continue;
            visitedUrls.add(targetUrl);

            try {
                if (process.env.DEBUG) console.log(`[DeepCrawl] Visiting: ${targetUrl}`);
                
                // Navigate with human-like behavior
                await page.goto(targetUrl, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 15000 
                });

                // Simulate human reading
                await browser.simulateHuman(page);

                // Get page content
                const html = await page.content();
                
                // Extract emails using Hybrid Parser
                const extracted = await parser.extract(html, false); 
                
                if (extracted.length > 0) {
                    allFindings.push(...extracted);
                    if (process.env.DEBUG) console.log(`[DeepCrawl] Found ${extracted.length} emails on ${targetUrl}`);
                }

                // Deep Crawl: If we are on the homepage, look for more links
                if (targetUrl === baseUrl && pagesChecked === 0) {
                    const foundLinks = await findInternalContactLinks(page, baseUrl);
                    if (process.env.DEBUG) console.log(`[DeepCrawl] Found ${foundLinks.length} relevant internal links.`);
                    
                    // Add found links to the queue (prioritize them)
                    for (const link of foundLinks) {
                        if (!visitedUrls.has(link) && !urlsToVisit.includes(link)) {
                            urlsToVisit.push(link);
                        }
                    }
                }
                
                result.pagesScraped.push(targetUrl);
                pagesChecked++;

            } catch (err: unknown) {
               const errorMessage = err instanceof Error ? err.message : String(err);
               if (process.env.DEBUG) console.warn(`[DeepCrawl] Failed to visit ${targetUrl}: ${errorMessage}`);
               continue;
            }
        }

    } catch (fatalError: unknown) {
        const msg = fatalError instanceof Error ? fatalError.message : String(fatalError);
        result.error = `Scraping failed: ${msg}`;
        result.allEmails = []; // Ensure empty array on failure
    } finally {
        // Cleanup - CRITICAL for memory leak prevention
        if (page) {
            try {
                await page.close();
            } catch (e) { /* ignore close errors */ }
        }
    }

    // Deduplicate logic
    const uniqueMap = new Map<string, typeof allFindings[0]>();
    for (const item of allFindings) {
        if (!uniqueMap.has(item.email)) {
            uniqueMap.set(item.email, item);
        } else {
            const existing = uniqueMap.get(item.email)!;
            // Merge generic/personal if one is unknown? For now just take higher confidence.
            if (item.confidence > existing.confidence) {
                uniqueMap.set(item.email, item);
            }
        }
    }

    const uniqueResults = Array.from(uniqueMap.values());
    result.allEmails = uniqueResults.map(r => r.email);
    result.details = uniqueResults;
    
    // Sort by confidence
    const bestMatch = uniqueResults.sort((a, b) => b.confidence - a.confidence)[0];
    result.primaryEmail = bestMatch ? bestMatch.email : null;

    return result;
}

