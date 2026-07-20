#!/usr/bin/env node
import 'dotenv/config';
import { createPool } from './src/db.mjs';
import { loadConfig } from './src/config.mjs';
import { createCollector } from './src/collector.mjs';

function createLogger() {
    return {
        info: (...args) => console.log('[info]', ...args),
        error: (...args) => console.error('[error]', ...args),
    };
}

const log = createLogger();
const config = loadConfig();
const pool = createPool(config.mysql);
const collector = createCollector({ pool, port: config.port, log });

async function shutdown(signal) {
    log.info(`Shutting down on ${signal}`);
    try {
        await collector.shutdown();
    } finally {
        await pool.end();
    }
    process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
    log.error('Uncaught exception', error?.stack || error?.message || error);
});
process.on('unhandledRejection', (error) => {
    log.error('Unhandled rejection', error?.stack || error?.message || error);
});

await collector.start();
