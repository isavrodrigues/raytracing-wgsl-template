#!/usr/bin/env node
/**
 * render-scenes.cjs - headless render verification for the WebGPU ray tracer.
 *
 * Opens the project in headless Chromium (WebGPU on SwiftShader, i.e. on the CPU), selects each scene in the
 * lil-gui "Scene" dropdown, lets `--frames` accumulated frames render, reads the final image back (PNG) and reports
 * console errors / WGSL compile errors (with file:line) / uncaught exceptions per scene.
 * Outputs in --out: <Scene>.png, montage.png (all scenes in one image, dropdown order, 6 columns), index.html.
 *
 * USAGE
 *   node tools/render-scenes.cjs [--scenes Basic,Bunny] [--rez 256] [--frames 12] [--out tools/out]
 *                                [--timeout 120] [--port 0] [--verbose]
 *
 *   --scenes   comma separated scene names (as shown in the dropdown). Default: every scene in the dropdown.
 *   --rez      canvas resolution, must be a multiple of 16 (default 256). main.js is rewritten IN MEMORY
 *              (`rez: 768` -> `rez: <n>`), nothing on disk is touched.
 *   --frames   number of ACCUMULATED frames to wait for after the scene loaded (default 12).
 *   --out      output directory for <Scene>.png + index.html contact sheet (default tools/out).
 *   --timeout  seconds to wait per scene before giving up (default 120).
 *   --port     local http port (default 0 = random free port).
 *   --verbose  also print every console message of every scene.
 *   env HARNESS_TRACE=1  prints the frame/accumulation bookkeeping every 100 ms (debugging the wait loop).
 *
 * EXIT CODE  0 = every scene rendered without errors, 1 = at least one scene had errors / timed out / init failed.
 *
 * ONE-TIME SETUP (the only npm deps live in the git-ignored tools/.cache):
 *   mkdir -p tools/.cache && cd tools/.cache && npm init -y && npm i lil-gui@0.17.0 gl-matrix@2.8.1 pngjs@7.0.0
 *   (the script prints this hint if the files are missing). Playwright + Chromium are pre-installed on the box.
 *
 * HOW IT WORKS / ASSUMPTIONS ABOUT THE PROJECT
 *   - CDN scripts from index.html (lil-gui, gl-matrix, mathjs) are served from tools/.cache via page.route.
 *   - Frame bookkeeping is done by wrapping GPUQueue.writeBuffer/submit (see INIT_SCRIPT). It assumes the layout of
 *     the uniforms buffer in main.js/raytracer.wgsl: uniforms[1] = rez, uniforms[3] = shouldAccumulate, and that
 *     getScene() calls writeUniforms() once more than a normal frame does. If you change that, the wait loop
 *     will time out (the error message says so).
 *   - createShaderModule is wrapped so that WGSL compile messages are printed with `file:line:col` (the file list is
 *     parsed from the getModule(gpu, [...]) call in main.js).
 *
 * TWO HARNESS-ONLY WORKAROUNDS (neither touches the project files; both are monkey-patches in INIT_SCRIPT)
 *   1. Canvas: in this container (headless Chrome 153 + SwiftShader) GPUCanvasContext.getCurrentTexture() breaks
 *      Dawn ("A valid external Instance reference no longer exists" -> onSubmittedWorkDone() rejects -> render loop
 *      dies). main.js therefore renders into an offscreen texture and the harness reads that back. Output pixels are
 *      identical to what the canvas would show (same render pipeline), only the compositor is bypassed.
 *   2. Accumulation: SwiftShader frames take 0.1 - 1.7 s, far more than the 400 ms accumulation-reset timer in
 *      main.js, so a new scene would be summed on top of the previous scene's image. The first frame after each scene
 *      load is forced to shouldAccumulate = 0, like on a fast GPU. (Without this, images are contaminated.)
 *   Typical run: ~2 min for all scenes at --rez 256 --frames 12; single simple scene ~3 s.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const CACHE = path.join(__dirname, '.cache', 'node_modules');

// ----------------------------------------------------------------------------------------------- args
function parseArgs(argv)
{
    const a = { scenes: null, rez: 256, frames: 12, out: path.join(__dirname, 'out'), timeout: 120, port: 0, verbose: false };
    for (let i = 0; i < argv.length; i++)
    {
        const k = argv[i];
        const next = () => argv[++i];
        if (k === '--scenes') a.scenes = next().split(',').map(s => s.trim()).filter(Boolean);
        else if (k === '--rez') a.rez = parseInt(next(), 10);
        else if (k === '--frames') a.frames = parseInt(next(), 10);
        else if (k === '--out') a.out = path.resolve(next());
        else if (k === '--timeout') a.timeout = parseFloat(next());
        else if (k === '--port') a.port = parseInt(next(), 10);
        else if (k === '--verbose') a.verbose = true;
        else if (k === '-h' || k === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
        else { console.error(`unknown argument: ${k}`); process.exit(2); }
    }
    if (!(a.rez >= 16) || a.rez % 16 !== 0) { console.error('--rez must be a positive multiple of 16'); process.exit(2); }
    if (!(a.frames >= 1)) { console.error('--frames must be >= 1'); process.exit(2); }
    return a;
}

// ------------------------------------------------------------------------------------------ local deps
function need(rel)
{
    const p = path.join(CACHE, rel);
    if (!fs.existsSync(p))
    {
        console.error(`missing ${p}\nrun:  mkdir -p tools/.cache && cd tools/.cache && npm init -y && npm i lil-gui@0.17.0 gl-matrix@2.8.1 pngjs@7.0.0`);
        process.exit(2);
    }
    return p;
}

const LIL_GUI = fs.readFileSync(need('lil-gui/dist/lil-gui.umd.min.js'));
const GL_MATRIX = fs.readFileSync(need('gl-matrix/dist/gl-matrix-min.js'));
const { PNG } = require(need('pngjs'));
const { chromium } = require('playwright');

const CHROME_ARGS = [
    '--no-sandbox',
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=swiftshader',
    '--use-webgpu-adapter=swiftshader',
    '--enable-webgpu-developer-features',
    '--ignore-gpu-blocklist',
];

// ----------------------------------------------------------------------------------- static file server
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wgsl': 'text/plain', '.obj': 'text/plain', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };

function startServer(rez, port)
{
    const server = http.createServer((req, res) => {
        let rel = decodeURIComponent(req.url.split('?')[0]);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = path.normalize(path.join(ROOT, rel));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
        {
            res.writeHead(404); res.end('not found'); return;
        }
        let body = fs.readFileSync(file);
        if (rel === '/main.js')
        {
            // shrink the canvas so SwiftShader (CPU) is fast enough; only the first `rez: N` (the uniforms object)
            body = Buffer.from(body.toString('utf8').replace(/(\brez:\s*)\d+/, `$1${rez}`));
        }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(body);
    });
    return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

// ----------------------------------------------------- shader file list (for mapping WGSL line numbers)
function shaderFiles()
{
    const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    const m = main.match(/getModule\(\s*\w+\s*,\s*\[([^\]]*)\]/);
    if (!m) return [];
    const files = [...m[1].matchAll(/["']([^"']+)["']/g)].map(x => x[1]);
    // main.js concatenates `load(path) + "\n"` for every file
    let line = 1;
    return files.map(f => {
        const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const entry = { file: f, start: line };
        line += (text.match(/\n/g) || []).length + 1;
        entry.end = line - 1;
        return entry;
    });
}

function mapWgslLine(map, line)
{
    for (const e of map) if (line >= e.start && line <= e.end) return `${e.file}:${line - e.start + 1}`;
    return `line ${line}`;
}

// ------------------------------------------------------------------------------ in-page instrumentation
const INIT_SCRIPT = `(() => {
  const h = window.__h = { rez: 0, submits: 0, writesSinceSubmit: 0, lastAccum: -1, run: 0, resets: 0, sceneLoads: 0, uniformWrites: 0 };
  const q = GPUQueue.prototype;
  const wb = q.writeBuffer;
  q.writeBuffer = function (buffer, offset, data, ...rest) {
    // the uniforms buffer: small Float32Array, written at offset 0, uniforms[1] == rez
    if (offset === 0 && data instanceof Float32Array && data.length <= 64 && data[1] === h.rez) {
      // A uniforms write while another one is already pending = the per-frame write right after getScene()'s
      // explicit writeUniforms(). main.js asks for an accumulation reset (400 ms timer), but on SwiftShader one frame
      // takes >400 ms, so the timer has already flipped shouldAccumulate back to 1 and the new scene would be summed
      // on top of the previous scene's image. Force the reset here, as a fast GPU would have done.
      if (h.writesSinceSubmit >= 1) data[3] = 0;
      h.uniformWrites++; h.writesSinceSubmit++; h.lastAccum = data[3];
    }
    return wb.call(this, buffer, offset, data, ...rest);
  };
  const sub = q.submit;
  q.submit = function (...a) {
    if (h.ignoreSubmit) return sub.apply(this, a);
    h.submits++;
    // getScene() calls writeUniforms() on top of the per-frame one -> two writes between two submits
    if (h.writesSinceSubmit >= 2) h.sceneLoads++;
    if (h.lastAccum === 0) { h.resets++; h.run = 0; } else if (h.lastAccum === 1) { h.run++; }
    h.writesSinceSubmit = 0;
    return sub.apply(this, a);
  };
  // WGSL compile messages with line numbers
  const csm = GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule = function (desc) {
    const m = csm.call(this, desc);
    const isCompute = typeof desc.code === 'string' && desc.code.includes('fn render(');
    m.getCompilationInfo().then(info => {
      for (const msg of info.messages)
        console.error('__WGSL__' + JSON.stringify({ kind: isCompute ? 'main' : 'other', type: msg.type, line: msg.lineNum, col: msg.linePos, message: msg.message }));
    });
    return m;
  };
  // --- canvas workaround -------------------------------------------------------------------------------
  // In this container (headless Chrome + SwiftShader) calling GPUCanvasContext.getCurrentTexture() kills Dawn's
  // instance ("A valid external Instance reference no longer exists") and every later onSubmittedWorkDone()
  // rejects, so main.js' render loop dies after the first frame. We therefore hand main.js an OFFSCREEN texture
  // instead of the canvas texture and read the finished image back ourselves (window.__readCanvas).
  GPUCanvasContext.prototype.configure = function (conf) { this.__conf = conf; };
  GPUCanvasContext.prototype.getCurrentTexture = function () {
    const conf = this.__conf;
    if (!conf) throw new DOMException('context is not configured', 'InvalidStateError');
    const c = this.canvas;
    if (!this.__tex) {
      this.__tex = conf.device.createTexture({ size: [c.width, c.height], format: conf.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      h.canvasTex = this.__tex; h.canvasDev = conf.device;
    }
    return this.__tex;
  };
  window.__readCanvas = async () => {
    const tex = h.canvasTex, dev = h.canvasDev;
    if (!tex) throw new Error('no canvas texture was ever requested (render loop never ran?)');
    const w = tex.width, ht = tex.height, bpr = Math.ceil(w * 4 / 256) * 256;
    const buf = dev.createBuffer({ size: bpr * ht, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = dev.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: bpr }, [w, ht]);
    h.ignoreSubmit = true; dev.queue.submit([enc.finish()]); h.ignoreSubmit = false;
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const bgra = tex.format.startsWith('bgra');
    const out = new Uint8Array(w * ht * 4);
    for (let y = 0; y < ht; y++) for (let x = 0; x < w; x++) {
      const s = y * bpr + x * 4, d = (y * w + x) * 4;
      out[d] = src[s + (bgra ? 2 : 0)]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + (bgra ? 0 : 2)]; out[d + 3] = 255;
    }
    buf.unmap(); buf.destroy();
    let bin = ''; for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return { width: w, height: ht, b64: btoa(bin) };
  };
  const rd = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function (...a) {
    const d = await rd.apply(this, a);
    d.addEventListener('uncapturederror', e => console.error('[WebGPU uncaptured error] ' + e.error.message));
    window.__deviceLimits = { maxStorageBuffersPerShaderStage: d.limits.maxStorageBuffersPerShaderStage, maxBindGroups: d.limits.maxBindGroups };
    return d;
  };
})();`;

// -------------------------------------------------------------------------------------------- png stats
function pngStats(buf)
{
    const png = PNG.sync.read(buf);
    const n = png.width * png.height;
    const sum = [0, 0, 0], sq = [0, 0, 0];
    for (let i = 0; i < n; i++)
        for (let c = 0; c < 3; c++) { const v = png.data[i * 4 + c]; sum[c] += v; sq[c] += v * v; }
    const mean = sum.map(s => s / n);
    const std = sq.map((s, c) => Math.sqrt(Math.max(0, s / n - mean[c] * mean[c])));
    return { width: png.width, height: png.height, mean, std, hash: crypto.createHash('md5').update(png.data).digest('hex'), img: png };
}

const fmt = v => v.map(x => x.toFixed(1)).join(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------- main
(async () => {
    const args = parseArgs(process.argv.slice(2));
    fs.mkdirSync(args.out, { recursive: true });
    const wgslMap = shaderFiles();

    const server = await startServer(args.rez, args.port);
    const url = `http://127.0.0.1:${server.address().port}/index.html`;

    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: CHROME_ARGS });
    const context = await browser.newContext({ viewport: { width: Math.max(1300, args.rez + 400), height: Math.max(900, args.rez + 150) }, deviceScaleFactor: 1 });

    // serve the CDN scripts locally, block every other external request
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => {
        const u = route.request().url();
        const js = body => route.fulfill({ status: 200, contentType: 'text/javascript', body });
        if (/lil-gui/.test(u)) return js(LIL_GUI);
        if (/gl-matrix/.test(u)) return js(GL_MATRIX);
        if (/mathjs/.test(u)) return js('/* mathjs stub */');
        return route.abort();
    });

    const page = await context.newPage();
    await page.addInitScript(INIT_SCRIPT);
    await page.addInitScript(`window.__h.rez = ${args.rez};`);

    // ---------------------------------------------------------------- message collection (per scene bucket)
    let bucket = { name: 'init', errors: [], warnings: [], log: [] };
    const buckets = [bucket];
    const push = (list, text) => { if (!list.includes(text)) list.push(text); };

    page.on('console', msg => {
        const type = msg.type();
        let text = msg.text();
        if (text.startsWith('__WGSL__'))
        {
            const m = JSON.parse(text.slice(8));
            const where = m.kind === 'main' ? mapWgslLine(wgslMap, m.line) : `(render-quad shader) line ${m.line}`;
            const line = `[WGSL ${m.type}] ${where}:${m.col}: ${m.message}`;
            push(m.type === 'error' ? bucket.errors : bucket.warnings, line);
            return;
        }
        if (args.verbose) bucket.log.push(`[${type}] ${text}`);
        if (type === 'error') push(bucket.errors, `[console.error] ${text}`);
        else if (type === 'warning') push(bucket.warnings, `[console.warn] ${text}`);
    });
    page.on('pageerror', err => push(bucket.errors, `[uncaught] ${err.message}`));
    page.on('requestfailed', r => { if (r.url().startsWith('http://127.0.0.1')) push(bucket.errors, `[request failed] ${r.url()}`); });
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith('http://127.0.0.1')) push(bucket.errors, `[HTTP ${r.status()}] ${r.url()}`); });

    const results = [];
    let fatal = null;

    console.log(`harness: ${url}  rez=${args.rez} frames=${args.frames}`);
    await page.goto(url);

    // ------------------------------------------------------------------ wait for the GUI (== module initialised)
    const selectSel = 'select';
    const initDeadline = Date.now() + 60000;
    let sceneNames = null;
    while (Date.now() < initDeadline)
    {
        sceneNames = await page.evaluate(() => {
            const sels = [...document.querySelectorAll('select')];
            const s = sels.find(x => x.closest('.lil-gui'));
            return s ? [...s.options].map(o => o.textContent) : null;
        });
        if (sceneNames && sceneNames.length) break;
        if (bucket.errors.length) { await sleep(1500); break; }   // init failed: give pending messages time to arrive
        await sleep(250);
    }

    const lim = await page.evaluate(() => window.__deviceLimits || null);
    if (lim) console.log(`device limits (as granted to main.js): maxStorageBuffersPerShaderStage=${lim.maxStorageBuffersPerShaderStage} maxBindGroups=${lim.maxBindGroups}  (default limit is 8: adding storage buffers beyond that needs requiredLimits)`);
    const adapterInfo = await page.evaluate(async () => { try { const a = await navigator.gpu.requestAdapter(); return a ? { desc: a.info && a.info.description, maxStorage: a.limits.maxStorageBuffersPerShaderStage } : null; } catch (e) { return null; } });
    if (adapterInfo) console.log(`adapter: ${adapterInfo.desc}, adapter max storage buffers/stage = ${adapterInfo.maxStorage}`);

    if (!sceneNames || !sceneNames.length)
    {
        fatal = 'page did not initialise (no scene dropdown). Errors:\n  ' + (bucket.errors.join('\n  ') || '(none captured)');
    }
    else
    {
        console.log(`scenes in dropdown (${sceneNames.length}): ${sceneNames.join(', ')}`);
        let todo = sceneNames.map((n, i) => ({ name: n, index: i }));
        if (args.scenes)
        {
            const unknown = args.scenes.filter(s => !sceneNames.includes(s));
            if (unknown.length) console.warn(`WARNING: unknown scene(s) ignored: ${unknown.join(', ')}`);
            todo = todo.filter(t => args.scenes.includes(t.name));
        }

        // let the very first scene (loaded by setup()) finish so its bookkeeping can't be mistaken for ours
        try { await page.waitForFunction(() => window.__h.sceneLoads >= 1, null, { timeout: 60000, polling: 100 }); } catch (e) { /* reported below per scene */ }
        await sleep(300);

        for (const t of todo)
        {
            bucket = { name: t.name, errors: [], warnings: [], log: [] };
            buckets.push(bucket);
            const res = { name: t.name, ok: true, errors: bucket.errors, warnings: bucket.warnings, png: null, stats: null, msPerFrame: null, flags: [] };
            results.push(res);

            const loadsBefore = await page.evaluate(({ index }) => {
                const h = window.__h;
                const sel = [...document.querySelectorAll('select')].find(x => x.closest('.lil-gui'));
                const before = h.sceneLoads;
                sel.selectedIndex = index;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return before;
            }, { index: t.index });

            const started = Date.now();
            let reachedAt = null;
            let status = 'timeout';
            const deadline = started + args.timeout * 1000;
            let errorSeenAt = null;
            while (Date.now() < deadline)
            {
                const st = await page.evaluate(() => ({ loads: window.__h.sceneLoads, run: window.__h.run, resets: window.__h.resets, submits: window.__h.submits }));
                if (process.env.HARNESS_TRACE) console.log(`   [trace ${t.name}] +${Date.now() - started}ms loads=${st.loads}(before ${loadsBefore}) run=${st.run} resets=${st.resets} submits=${st.submits}`);
                if (st.loads > loadsBefore && reachedAt === null) reachedAt = Date.now();
                if (st.loads > loadsBefore && st.run >= args.frames) { status = 'ok'; break; }
                if (bucket.errors.length && errorSeenAt === null) errorSeenAt = Date.now();
                if (errorSeenAt !== null && Date.now() - errorSeenAt > 3000 && st.loads <= loadsBefore) { status = 'error-before-load'; break; }
                await sleep(100);
            }
            const elapsed = Date.now() - (reachedAt || started);

            if (status !== 'ok')
            {
                res.ok = false;
                res.flags.push(status === 'timeout' ? 'TIMEOUT' : 'LOAD-FAILED');
                push(bucket.errors, status === 'timeout'
                    ? `[harness] timed out after ${args.timeout}s waiting for ${args.frames} accumulated frames (scene never finished loading, or uniforms layout/accumulate logic changed)`
                    : '[harness] scene did not finish loading (error thrown while loading it)');
            }
            else res.msPerFrame = Math.round(elapsed / (args.frames + 1));

            // image even on failure (shows what the user would see); read back from the offscreen canvas texture
            const png = path.join(args.out, `${t.name}.png`);
            try
            {
                const img = await page.evaluate(() => window.__readCanvas());
                const out = new PNG({ width: img.width, height: img.height });
                Buffer.from(img.b64, 'base64').copy(out.data);
                const buf = PNG.sync.write(out);
                fs.writeFileSync(png, buf);
                res.png = path.basename(png);
                res.stats = pngStats(buf);
                const s = res.stats;
                if (Math.max(...s.std) < 0.5) res.flags.push('SUSPICIOUS:flat-colour');
                else if (Math.max(...s.mean) < 1.0) res.flags.push('SUSPICIOUS:black');
            }
            catch (e) { push(bucket.errors, `[harness] screenshot failed: ${e.message.split('\n')[0]}`); }

            if (bucket.errors.length) res.ok = false;

            const tag = res.ok && !res.flags.length ? 'OK ' : res.ok ? 'WARN' : 'FAIL';
            console.log(`${tag}  ${t.name.padEnd(12)} ${res.stats ? `mean RGB ${fmt(res.stats.mean).padEnd(16)} std ${fmt(res.stats.std).padEnd(16)}` : ''} ${res.msPerFrame != null ? res.msPerFrame + ' ms/frame' : ''} ${res.flags.join(' ')}`);
            for (const e of bucket.errors) console.log(`        ERROR ${e}`);
            for (const w of bucket.warnings.slice(0, 5)) console.log(`        warn  ${w}`);
            if (bucket.warnings.length > 5) console.log(`        warn  ... ${bucket.warnings.length - 5} more warnings`);
            if (args.verbose) for (const l of bucket.log) console.log(`        log   ${l}`);
        }

        // identical images across scenes => scene switching probably did not work
        const byHash = new Map();
        for (const r of results) if (r.stats) (byHash.get(r.stats.hash) || byHash.set(r.stats.hash, []).get(r.stats.hash)).push(r);
        for (const group of byHash.values())
            if (group.length > 1)
                for (const r of group) { r.flags.push(`SUSPICIOUS:identical-to[${group.filter(g => g !== r).map(g => g.name).join(',')}]`); console.log(`WARN  ${r.name}: image identical to ${group.filter(g => g !== r).map(g => g.name).join(', ')}`); }
    }

    // anything reported while nothing was selected yet (init bucket)
    const initErrors = buckets[0].errors;
    if (initErrors.length && !fatal)
    {
        console.log('errors during init:');
        for (const e of initErrors) console.log(`        ERROR ${e}`);
    }

    // ---------------------------------------------------------------------- montage.png (all scenes in one image)
    // scene order = dropdown order, row-major, 6 columns. Names are listed in index.html / the console log.
    const withImg = results.filter(r => r.stats);
    if (withImg.length)
    {
        const cols = Math.min(6, withImg.length), rows = Math.ceil(withImg.length / cols), w = withImg[0].stats.width, h = withImg[0].stats.height;
        const sheet = new PNG({ width: cols * w, height: rows * h });
        sheet.data.fill(0);
        withImg.forEach((r, i) => PNG.bitblt(r.stats.img, sheet, 0, 0, w, h, (i % cols) * w, Math.floor(i / cols) * h));
        fs.writeFileSync(path.join(args.out, 'montage.png'), PNG.sync.write(sheet));
        console.log(`montage.png (${cols}x${rows}, row-major): ${withImg.map(r => r.name).join(', ')}`);
    }

    // -------------------------------------------------------------------------------- contact sheet
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const cards = results.map(r => `
      <figure class="${r.ok ? (r.flags.length ? 'warn' : 'ok') : 'fail'}">
        ${r.png ? `<img src="${esc(r.png)}" width="${args.rez}">` : '<div class="noimg">no image</div>'}
        <figcaption><b>${esc(r.name)}</b> ${r.ok ? (r.flags.length ? 'WARN' : 'OK') : 'FAIL'}<br>
        ${r.stats ? `mean ${fmt(r.stats.mean)}<br>` : ''}${r.msPerFrame != null ? `${r.msPerFrame} ms/frame<br>` : ''}
        ${r.flags.map(f => `<span class="flag">${esc(f)}</span>`).join(' ')}
        ${r.errors.map(e => `<div class="err">${esc(e)}</div>`).join('')}</figcaption>
      </figure>`).join('\n');
    fs.writeFileSync(path.join(args.out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>render-scenes</title>
<style>body{background:#111;color:#ddd;font:13px/1.4 system-ui,sans-serif;margin:16px}
.grid{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;background:#1b1b1b;padding:8px;border:2px solid #2a2a2a}
figure.ok{border-color:#2e7d32}figure.warn{border-color:#f9a825}figure.fail{border-color:#c62828}
.err{color:#ff8a80;max-width:${args.rez}px;word-break:break-word;margin-top:4px}.flag{color:#ffd54f}
.noimg{width:${args.rez}px;height:${args.rez}px;display:grid;place-items:center;background:#000}</style>
<h2>render-scenes (rez ${args.rez}, ${args.frames} frames) ${fatal ? '- INIT FAILED' : ''}</h2>
${fatal ? `<pre class="err">${esc(fatal)}</pre>` : ''}
<div class="grid">${cards}</div>`);

    // ------------------------------------------------------------------------------------- summary
    await browser.close();
    server.close();

    const failed = results.filter(r => !r.ok);
    console.log('\n==== summary ====');
    if (fatal) console.log(`FATAL: ${fatal}`);
    for (const r of results) console.log(`${r.ok ? (r.flags.length ? 'WARN' : 'OK  ') : 'FAIL'}  ${r.name}${r.flags.length ? '  [' + r.flags.join(' ') + ']' : ''}${r.errors.length ? `  (${r.errors.length} error${r.errors.length > 1 ? 's' : ''})` : ''}`);
    console.log(`${results.length - failed.length}/${results.length} scenes without errors.  contact sheet: ${path.join(args.out, 'index.html')}`);
    process.exit(fatal || failed.length ? 1 : 0);
})().catch(e => { console.error('harness crashed:', e); process.exit(1); });
