import './monacoSetup';
import Editor from '@monaco-editor/react';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  html: 'html',
  css: 'css',
  yml: 'yaml',
  yaml: 'yaml',
  py: 'python',
  env: 'shell',
  sh: 'shell',
};

function languageFor(filePath: string): string {
  const filename = filePath.split('/').pop() ?? '';
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  const ext = filename.includes('.') ? (filename.split('.').pop() ?? '') : '';
  return LANGUAGE_BY_EXTENSION[ext.toLowerCase()] ?? 'plaintext';
}

interface Props {
  path: string;
  value: string;
  onChange: (value: string) => void;
}

export function MonacoEditor({ path, value, onChange }: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      <Editor
        height="500px"
        path={path}
        language={languageFor(path)}
        value={value}
        onChange={(next) => onChange(next ?? '')}
        options={{ minimap: { enabled: false }, fontSize: 13, automaticLayout: true }}
      />
    </div>
  );
}
