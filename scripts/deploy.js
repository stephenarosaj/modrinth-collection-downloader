import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const targetBranch = process.argv[2]?.trim() || 'gh-pages';

const ghPagesBin = resolve(process.cwd(), 'node_modules/.bin/gh-pages');
if (!existsSync(ghPagesBin)) {
  console.error(`Error: Could not find gh-pages executable at ${ghPagesBin}`);
  process.exit(1);
}

function run(command, options = { stdio: 'inherit' }) {
  return execSync(command, {
    encoding: 'utf8',
    stdio: options.stdio,
  });
}

function getCurrentBranch() {
  try {
    return run('git symbolic-ref --short HEAD', { stdio: 'pipe' }).trim();
  } catch {
    return '';
  }
}

function localBranchExists(branch) {
  try {
    run(`git rev-parse --verify --quiet refs/heads/${branch}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function remoteBranchExists(branch) {
  try {
    run(`git rev-parse --verify --quiet refs/remotes/origin/${branch}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

console.log(`Publishing dist to remote branch "${targetBranch}" via gh-pages...`);
run(`"${ghPagesBin}" -d dist -b "${targetBranch}"`);
console.log(`Successfully published dist to remote branch "origin/${targetBranch}".`);

const currentBranch = getCurrentBranch();

if (currentBranch === targetBranch) {
  console.log(`Currently on "${targetBranch}", pulling latest changes...`);
  run(`git pull origin "${targetBranch}"`);
} else {
  if (localBranchExists(targetBranch)) {
    console.log(`Updating local branch "${targetBranch}" without switching branches...`);
    run(`git fetch origin "${targetBranch}:${targetBranch}"`);
  } else if (remoteBranchExists(targetBranch)) {
    console.log(`Creating tracking local branch "${targetBranch}" from "origin/${targetBranch}"...`);
    run(`git branch --track "${targetBranch}" "origin/${targetBranch}"`);
  } else {
    run(`git fetch origin "${targetBranch}:${targetBranch}"`);
  }
}

if (currentBranch) {
  const activeBranch = getCurrentBranch();
  console.log(`Deployment complete. Active branch remains "${activeBranch}".`);
}
