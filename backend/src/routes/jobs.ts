import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Job } from '../types/index.js';
import { runPipeline } from '../services/pipeline.js';

const router = Router();

// In-memory store for now — will be replaced with a DB
const jobs = new Map<string, Job>();

function updateJob(id: string, patch: Partial<Job>) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, ...patch, updatedAt: new Date().toISOString() });
}

router.post('/', (req, res) => {
  const { youtubeUrl } = req.body as { youtubeUrl?: string };

  if (!youtubeUrl || !youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
    res.status(400).json({ error: 'Valid YouTube URL required' });
    return;
  }

  const job: Job = {
    id: uuidv4(),
    youtubeUrl,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    clips: [],
  };

  jobs.set(job.id, job);
  runPipeline(job.id, youtubeUrl, updateJob);

  res.status(201).json(job);
});

router.get('/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

router.get('/', (_req, res) => {
  res.json(Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ));
});

export default router;
