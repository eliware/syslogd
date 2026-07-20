import { assertSafeTableName, getTableName } from '../src/table.mjs';

describe('table names', () => {
    test('formats local server date with zero padding', () => {
        expect(getTableName(new Date(2026, 0, 5))).toBe('syslog_20260105');
    });

    test('accepts only generated table names', () => {
        expect(assertSafeTableName('syslog_20260719')).toBe('syslog_20260719');
        expect(() => assertSafeTableName('syslog_2026-07-19')).toThrow();
        expect(() => assertSafeTableName('syslog_users')).toThrow();
    });

    test('uses the current date by default', () => {
        expect(getTableName()).toMatch(/^syslog_\d{8}$/);
    });
});
