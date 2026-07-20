function pad2(value) {
    return String(value).padStart(2, '0');
}

export function getTableName(date = new Date()) {
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    return `syslog_${year}${month}${day}`;
}

export function assertSafeTableName(tableName) {
    if (!/^syslog_\d{8}$/.test(tableName)) {
        throw new Error(`Unsafe table name: ${tableName}`);
    }
    return tableName;
}
