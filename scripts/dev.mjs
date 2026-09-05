import { spawn } from 'node:child_process';
const processes = [
  spawn(process.execPath, ['engine/server.mjs'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev'], {
    stdio: 'inherit',
  }),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const p of processes) p.kill('SIGTERM');
}
for (const p of processes) {
  p.on('exit', () => {
    stop();
  });
  p.on('error', (e) => {
    console.error(e.message);
    stop();
    process.exitCode = 1;
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
