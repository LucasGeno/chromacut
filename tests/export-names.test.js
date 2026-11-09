import { beforeEach, expect, test } from 'bun:test';
import { state, pushUndo } from '../src/chromacut/static/js/state.js';
import { getSettings } from '../src/chromacut/static/js/export.js';

// Minimal DOM boundary; run the actual app wiring and keyboard handlers.
class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.dataset = {};
        this.listeners = {};
        this.classList = { add() {}, remove() {}, toggle() {} };
    }
    set innerHTML(value) { this.children = []; }
    appendChild(child) { this.children.push(child); }
    addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
    fire(type, props = {}) {
        for (const callback of this.listeners[type] ?? []) {
            callback({ target: this, preventDefault() {}, ...props });
        }
    }
    querySelectorAll(tag) {
        return this.children.flatMap(child => [
            ...(child.tagName === tag.toUpperCase() ? [child] : []),
            ...child.querySelectorAll(tag),
        ]);
    }
}
const elements = new Map();
const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
};
globalThis.document = Object.assign(new Element(), {
    body: new Element(), querySelector: $, querySelectorAll: () => [],
    getElementById: id => $(`#${id}`), createElement: tag => new Element(tag),
});
globalThis.window = Object.assign(new Element(), { location: { hostname: 'localhost' } });
globalThis.fetch = async () => ({ ok: true, json: async () => ({ authenticated: true }) });
await import('../src/chromacut/static/js/app.js');
const inputs = () => $('#name-fields').querySelectorAll('input');
const key = (code, props = {}) => window.fire('keydown', { code, ...props });
const names = () => inputs().map(input => input.value);

beforeEach(() => {
    $('#btn-new').fire('click');
    state.analysisData = { cells: [{ x: 0, y: 0, w: 20, h: 20 }, { x: 30, y: 0, w: 20, h: 20 }] };
    $('#btn-reset-boxes').fire('click');
    expect(names()).toEqual(['icon-1', 'icon-2']);
    inputs()[0].value = 'bicycle';
    inputs()[0].fire('input');
    inputs()[1].value = '';
    inputs()[1].fire('input');
});

test.each(['exclusion', 'geometry undo'])('export names survive %s and redo', action => {
    if (action === 'exclusion') {
        state.selectedCell = 1;
        key('Delete');
        expect(state.excludedCells.has(1)).toBe(true);
    } else {
        state.editedCells[0].x = 10;
        pushUndo();
        key('KeyZ', { ctrlKey: true });
        expect(state.editedCells[0].x).toBe(0);
    }
    expect(names()).toEqual(['bicycle', '']);
    key('KeyZ', { ctrlKey: true, shiftKey: action !== 'exclusion' });
    expect(names()).toEqual(['bicycle', '']);
    expect(getSettings({ value: '15' }, $('#name-fields')).cells.map(cell => cell.name))
        .toEqual(['bicycle', 'icon-2']);
    $('#btn-reset-boxes').fire('click');
    expect(names()).toEqual(['bicycle', '']);
});
