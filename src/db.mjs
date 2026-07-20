import mysql from 'mysql2/promise';
import { assertSafeTableName } from './table.mjs';

const TABLE_SQL = `(
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    transport ENUM('tcp','udp') NOT NULL,
    remote_address VARCHAR(45) NOT NULL,
    remote_port INT UNSIGNED NULL,
    raw_line TEXT NOT NULL,
    KEY ix_received_at (received_at),
    KEY ix_transport_received_at (transport, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

export function createPool(config) {
    return mysql.createPool({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionLimit: 4,
        waitForConnections: true,
        namedPlaceholders: false,
    });
}

export async function ensureTable(pool, tableName) {
    const safeTableName = assertSafeTableName(tableName);
    await pool.execute(`CREATE TABLE IF NOT EXISTS \`${safeTableName}\` ${TABLE_SQL}`);
}

export async function insertRows(pool, tableName, rows) {
    if (!rows.length) {
        return;
    }

    const safeTableName = assertSafeTableName(tableName);
    const values = rows.map((row) => [
        row.transport,
        row.remoteAddress,
        row.remotePort,
        row.rawLine,
    ]);
    const placeholders = values.map(() => '(?, ?, ?, ?)').join(', ');
    const sql = `INSERT INTO \`${safeTableName}\` (transport, remote_address, remote_port, raw_line) VALUES ${placeholders}`;
    await pool.execute(sql, values.flat());
}
