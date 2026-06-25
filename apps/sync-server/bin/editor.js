#!/usr/bin/env node

import { parseArgs } from 'util';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
  port: {
    type: 'string',
    short: 'p',
    default: '3000'
  },
  room: {
    type: 'string',
    short: 'r',
  },
  headless: {
    type: 'boolean',
    short: 'h',
    default: false
  }
};

const { values } = parseArgs({ options, allowPositionals: true });

async function start() {
  const pc = (await import('picocolors')).default;
  let open;
  if (!values.headless) {
    open = (await import('open')).default;
  }

  console.log(pc.cyan('\nStarting CRDT Editor via tsx...'));
  
  // Run the backend in development mode to avoid compiled ESM extension issues
  const serverPath = path.resolve(__dirname, '../src/index.ts');
  
  const serverProcess = spawn('npx', ['tsx', 'watch', serverPath], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: values.port,
      CLI_MODE: 'true',
      NODE_OPTIONS: '--experimental-sqlite'
    }
  });

  setTimeout(async () => {
    const roomStr = values.room ? `?room=${encodeURIComponent(values.room)}` : '';
    const url = `http://localhost:${values.port}/${roomStr}`;
    
    console.log(pc.green('\n✔ Server started!'));
    console.log(`${pc.bold('Editor URL:')} ${pc.underline(pc.blue(url))}`);
    console.log(`${pc.bold('Port:')} ${values.port}`);
    if (values.room) {
      console.log(`${pc.bold('Room:')} ${values.room}`);
    }
    console.log('\nPress Ctrl+C to stop.\n');

    if (!values.headless && open) {
      console.log(pc.gray('Opening browser...'));
      await open(url);
    }
  }, 2000); // give it a moment to boot

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
}

start();
