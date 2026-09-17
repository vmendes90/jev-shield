import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const chromePaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
];

const chromePath = chromePaths.find((p) => fs.existsSync(p));

if (!chromePath) {
  console.error('Google Chrome executable not found.');
  process.exit(1);
}

const extensionPath = path.resolve('dist');
const profilePath = path.resolve('.test-profile');
const targetUrl = process.argv[2] || 'https://www.youtube.com/watch?v=zHnKXD2cFBg';

console.log(`Launching Chrome with Jev Shield loaded:`);
console.log(`- Extension: ${extensionPath}`);
console.log(`- Profile:   ${profilePath}`);
console.log(`- URL:       ${targetUrl}`);

const args = [
  `--disable-extensions-except=${extensionPath}`,
  `--load-extension=${extensionPath}`,
  `--user-data-dir=${profilePath}`,
  `--no-first-run`,
  `--no-default-browser-check`,
  targetUrl,
];

const child = spawn(chromePath, args, {
  detached: true,
  stdio: 'ignore',
});

child.unref();
console.log('Chrome launched successfully in a dedicated test thread.');
