import { afterEach, expect, test } from 'bun:test';
import { state, resetState, initCells, pushUndo } from '../src/chromacut/static/js/state.js';
import { refreshCellPreview, setupInteraction } from '../src/chromacut/static/js/interaction.js';

const globals = ['window', 'document', 'getComputedStyle', 'Image', 'fetch'];
const originals = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
afterEach(() => {
    globals.forEach((key, i) => {
        if (originals[i]) Object.defineProperty(globalThis, key, originals[i]);
        else delete globalThis[key];
    });
    resetState();
});

function setupPreviewTest(cells = [{ x: 0, y: 0, w: 20, h: 20 }]) {
    const images = [], requests = [], draws = [];
    const noop = () => {};
    const ctx = {
        clearRect: noop, setLineDash: noop, strokeRect: noop, fillRect: noop, fillText: noop,
        drawImage: (...args) => draws.push(args), putImageData: noop,
        getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
    };
    const handlers = {};
    const canvas = () => ({
        width: 100, height: 100, getContext: () => ctx,
        addEventListener: (type, handler) => { handlers[type] = handler; },
        getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: noop,
        parentElement: { clientWidth: 520, clientHeight: 520 },
    });
    globalThis.window = { addEventListener: (type, handler) => { handlers[type] = handler; } };
    globalThis.document = { querySelector: () => null, querySelectorAll: () => [], createElement: canvas };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
    globalThis.Image = class {
        complete = true;
        naturalWidth = 20;
        naturalHeight = 20;
        set src(value) { this.crop = JSON.parse(value); images.push(this); }
    };
    globalThis.fetch = async (_url, options) => {
        const settings = options.body.get('settings');
        requests.push(JSON.parse(settings));
        return { ok: true, json: async () => ({ preview: settings }) };
    };
    resetState();
    state.sourceFile = new File(['source'], 'source.png');
    state.sourceImage = { width: 100, height: 100 };
    state.analysisData = { cells };
    initCells(state.analysisData);
    setupInteraction({ overlayCanvas: canvas(), resultCanvas: canvas(), paddingSlider: { value: '0' }, updateCellPanel: noop });
    return { images, requests, draws, handlers, noop };
}

test('undo and redo replace the edited crop preview, using the restored crop while loading', async () => {
    const { images, requests, draws, handlers, noop } = setupPreviewTest();
    state.editedCells[0].x = 10;
    pushUndo();
    await refreshCellPreview(0, state.sourceFile);
    images.at(-1).onload();
    expect(draws.at(-1)[0].crop.x).toBe(10);

    for (const [shiftKey, x] of [[false, 0], [true, 10]]) {
        await refreshCellPreview(0, state.sourceFile);
        const previousImage = images.at(-1);
        draws.length = 0;
        handlers.keydown({ code: 'KeyZ', ctrlKey: true, shiftKey, target: { tagName: 'BODY' }, preventDefault: noop });
        expect(state.editedCells[0].x).toBe(x);
        // The fallback must draw the restored source crop, never the previous backend image.
        expect(draws[0][0]).toBe(state.sourceImage);
        expect(draws[0].slice(1, 5)).toEqual([x, 0, 20, 20]);
        expect(requests.at(-1)).toEqual({ x, y: 0, w: 20, h: 20 });
        await new Promise(resolve => setTimeout(resolve, 0));
        // A superseded image finishing its load must not replace the restored crop.
        previousImage.onload();
        expect(draws.at(-1)[0]).not.toBe(previousImage);
        images.at(-1).onload();
        expect(draws.at(-1)[0].crop.x).toBe(x);
    }
});

test.each(['keyboard', 'canvas'])('multi-cell undo preserves valid previews and refreshes missing ones on %s selection', async (selection) => {
    const { images, requests, draws, handlers, noop } = setupPreviewTest([
        { x: 0, y: 0, w: 20, h: 20 }, { x: 50, y: 50, w: 20, h: 20 },
    ]);
    const key = (code, ctrlKey = false) => handlers.keydown({ code, ctrlKey, target: { tagName: 'BODY' }, preventDefault: noop });
    const selectSecond = () => selection === 'keyboard'
        ? key('Digit2') : handlers.pointerdown({ clientX: 60, clientY: 60, pointerId: 1 });
    state.selectedCell = 1;
    await refreshCellPreview(1, state.sourceFile);
    images.at(-1).onload();
    const validPreview = images.at(-1);
    key('Digit1');
    key('Delete');
    key('KeyZ', true);
    expect(state.excludedCells.has(0)).toBe(false);
    const requestCount = requests.length;
    selectSecond();
    expect(draws.at(-1)[0]).toBe(validPreview);
    expect(requests).toHaveLength(requestCount);

    // Undo a crop edit while another cell is selected, then revisit the changed cell.
    state.editedCells[1].x = 55;
    pushUndo();
    await refreshCellPreview(1, state.sourceFile);
    images.at(-1).onload();
    key('Digit1');
    key('KeyZ', true);
    selectSecond();
    expect(requests.at(-1)).toEqual({ x: 50, y: 50, w: 20, h: 20 });
    expect(draws.at(-1)[0]).not.toBe(images.at(-1));
    await new Promise(resolve => setTimeout(resolve, 0));
    images.at(-1).onload();
    expect(draws.at(-1)[0]).toBe(images.at(-1));
    expect(draws.at(-1)[0].crop).toEqual({ x: 50, y: 50, w: 20, h: 20 });
});
