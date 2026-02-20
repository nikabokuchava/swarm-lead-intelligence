import * as winston from 'winston';
import { config } from '../config/index.js';

/**
 * Creates a Winston logger instance with console + file transports.
 * @param logFile - Override filename (defaults to config.LOG_FILE → 'scraper.log')
 */
export function createAppLogger(logFile?: string): winston.Logger {
    const filename = logFile ?? config.LOG_FILE;

    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, level, message }) => {
                        return `[${timestamp}] ${level}: ${message}`;
                    })
                )
            }),
            new winston.transports.File({ filename })
        ]
    });
}

/** Default shared logger (uses config.LOG_FILE) */
export const logger = createAppLogger();
