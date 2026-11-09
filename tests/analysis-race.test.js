import { afterAll, expect, test } from 'bun:test';

// Browser/network boundaries only: run the real app and its imported modules.
const saved = Object.fromEntries(['document', 'window', 'Image', 'fetch', 'getComputedStyle']
    .map(key => [key, globalThis[key]]));
const noop = () => {};
const ctx = Object.fromEntries(['drawImage', 'clearRect', 'setLineDash', 'strokeRect',
    'fillRect', 'fillText', 'putImageData'].map(key => [key, noop]));
ctx.getImageData = () => ({ data: new Uint8ClampedArray(16) });
function element() {
    const classes = new Set();
    return { events: {}, dataset: {}, style: {}, value: '0', textContent: '',
        parentElement: { clientWidth: 512, clientHeight: 512 },
        classList: { add: x => classes.add(x), remove: x => classes.delete(x),
            contains: x => classes.has(x), toggle: noop },
        addEventListener(type, fn) { this.events[type] = fn; },
        appendChild: noop, getContext: () => ctx };
}
const nodes = new Map();
const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
};
globalThis.document = { querySelector: $, querySelectorAll: () => [],
    createElement: element, addEventListener: noop, body: element(),
    documentElement: element(), getElementById: id => $(`#${id}`) };
globalThis.window = { addEventListener: noop, location: { hostname: 'localhost' } };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
const images = [], requests = [];
globalThis.Image = class { width = 2; height = 2; constructor() { images.push(this); } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; });
    return { promise, resolve }; };
globalThis.fetch = async (url, options) => {
    if (url === '/auth/me') return { ok: true, json: async () => ({ authenticated: true }) };
    const response = deferred(), body = deferred();
    requests.push({ response, body, options });
    await response.promise;
    return { json: () => body.promise };
};
const { state } = await import('../src/chromacut/static/js/state.js');
await import('../src/chromacut/static/js/app.js');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const select = async name => {
    $('#file-input').files = [new File(['image'], name, { type: 'image/png' })];
    $('#file-input').events.change();
    await flush();
    return images.at(-1);
};
const data = mode => ({ mode, key_color: [0, 255, 0], cells: [{ x: 0, y: 0, w: 2, h: 2 }] });
afterAll(() => Object.assign(globalThis, saved));

for (const action of ['replace', 'reset']) {
    for (const stage of ['image', 'response', 'body']) {
        test(`${action} ignores stale ${stage} completion`, async () => {
            $('#btn-new').events.click();
            const a = await select('A');
            if (stage !== 'image') { a.onload(); await flush(); }
            const old = requests.at(-1);
            if (stage === 'body') { old.response.resolve(); await flush(); }
            if (action === 'replace') {
                const b = await select('B');
                b.onload(); await flush();
                const current = requests.at(-1);
                current.response.resolve(); current.body.resolve(data('B')); await flush();
                expect(state.analysisData.mode).toBe('B');
            } else $('#btn-new').events.click();
            if (stage === 'image') { a.onload(); await flush(); }
            else { old.response.resolve(); old.body.resolve(data('A')); await flush(); }
            expect(state.sourceImage).toBe(action === 'replace' ? images.at(-1) : null);
            expect(state.analysisData?.mode ?? null).toBe(action === 'replace' ? 'B' : null);
            expect($('#loading-overlay').classList.contains('hidden')).toBe(true);
            expect($('#export-status').textContent).toBe('');
        });
    }
}
