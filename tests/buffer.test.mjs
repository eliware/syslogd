import { RowBuffer } from '../src/buffer.mjs';

describe('RowBuffer', () => {
    test('pushes, reports, and drains rows', () => {
        const buffer = new RowBuffer();
        const first = { id: 1 };
        const second = { id: 2 };

        buffer.push(first);
        buffer.push(second);
        expect(buffer.size()).toBe(2);
        expect(buffer.drain()).toEqual([first, second]);
        expect(buffer.size()).toBe(0);
    });

    test('prepends failed rows ahead of queued rows', () => {
        const buffer = new RowBuffer();
        buffer.push({ id: 3 });
        buffer.prepend([{ id: 1 }, { id: 2 }]);
        expect(buffer.drain()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    test('ignores an empty prepend', () => {
        const buffer = new RowBuffer();
        buffer.push({ id: 1 });
        buffer.prepend([]);
        expect(buffer.drain()).toEqual([{ id: 1 }]);
    });
});
