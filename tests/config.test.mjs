import { loadConfig } from '../src/config.mjs';

describe('loadConfig', () => {
    const original = process.env;
    beforeEach(() => { process.env = { ...original }; });
    afterAll(() => { process.env = original; });

    test('loads mysql settings and defaults PORT to 514', () => {
        delete process.env.PORT;
        process.env.MYSQL_HOSTNAME = 'mysql';
        process.env.MYSQL_USERNAME = 'syslog';
        process.env.MYSQL_PASSWORD = 'secret';
        process.env.MYSQL_DATABASE = 'logs';
        expect(loadConfig()).toEqual({
            port: 514,
            mysql: { host: 'mysql', user: 'syslog', password: 'secret', database: 'logs' },
        });
    });

    test.each(['0', '65536', 'not-a-port'])('rejects invalid PORT %s', (port) => {
        Object.assign(process.env, {
            PORT: port, MYSQL_HOSTNAME: 'h', MYSQL_USERNAME: 'u', MYSQL_PASSWORD: 'p', MYSQL_DATABASE: 'd',
        });
        expect(() => loadConfig()).toThrow(`Invalid PORT value: ${port}`);
    });

    test('requires each mysql setting', () => {
        process.env.PORT = '1514';
        delete process.env.MYSQL_HOSTNAME;
        expect(() => loadConfig()).toThrow('Missing required environment variable: MYSQL_HOSTNAME');
    });
});
