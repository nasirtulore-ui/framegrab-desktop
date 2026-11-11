'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function resourceRoot() {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..', 'resources');
}

function binPath(name) {
  return path.join(resourceRoot(), 'bin', name);
}

function resolveYtDlp() {
  const candidates = [
    binPath('yt-dlp.exe'),
    binPath('yt-dlp'),
    path.join(process.cwd(), 'resources', 'bin', 'yt-dlp.exe'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function resolveFfmpeg() {
  const candidates = [
    binPath('ffmpeg.exe'),
    binPath('ffmpeg'),
    path.join(process.cwd(), 'resources', 'bin', 'ffmpeg.exe'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function iconPath() {
  const ico = path.join(resourceRoot(), 'icons', 'icon.ico');
  const png = path.join(resourceRoot(), 'icons', '128.png');
  if (fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return undefined;
}

module.exports = { resourceRoot, resolveYtDlp, resolveFfmpeg, iconPath };
