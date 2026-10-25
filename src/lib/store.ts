/**
 * ============================================================================
 * TAJ HARVESTER — ATOMIC MULTI-USER SERVER STORE (src/lib/store.ts)
 * ============================================================================
 * Maintains the single source-of-truth ShopState across all Owner and Staff
 * sessions and API route workers.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ShopState } from '@/types/shop';
import { generateInitialShopState, getDefaultOwnerAccount } from '@/utils/shopLogic';

const STORE_PATH = path.join(os.tmpdir(), 'taj-harvester-store-v6.json');

declare global {
  var globalShopState: ShopState | undefined;
}

export function getShopState(): ShopState {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as ShopState;
      if (
        parsed &&
        parsed.schemaVersion === 6 &&
        Array.isArray(parsed.parts) &&
        parsed.parts.length >= 1
      ) {
        if (!parsed.ownerAccount) {
          parsed.ownerAccount = getDefaultOwnerAccount();
        }
        if (!Array.isArray(parsed.staffAccounts)) {
          parsed.staffAccounts = [];
        }
        global.globalShopState = parsed;
        return parsed;
      }
    }
  } catch {
    if (global.globalShopState && global.globalShopState.schemaVersion === 6) {
      return global.globalShopState;
    }
  }

  const initial = generateInitialShopState();
  saveShopState(initial);
  return initial;
}

export function saveShopState(state: ShopState): void {
  global.globalShopState = state;
  try {
    const tmpPath = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf-8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(state), 'utf-8');
    } catch {
      // Read-only fallback
    }
  }
}
