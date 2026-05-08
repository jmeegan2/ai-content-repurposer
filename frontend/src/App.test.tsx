import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

vi.mock('./api', () => ({
  createJob: vi.fn(),
  getJob: vi.fn(),
}));

import { createJob, getJob } from './api';

const mockJob = (status = 'queued') => ({
  id: 'job-1',
  youtubeUrl: 'https://youtube.com/watch?v=abc',
  status,
  clips: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App', () => {
  it('renders the url form on load', () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/youtube/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate clips/i })).toBeInTheDocument();
  });

  it('shows pipeline status after submitting a url', async () => {
    vi.mocked(createJob).mockResolvedValue(mockJob('downloading'));
    vi.mocked(getJob).mockResolvedValue(mockJob('done'));

    render(<App />);
    await userEvent.type(screen.getByRole('textbox'), 'https://youtube.com/watch?v=abc');
    await userEvent.click(screen.getByRole('button', { name: /generate clips/i }));

    await waitFor(() => {
      expect(screen.getByText('Download')).toBeInTheDocument();
    });
  });

  it('shows error message when job creation fails', async () => {
    vi.mocked(createJob).mockRejectedValue(new Error('Invalid YouTube URL'));

    render(<App />);
    await userEvent.type(screen.getByRole('textbox'), 'https://youtube.com/watch?v=abc');
    await userEvent.click(screen.getByRole('button', { name: /generate clips/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid YouTube URL')).toBeInTheDocument();
    });
  });

  it('shows clips when job is done', async () => {
    const doneJob = {
      ...mockJob('done'),
      clips: [{
        id: 'clip-1',
        title: 'Great moment',
        startTime: 10,
        endTime: 70,
        s3Key: 'clips/job-1/clip-1.mp4',
        s3Url: 'https://s3.example.com/clip.mp4',
      }],
    };
    vi.mocked(createJob).mockResolvedValue(doneJob);
    vi.mocked(getJob).mockResolvedValue(doneJob);

    render(<App />);
    await userEvent.type(screen.getByRole('textbox'), 'https://youtube.com/watch?v=abc');
    await userEvent.click(screen.getByRole('button', { name: /generate clips/i }));

    await waitFor(() => {
      expect(screen.getByText('Great moment')).toBeInTheDocument();
    });
  });
});
