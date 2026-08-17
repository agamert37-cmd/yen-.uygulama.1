import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { XtermLogViewer } from '../../src/components/terminal/XtermLogViewer';

describe('XtermLogViewer', () => {
  // This project's vitest config doesn't set `globals: true`, so
  // @testing-library/react's automatic afterEach(cleanup) never
  // self-registers - unmount explicitly or elements from earlier tests
  // stay in the DOM and get matched instead.
  afterEach(() => {
    cleanup();
  });

  it('shows an empty-state hint when there are no lines yet', () => {
    render(<XtermLogViewer lines={[]} />);
    expect(screen.getByText('Henüz log yok.')).toBeInTheDocument();
  });

  it('hides the empty-state hint once a line has arrived', () => {
    render(<XtermLogViewer lines={[{ stream: 'stdout', data: 'hello\n', ts: 1 }]} />);
    expect(screen.queryByText('Henüz log yok.')).not.toBeInTheDocument();
  });
});
