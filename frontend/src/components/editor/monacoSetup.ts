import { loader } from '@monaco-editor/react';
// The `monaco-editor` barrel (`import * as monaco from 'monaco-editor'`)
// additionally pulls in monaco.contribution files for every rich language
// service; importing just the core API plus the specific rich services
// languageFor() maps to keeps the lazy-loaded Files tab chunk smaller.
// basic-languages/monaco.contribution registers every "simple" language
// (python, yaml, markdown, shell, dockerfile, ...) via lazy-loaded
// grammars in this monaco-editor version, so it's cheap to include as one
// import rather than one per language. Paths are relative to the
// package's exports map ("./*" -> "./esm/vs/*.js"), not the esm/vs
// directory itself - no "esm/vs/" prefix here.
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/basic-languages/monaco.contribution';
import 'monaco-editor/language/json/monaco.contribution';
import 'monaco-editor/language/css/monaco.contribution';
import 'monaco-editor/language/html/monaco.contribution';
import 'monaco-editor/language/typescript/monaco.contribution';

function workerUrlFor(label: string): URL {
  switch (label) {
    case 'json':
      return new URL('monaco-editor/language/json/json.worker.js', import.meta.url);
    case 'css':
    case 'scss':
    case 'less':
      return new URL('monaco-editor/language/css/css.worker.js', import.meta.url);
    case 'html':
    case 'handlebars':
    case 'razor':
      return new URL('monaco-editor/language/html/html.worker.js', import.meta.url);
    case 'typescript':
    case 'javascript':
      return new URL('monaco-editor/language/typescript/ts.worker.js', import.meta.url);
    default:
      return new URL('monaco-editor/editor/editor.worker.js', import.meta.url);
  }
}

self.MonacoEnvironment = {
  // new Worker(new URL(...)) is the bundler-agnostic worker pattern Vite
  // statically analyzes - more portable across bundler versions than the
  // `?worker` import suffix, which didn't resolve for this deep
  // node_modules ESM path under Vite 8's Rolldown-based build.
  getWorker: (_workerId: string, label: string) => new Worker(workerUrlFor(label), { type: 'module' }),
};

// Use the locally bundled monaco-editor instead of @monaco-editor/react's
// default CDN loader (jsdelivr) - a self-hosted panel shouldn't need
// outbound internet access just to open the file editor, and this fails
// outright in network-restricted environments.
loader.config({ monaco });
