import { jest } from '@jest/globals';
import { createPool, ensureTable, insertRows } from '../src/db.mjs';

describe('database helpers', () => {
    test('creates a configured pool', async () => {
        const pool = createPool({ host: 'h', user: 'u', password: 'p', database: 'd' });
        expect(pool.pool.config.connectionConfig).toMatchObject({ host: 'h', user: 'u', password: 'p', database: 'd' });
        await pool.end();
    });

    test('ensures a safe table name', async () => {
        const pool = { execute: jest.fn().mockResolvedValue([]) };
        await ensureTable(pool, 'syslog_20260719');
        expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS `syslog_20260719`'));
        expect(pool.execute.mock.calls[0][0]).toContain('transport ENUM(\'tcp\',\'udp\')');
    });

    test('inserts rows in one parameterized batch', async () => {
        const pool = { execute: jest.fn().mockResolvedValue([]) };
        await insertRows(pool, 'syslog_20260719', [
            { transport: 'udp', remoteAddress: '192.0.2.1', remotePort: 514, rawLine: '<1> hello' },
            { transport: 'tcp', remoteAddress: 'unknown', remotePort: null, rawLine: 'second' },
        ]);
        expect(pool.execute).toHaveBeenCalledWith(
            expect.stringContaining('VALUES (?, ?, ?, ?), (?, ?, ?, ?)'),
            ['udp', '192.0.2.1', 514, '<1> hello', 'tcp', 'unknown', null, 'second'],
        );
    });

    test('does not execute an empty insert', async () => {
        const pool = { execute: jest.fn() };
        await insertRows(pool, 'syslog_20260719', []);
        expect(pool.execute).not.toHaveBeenCalled();
    });
});
