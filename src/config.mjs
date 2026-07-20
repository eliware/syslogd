const DEFAULT_PORT = 514;

function parsePort(value) {
    const port = Number.parseInt(value ?? `${DEFAULT_PORT}`, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid PORT value: ${value}`);
    }
    return port;
}

function requiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export function loadConfig() {
    return {
        port: parsePort(process.env.PORT),
        mysql: {
            host: requiredEnv('MYSQL_HOSTNAME'),
            user: requiredEnv('MYSQL_USERNAME'),
            password: requiredEnv('MYSQL_PASSWORD'),
            database: requiredEnv('MYSQL_DATABASE'),
        },
    };
}
