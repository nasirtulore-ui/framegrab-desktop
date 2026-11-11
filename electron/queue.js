'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DEFAULT_SETTINGS = {
  format: 'MP4',
  quality: '1080',
  subtitle: '',
  downloadDir: '',
  concurrency: 1,
  autoUpdateYtDlp: false,
};

class QueueStore {
  constructor(userDataPath) {
    this.dir = path.join(userDataPath, 'FrameGrab');
    this.file = path.join(this.dir, 'state.json');
    this.state = {
      settings: { ...DEFAULT_SETTINGS },
      jobs: [],
    };
    this.load();
  }

  load() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.state.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
        this.state.jobs = Array.isArray(raw.jobs) ? raw.jobs : [];
      }
    } catch (_) {
      this.state = { settings: { ...DEFAULT_SETTINGS }, jobs: [] };
    }
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const slim = {
      settings: this.state.settings,
      jobs: this.state.jobs.slice(0, 300),
    };
    fs.writeFileSync(this.file, JSON.stringify(slim, null, 2), 'utf8');
  }

  getSettings() {
    return { ...this.state.settings };
  }

  updateSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    this.save();
    return this.getSettings();
  }

  listJobs() {
    return this.state.jobs.map((j) => ({ ...j }));
  }

  getJob(id) {
    return this.state.jobs.find((j) => j.id === id) || null;
  }

  addJobs(entries) {
    const created = entries.map((e) => ({
      id: randomUUID(),
      url: e.url,
      title: e.title || e.url,
      thumbnail: e.thumbnail || null,
      format: e.format || this.state.settings.format,
      quality: e.quality || this.state.settings.quality,
      subtitle: e.subtitle ?? this.state.settings.subtitle,
      outputDir: e.outputDir || this.state.settings.downloadDir,
      status: 'queued',
      percent: 0,
      speed: null,
      eta: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      outputPath: null,
    }));
    this.state.jobs = [...created, ...this.state.jobs];
    this.save();
    return created;
  }

  updateJob(id, patch) {
    const idx = this.state.jobs.findIndex((j) => j.id === id);
    if (idx < 0) return null;
    this.state.jobs[idx] = {
      ...this.state.jobs[idx],
      ...patch,
      updatedAt: Date.now(),
    };
    this.save();
    return { ...this.state.jobs[idx] };
  }

  removeJob(id) {
    this.state.jobs = this.state.jobs.filter((j) => j.id !== id);
    this.save();
  }

  clearFinished() {
    this.state.jobs = this.state.jobs.filter(
      (j) => !['complete', 'cancelled', 'failed'].includes(j.status)
    );
    this.save();
  }

  nextQueued() {
    return this.state.jobs.find((j) => j.status === 'queued') || null;
  }

  activeCount() {
    return this.state.jobs.filter((j) => j.status === 'downloading' || j.status === 'analyzing').length;
  }
}

module.exports = { QueueStore, DEFAULT_SETTINGS };
