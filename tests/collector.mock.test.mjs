import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';

const state = {};

class FakeServer extends EventEmitter {
    listen() { queueMicrotask(() => this.emit('listening')); }
    close(callback) { callback?.(); }
}

class FakeSocket extends EventEmitter {
    constructor() {
        super();
        this.remoteAddress = undefined;
        this.remotePort = undefined;
    }
    setNoDelay() {}
}

class FakeUdp extends EventEmitter {
    bind() { queueMicrotask(() => this.emit('listening')); }
    close(callback) { callback?.(); }
}

jest.unstable_mockModule('node:net', () => ({
    default: { createServer: (handler) => { state.tcpHandler = handler; state.tcp = new FakeServer(); return state.tcp; } },
}));
jest.unstable_mockModule('node:dgram', () => ({
    default: { createSocket: () => { state.udp = new FakeUdp(); return state.udp; } },
}));
jest.unstable_mockModule('../src/db.mjs', () => ({
    ensureTable: jest.fn().mockResolvedValue(undefined),
    insertRows: jest.fn(),
}));

const { createCollector } = await import('../src/collector.mjs');
const { insertRows } = await import('../src/db.mjs');


describe('collector defensive paths', () => {
    beforeEach(() => {
        insertRows.mockReset();
        insertRows.mockResolvedValue(undefined);
        state.tcp = null;
        state.udp = null;
    });


    test('handles missing socket address data and socket/server errors', async () => {
        const log = { info: jest.fn(), error: jest.fn() };
        const collector = createCollector({ pool: {}, port: 514, log });
        await collector.start();

        const socket = new FakeSocket();
        state.tcpHandler(socket);
        socket.emit('data', Buffer.from('fallback\n'));
        socket.emit('end');
        socket.emit('error', new Error('socket failed'));
        state.tcp.emit('error', new Error('tcp failed'));
        state.udp.emit('error', new Error('udp failed'));
        await collector.shutdown();

        expect(insertRows).toHaveBeenCalledWith(expect.anything(), expect.any(String), expect.arrayContaining([
            expect.objectContaining({ remoteAddress: 'unknown', remotePort: null, rawLine: 'fallback' }),
        ]));
        expect(log.error).toHaveBeenCalledWith('TCP socket error', 'socket failed');
        expect(log.error).toHaveBeenCalledWith('TCP server error', 'tcp failed');
        expect(log.error).toHaveBeenCalledWith('UDP server error', 'udp failed');
    });

    test('covers string flush errors', async () => {
        insertRows.mockRejectedValue('database down');
        const collector = createCollector({ pool: {}, port: 514, log: { info: jest.fn(), error: jest.fn() } });
        await collector.start();
        state.udp.emit('message', Buffer.from('bad'), { address: '127.0.0.1', port: 514 });
        await new Promise((resolve) => setTimeout(resolve, 80));
        await collector.shutdown();
    });

    test('skips overlapping flushes', async () => {
        let release;
        insertRows.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
        const collector = createCollector({ pool: {}, port: 514, log: { info: jest.fn(), error: jest.fn() } });
        await collector.start();
        state.udp.emit('message', Buffer.from('slow'), { address: '127.0.0.1', port: 514 });

        await new Promise((resolve) => {
            const check = () => insertRows.mock.calls.length ? resolve() : setTimeout(check, 5);
            check();
        });
        const shutdown = collector.shutdown();
        await new Promise((resolve) => setTimeout(resolve, 10));
        release();
        await shutdown;
    });
});
