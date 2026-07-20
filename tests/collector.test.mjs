import { jest } from '@jest/globals';
import dgram from 'node:dgram';
import net from 'node:net';
import { createCollector } from '../src/collector.mjs';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function unusedPort() {
    const server = net.createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    await new Promise((resolve) => server.close(resolve));
    return port;
}

async function connectTcp(port, data) {
    await new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => socket.end(data));
        socket.on('close', resolve);
        socket.on('error', reject);
    });
}

async function sendUdp(port, data) {
    const socket = dgram.createSocket('udp4');
    await new Promise((resolve, reject) => socket.send(data, port, '127.0.0.1', (error) => error ? reject(error) : resolve()));
    socket.close();
}

describe('collector', () => {
    test('receives TCP lines and UDP datagrams, then batches them', async () => {
        const pool = { execute: jest.fn().mockResolvedValue([]) };
        const log = { info: jest.fn(), error: jest.fn() };
        const collector = createCollector({ pool, port: await unusedPort(), log });
        await collector.start();
        try {
            await connectTcp(collectorPort(log), 'first\r\nsecond\n');
            await sendUdp(collectorPort(log), '<5> datagram');
            await wait(150);
            const inserts = pool.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
            expect(inserts).toHaveLength(1);
            expect(inserts[0][1]).toEqual(expect.arrayContaining(['tcp', 'first', 'tcp', 'second', 'udp', '<5> datagram']));
        } finally {
            await collector.shutdown();
        }
    });
});

// The collector API intentionally exposes no bound-port accessor; tests use the port logged at startup.
function collectorPort(log) {
    const message = log.info.mock.calls.find(([value]) => value.startsWith('Syslog collector listening'))[0];
    return Number(message.match(/ (\d+)$/)[1]);
}

test('flushes an unterminated TCP line during shutdown', async () => {
    const pool = { execute: jest.fn().mockResolvedValue([]) };
    const log = { info: jest.fn(), error: jest.fn() };
    const collector = createCollector({ pool, port: await unusedPort(), log });
    await collector.start();
    await connectTcp(collectorPort(log), 'tail');
    await collector.shutdown();
    expect(pool.execute.mock.calls.some(([sql, params]) => sql.startsWith('INSERT') && params.includes('tail'))).toBe(true);
});

test('retains rows and logs when a flush fails', async () => {
    const pool = { execute: jest.fn().mockResolvedValueOnce([]).mockRejectedValue(new Error('database down')) };
    const log = { info: jest.fn(), error: jest.fn() };
    const collector = createCollector({ pool, port: await unusedPort(), log });
    await collector.start();
    try {
        await sendUdp(collectorPort(log), 'will fail');
        await wait(100);
        expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to flush'), 'database down');
    } finally {
        await collector.shutdown();
    }
});

test('can shut down before starting', async () => {
    const collector = createCollector({ pool: {}, port: await unusedPort(), log: { info: jest.fn(), error: jest.fn() } });
    await expect(collector.shutdown()).resolves.toBeUndefined();
});

test('rejects a conflicting TCP port and logs the server error', async () => {
    const port = await unusedPort();
    const first = createCollector({ pool: { execute: jest.fn().mockResolvedValue([]) }, port, log: { info: jest.fn(), error: jest.fn() } });
    const secondLog = { info: jest.fn(), error: jest.fn() };
    const second = createCollector({ pool: { execute: jest.fn().mockResolvedValue([]) }, port, log: secondLog });
    await first.start();
    try {
        await expect(second.start()).rejects.toThrow();
        expect(secondLog.error).toHaveBeenCalledWith('TCP server error', expect.any(String));
    } finally {
        await second.shutdown();
        await first.shutdown();
    }
});
