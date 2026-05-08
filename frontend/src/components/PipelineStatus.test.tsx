import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PipelineStatus } from './PipelineStatus';

describe('PipelineStatus', () => {
  it('renders all pipeline steps', () => {
    render(<PipelineStatus status="downloading" />);
    expect(screen.getByText('Download')).toBeInTheDocument();
    expect(screen.getByText('Transcribe')).toBeInTheDocument();
    expect(screen.getByText('Detect clips')).toBeInTheDocument();
    expect(screen.getByText('Process')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows error message when status is failed', () => {
    render(<PipelineStatus status="failed" error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows fallback error message when failed with no error prop', () => {
    render(<PipelineStatus status="failed" />);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('does not render step indicator when failed', () => {
    render(<PipelineStatus status="failed" />);
    expect(screen.queryByText('Download')).not.toBeInTheDocument();
  });
});
