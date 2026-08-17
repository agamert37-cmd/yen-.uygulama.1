import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useEffect, useRef } from 'react';
import type { LogLine } from '../../types/project';

export function XtermLogViewer({ lines }: { lines: LogLine[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const writtenCountRef = useRef(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      theme: { background: '#0f172a' },
      disableStdin: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    writtenCountRef.current = 0;

    const handleResize = (): void => fit.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      termRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    for (let i = writtenCountRef.current; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line) continue;
      term.write(line.stream === 'stderr' ? `\x1b[31m${line.data}\x1b[0m` : line.data);
    }
    writtenCountRef.current = lines.length;
  }, [lines]);

  return (
    <div className="relative h-[500px] w-full overflow-hidden rounded-lg border border-gray-800 bg-slate-900">
      <div ref={containerRef} className="h-full w-full p-2" />
      {lines.length === 0 && (
        <p className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-gray-500">
          Henüz log yok.
        </p>
      )}
    </div>
  );
}
