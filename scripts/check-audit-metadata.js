#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SENSITIVE_KEYS = ['password', 'password_hash', 'mfa_secret', 'secret', 'private_key', 'encryption_key', 'ciphertext', 'plaintext', 'token', 'refresh_token', 'access_token'];
const ROOT = process.cwd();
let hasErrors = false;

function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    for (const key of SENSITIVE_KEYS) {
      if (lowerLine.includes('metadata:') && lowerLine.includes(key)) {
        console.error(`${filePath}:${i + 1}: metadata contains potentially sensitive key "${key}"`);
        hasErrors = true;
      }
    }
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist' && entry !== '.wrangler') {
      walk(fullPath);
    } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.js'))) {
      checkFile(fullPath);
    }
  }
}

walk(join(ROOT, 'apps/api-gateway/src'));

if (hasErrors) {
  console.error('\n❌ Audit metadata check failed: sensitive keys found in metadata');
  process.exit(1);
} else {
  console.log('✅ Audit metadata check passed: no sensitive keys found in metadata');
  process.exit(0);
}
