import { scrapeEmailsFromWebsite } from '../src/scraper/websiteScraper.js';
import { StealthBrowser } from '../src/scraper/stealthBrowser.js';

async function testDeepCrawl() {
    console.log('🧪 Starting Deep Crawl Test...');
    
    // Target: W3C - has plenty of "About", "Team", "Contact" links
    const TEST_URL = 'https://www.w3.org/'; 
    
    console.log(`🌐 Target: ${TEST_URL}`);

    const browser = new StealthBrowser();
    await browser.launch();
    console.log('✅ Browser launched');

    try {
        const result = await scrapeEmailsFromWebsite(browser, TEST_URL, 2); // Max 2 pages
        
        console.log('\n📊 Extraction Results:');
        console.log(`📧 Primary Email: ${result.primaryEmail}`);
        console.log(`ALL Emails:`, result.allEmails);
        console.log(`📄 Pages Scraped (${result.pagesScraped.length}):`, result.pagesScraped);
        console.log(`🔍 Details:`, JSON.stringify(result.details, null, 2));

        if (result.pagesScraped.length > 1) {
            console.log('\n✅ Deep Crawl SUCCESS: Visited multiple pages.');
        } else {
            console.warn('\n⚠️ Deep Crawl WARNING: Only visited homepage.');
        }

    } catch (error) {
        console.error('❌ Test Failed:', error);
    } finally {
        await browser.close();
        console.log('🔒 Browser closed');
    }
}

testDeepCrawl();
