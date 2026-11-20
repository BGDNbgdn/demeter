#!/usr/bin/env node
/**
 * Builds the app for GitHub Pages and publishes dist/ to the `gh-pages` branch.
 *   npm run deploy
 * The base path is derived from the `origin` remote (https://github.com/<user>/<repo>) → "/<repo>/".
 * For a user/organisation site (<user>.github.io) set BASE_PATH=/ yourself.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ghpages from 'gh-pages';

const remote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
const repo = remote.replace(/\.git$/, '').split(/[/:]/).pop();
const base = process.env.BASE_PATH ?? `/${repo}/`;

console.log(`Building with BASE_PATH=${base}`);
execSync('npm run build', { stdio: 'inherit', env: { ...process.env, BASE_PATH: base } });
fs.writeFileSync(path.join('dist', '.nojekyll'), '');

await new Promise((resolve, reject) =>
  ghpages.publish('dist', { branch: 'gh-pages', dotfiles: true, message: `Deploy ${new Date().toISOString()}` }, err => (err ? reject(err) : resolve())),
);
console.log('Published to the gh-pages branch.');
