# BPMN Studio

A free, professional, browser-based BPMN 2.0 editor. No backend, no accounts, no telemetry —
everything runs in the browser and files live on the user's own disk. Deployed as a static
bundle to [bpmnstudio.dplooy.com](https://bpmnstudio.dplooy.com).

## Architecture

The application is a Vite multi-page build: the editor SPA at `/` plus five prerendered
content pages (`/bpmn-symbols/`, `/bpmn-tutorial/`, `/bpmn-vs-flowchart/`, `/bpmn-examples/`,
`/how-it-works/`) that ship as plain static HTML so crawlers need no JavaScript.

```
src/
  bpmn/        modeler and viewer factories, custom modules (space-pan,
               cross-tab clipboard), template builder, auto-layout for
               files without diagram interchange
  validation/  the rules engine (runs in a Web Worker), rule set, worker glue
  export/      SVG/PNG rasterization, share-link codec, process step list,
               documentation report
  files/       File System Access API + fallbacks, encoding-aware decoding
  storage/     IndexedDB (autosave, recents, settings, file handles)
  diff/        structural comparison of two BPMN files
  desktop/     the full editor: app shell, landing, editor, dialogs
  mobile/      the phone viewer (NavigatedViewer bundle only)
  seo/         stylesheet shared by the static content pages
  ui/          dialog, menu, notice primitives
```

Rendering is [bpmn-js](https://bpmn.io) (Apache 2.0), the engine behind Camunda Modeler,
with `bpmn-js-properties-panel` for element attributes. The bpmn.io watermark is required
by its license and must not be removed.

### Code splitting

`src/main.tsx` detects the device class. Phones load only the viewer chunk (~150 KB
gzipped); the modeler, palette, and properties panel (~370 KB gzipped) load only for
desktop/tablet editing. The validation engine and its worker are separate chunks.

## The local-only data model, plainly

There is no server. Nothing is uploaded, ever.

- **Files** are opened from and saved to disk with the File System Access API where
  available, otherwise via file picker and download.
- **Autosave** writes to IndexedDB in the user's browser ~2 s after each change; a
  recovery offer appears on the next visit. "Clear local data" (Tools menu) removes
  every stored byte.
- **Share links** deflate-compress the diagram XML into the URL fragment (after `#`),
  which browsers never transmit to any server. Links longer than ~30k characters are
  refused with an explanation, since browsers and chat apps truncate them.
- **Offline**: a service worker (`public/sw.js`) caches the app shell after the first
  visit; the editor then works with no network at all.

## Browser support per feature

| Feature | Chrome/Edge | Firefox | Safari |
| --- | --- | --- | --- |
| Modeling, validation, export | Yes | Yes | Yes |
| Save in place (Ctrl+S overwrites the file) | Yes (FSA) | Download fallback | Download fallback |
| Share links (CompressionStream) | Yes | Yes (115+) | Yes (16.4+) |
| System share sheet | Yes | No (download) | Yes |
| Autosave (IndexedDB) | Yes | Yes (off in strict private mode, with notice) | Yes |
| Offline (service worker) | Yes | Yes | Yes |

Every capability is feature-detected in `src/env.ts` and degrades individually with a
user-visible notice — never wholesale.

## Adding a validation rule

Rules live in `src/validation/rules.ts`. A rule is an object with a stable `id` and a
`run(ctx, report)` function; the engine executes every rule in the `RULES` array and
deduplicates findings.

```ts
const myRule: Rule = {
  id: "my-rule",
  run(ctx, report) {
    for (const { el } of ctx.nodes) {
      if (somethingWrong(el)) {
        report(
          "warning", // "error" | "warning" | "hint"
          `${label(el)} has a problem — and this is what it breaks downstream.`,
          el,
        );
      }
    }
  },
};
// then add it to the RULES array at the bottom of the file
```

Write messages in plain language: state the problem *and its consequence*. The context
(`src/validation/model.ts`) provides pre-walked nodes, flows, processes, and lookup maps;
rules never need to traverse moddle themselves. Rules run inside a Web Worker, so heavy
graph work does not block the canvas.

## Development

```
npm install
npm run dev        # dev server
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build
node scripts/generate-icons.mjs   # regenerate favicon/PWA/OG assets from the logo
```

`npm run build` produces a fully static `dist/` deployable to any static host with no
server configuration.
