#!/usr/bin/env node
/**
 * Start backend server, wait for it to be ready, then start Electron.
 * Run from project root: npm run start:all
 */
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const PORT = 3001;
const ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(ROOT, 'server');

function waitForPort(port, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      const socket = net.createConnection(port, '127.0.0.1', () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Port ${port} did not open in time`));
          return;
        }
        setTimeout(tryConnect, 300);
      });
    }
    tryConnect();
  });
}

const serverProc = spawn(process.execPath, ['server.js'], {
  cwd: SERVER_DIR,
  stdio: 'inherit',
  env: { ...process.env, PORT: String(PORT) }
});

serverProc.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

waitForPort(PORT)
  .then(() => {
    const electronProc = spawn('npx', ['electron', '.'], {
      cwd: ROOT,
      stdio: 'inherit'
    });
    electronProc.on('exit', (code) => {
      serverProc.kill();
      process.exit(code ?? 0);
    });
  })
  .catch((err) => {
    console.error(err.message);
    serverProc.kill();
    process.exit(1);
  });
