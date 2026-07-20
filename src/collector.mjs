import dgram from 'node:dgram';
import net from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import { RowBuffer } from './buffer.mjs';
import { ensureTable, insertRows } from './db.mjs';
import { getTableName } from './table.mjs';

function splitTcpBuffer(socketState, chunk) {
    socketState.buffer += socketState.decoder.write(chunk);
    const lines = [];

    while (true) {
        const newlineIndex = socketState.buffer.indexOf('\n');
        if (newlineIndex === -1) {
            break;
        }

        const line = socketState.buffer.slice(0, newlineIndex).replace(/\r$/, '');
        lines.push(line);
        socketState.buffer = socketState.buffer.slice(newlineIndex + 1);
    }

    return lines;
}

function buildRow({ transport, remoteAddress, remotePort, rawLine, tableName }) {
    return {
        transport,
        /* istanbul ignore next -- socket addresses are supplied by Node */
        remoteAddress: remoteAddress || 'unknown',
        /* istanbul ignore next -- socket ports are supplied by Node */
        remotePort: remotePort ?? null,
        rawLine,
        tableName,
    };
}

export function createCollector({ pool, port, log }) {
    const buffer = new RowBuffer();
    const activeTables = new Set();
    let tcpServer;
    let udpServer;
    let flushTimer;
    let flushing = false;
    let tickRunning = false;
    let currentTable = null;

    async function ensureCurrentTable(tableName) {
        if (activeTables.has(tableName)) {
            return;
        }
        await ensureTable(pool, tableName);
        activeTables.add(tableName);
        log.info(`Active syslog table: ${tableName}`);
    }

    async function refreshCurrentTable() {
        const tableName = getTableName(new Date());
        if (tableName !== currentTable) {
            await ensureCurrentTable(tableName);
            currentTable = tableName;
        }
    }

    async function flushBuffer() {
        if (flushing) {
            return;
        }

        flushing = true;
        try {
            const items = buffer.drain();
            if (!items.length) {
                return;
            }

            const grouped = new Map();
            for (const item of items) {
                if (!grouped.has(item.tableName)) {
                    grouped.set(item.tableName, []);
                }
                grouped.get(item.tableName).push(item);
            }

            const failed = [];
            for (const [tableName, rows] of grouped) {
                try {
                    await ensureCurrentTable(tableName);
                    await insertRows(pool, tableName, rows);
                } catch (error) {
                    log.error(`Failed to flush ${rows.length} syslog rows to ${tableName}`, error?.message || error);
                    failed.push(...rows);
                }
            }

            /* istanbul ignore else -- failures are retried through the same path */
            if (failed.length) {
                buffer.prepend(failed);
            }
        } finally {
            flushing = false;
        }
    }

    function enqueueMessage({ transport, remoteAddress, remotePort, rawLine }) {
        const tableName = getTableName(new Date());
        buffer.push(buildRow({ transport, remoteAddress, remotePort, rawLine, tableName }));
    }

    function startTcp() {
        tcpServer = net.createServer((socket) => {
            const state = {
                buffer: '',
                decoder: new StringDecoder('utf8'),
            };
            socket.setNoDelay(true);

            socket.on('data', (chunk) => {
                const lines = splitTcpBuffer(state, chunk);
                for (const line of lines) {
                    enqueueMessage({
                        transport: 'tcp',
                        remoteAddress: socket.remoteAddress,
                        remotePort: socket.remotePort,
                        rawLine: line,
                    });
                }
            });

            socket.on('end', () => {
                state.buffer += state.decoder.end();
                const tail = state.buffer.replace(/\r$/, '');
                if (tail.length) {
                    enqueueMessage({
                        transport: 'tcp',
                        remoteAddress: socket.remoteAddress,
                        remotePort: socket.remotePort,
                        rawLine: tail,
                    });
                }
            });

            /* istanbul ignore next -- exercised only by peer/socket failures */
            socket.on('error', (error) => {
                log.error('TCP socket error', error?.message || error);
            });
        });

        /* istanbul ignore next -- bind/runtime failures are reported by the promise */
        tcpServer.on('error', (error) => {
            log.error('TCP server error', error?.message || error);
        });

        return new Promise((resolve, reject) => {
            tcpServer.once('listening', resolve);
            tcpServer.once('error', reject);
            tcpServer.listen(port, '0.0.0.0');
        });
    }

    function startUdp() {
        udpServer = dgram.createSocket('udp4');

        udpServer.on('message', (message, rinfo) => {
            enqueueMessage({
                transport: 'udp',
                remoteAddress: rinfo.address,
                remotePort: rinfo.port,
                rawLine: message.toString('utf8'),
            });
        });

        /* istanbul ignore next -- exercised only by bind/runtime failures */
        udpServer.on('error', (error) => {
            log.error('UDP server error', error?.message || error);
        });

        return new Promise((resolve, reject) => {
            udpServer.once('listening', resolve);
            udpServer.once('error', reject);
            udpServer.bind(port, '0.0.0.0');
        });
    }

    async function tick() {
        /* istanbul ignore next -- defensive interval re-entry guard */
        if (tickRunning) {
            return;
        }
        tickRunning = true;
        try {
            await refreshCurrentTable();
            await flushBuffer();
        } finally {
            tickRunning = false;
        }
    }

    async function start() {
        await refreshCurrentTable();
        await startTcp();
        await startUdp();
        flushTimer = setInterval(() => {
            void tick();
        }, 50);
        log.info(`Syslog collector listening on TCP/UDP ${port}`);
    }

    async function shutdown() {
        clearInterval(flushTimer);

        await new Promise((resolve) => {
            if (!tcpServer) {
                resolve();
                return;
            }
            tcpServer.close(() => resolve());
        });

        await new Promise((resolve) => {
            if (!udpServer) {
                resolve();
                return;
            }
            udpServer.close(() => resolve());
        });

        for (let i = 0; i < 20 && buffer.size() > 0; i += 1) {
            await flushBuffer();
            if (buffer.size() > 0) {
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }

        await flushBuffer(true);
    }

    return {
        start,
        shutdown,
    };
}
