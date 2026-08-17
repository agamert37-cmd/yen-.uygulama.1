import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '../../src/components/project/StatusBadge';

describe('StatusBadge', () => {
  it('renders the Turkish label for the running status', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText('Çalışıyor')).toBeInTheDocument();
  });

  it('renders a distinct label for the error status', () => {
    render(<StatusBadge status="error" />);
    expect(screen.getByText('Hata')).toBeInTheDocument();
  });

  it('renders a distinct label for the idle status', () => {
    render(<StatusBadge status="idle" />);
    expect(screen.getByText('Boşta')).toBeInTheDocument();
  });
});
