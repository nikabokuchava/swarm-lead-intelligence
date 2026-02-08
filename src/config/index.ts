import 'dotenv/config';

interface Config {
    DATABASE_URL: string;
    MAX_RESULTS: number;
    SCROLL_DELAY_MS: number;
    HEADLESS: boolean;
    LOG_FILE: string;
}

function loadConfig(): Config {
    const DATABASE_URL = process.env.DATABASE_URL;
    
    if (!DATABASE_URL) {
        throw new Error('❌ DATABASE_URL environment variable is required. Please check your .env file.');
    }

    return {
        DATABASE_URL,
        MAX_RESULTS: parseInt(process.env.MAX_RESULTS || '20', 10),
        SCROLL_DELAY_MS: parseInt(process.env.SCROLL_DELAY_MS || '1200', 10),
        HEADLESS: process.env.HEADLESS === 'true',
        LOG_FILE: process.env.LOG_FILE || 'scraper.log'
    };
}

export const config = loadConfig();
