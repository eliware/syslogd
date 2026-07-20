export class RowBuffer {
    constructor() {
        this.items = [];
    }

    push(row) {
        this.items.push(row);
    }

    drain() {
        const drained = this.items;
        this.items = [];
        return drained;
    }

    prepend(rows) {
        if (rows.length) {
            this.items = rows.concat(this.items);
        }
    }

    size() {
        return this.items.length;
    }
}
