# syslogd

MySQL-backed syslog collector in Node.js.

Path:

- the checked-out project root

## Purpose

Receive syslog messages over TCP and UDP, buffer them briefly, and batch-write raw lines into a daily MySQL table.

## Scope

This spec covers the collector service only:

- Node.js entrypoint: syslogd.mjs
- dotenv-based configuration loading
- mysql2 connection pooling
- TCP and UDP syslog intake
- daily table creation and rollover
- buffered batch inserts
- raw-line storage only

It does not define a web UI or query API.

## Runtime Model

- The service starts from syslogd.mjs.
- On startup it loads .env with dotenv.
- It creates a mysql2 pool using MYSQL_HOSTNAME, MYSQL_USERNAME, MYSQL_PASSWORD, and MYSQL_DATABASE.
- It creates today's table before accepting inserts.
- It listens for syslog messages on PORT for both TCP and UDP.

## Data Model

- One table per day.
- Table name format: syslog_YYYYMMDD.
- YYYYMMDD is based on server time.
- The service must create the table for the current day on startup if it does not exist.
- At midnight server time, the service must switch to the new day's table and create it before the first write.

Fixed table schema:

- id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY
- received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
- transport ENUM('tcp','udp') NOT NULL
- remote_address VARCHAR(45) NOT NULL
- remote_port INT UNSIGNED NULL
- raw_line TEXT NOT NULL
- KEY ix_received_at (received_at)
- KEY ix_transport_received_at (transport, received_at)

No parsing of RFC3164/RFC5424 fields is performed. Each record stores the raw line exactly as received, plus transport and source metadata.

## Buffering and Writes

- Incoming messages are buffered in memory.
- The collector must batch insert buffered rows at least every 100ms.
- The flush interval may be shorter, but not longer than 100ms under normal operation.
- Batch inserts should target only the current day's table.
- When the date changes, any pending buffered rows for the previous day must be flushed to the previous table before switching.

## Behavior

1. Start service.
2. Load configuration from .env.
3. Open MySQL pool.
4. Ensure today's syslog_YYYYMMDD table exists.
5. Begin listening for syslog datagrams and TCP connections.
6. Buffer received events.
7. Flush buffered events in batches on a timer.
8. On day rollover, create the next table and redirect new inserts there.

## Operational Notes

- The service should prefer durability over premature shutdown on transient MySQL errors.
- Logging should make it obvious when the active table changes.
- Time-based rollover must use server time, not message timestamps.
- The service should tolerate bursts without writing each message individually.

## Configuration

Expected environment variables:

- PORT=514
- MYSQL_HOSTNAME=mysql
- MYSQL_USERNAME=syslog
- MYSQL_PASSWORD=syslog
- MYSQL_DATABASE=syslog

## Code Organization

- Keep the main entrypoint thin.
- Prefer smaller, manageable, easier-to-test, single-purpose files under src/.
- Move protocol handling, buffering, MySQL logic, and table rollover into focused modules instead of concentrating logic in syslogd.mjs.

## Documentation and Tests

- Do not create tests yet.
- Do not create additional documentation yet beyond this spec.
