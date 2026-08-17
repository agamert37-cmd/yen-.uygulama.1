export type LogStream = 'stdout' | 'stderr';

export interface LogLine {
  stream: LogStream;
  data: string;
  ts: number;
}

const MAX_LINES_PER_PROJECT = 500;

const buffers = new Map<string, LogLine[]>();

export function appendLog(projectId: string, stream: LogStream, data: string): void {
  const buffer = buffers.get(projectId) ?? [];
  buffer.push({ stream, data, ts: Date.now() });
  while (buffer.length > MAX_LINES_PER_PROJECT) buffer.shift();
  buffers.set(projectId, buffer);
}

export function getRecentLogs(projectId: string, tail = 200): LogLine[] {
  const buffer = buffers.get(projectId) ?? [];
  return buffer.slice(-tail);
}

export function clearLogs(projectId: string): void {
  buffers.delete(projectId);
}
