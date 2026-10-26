/**
 * ============================================================================
 * TAJ HARVESTER — ATOMIC MULTI-USER SERVER STORE (src/lib/store.ts)
 * ============================================================================
 * Maintains the single source-of-truth ShopState across all Owner and Staff
 * sessions and API route workers.
 */

import type { ShopState } from '@/types/shop';
import { getDefaultOwnerAccount } from '@/utils/shopLogic';
import { loadStateFromMongo, syncStateToMongo } from './mongodb';

function createEmptyShopState(): ShopState {
  return {
    schemaVersion: 6,
    ownerAccount: getDefaultOwnerAccount(),
    staffAccounts: [],
    parts: [],
    bills: [],
    dues: [],
    dealers: [],
    dealerOrders: [],
    auditLogs: [],
    backups: [],
  };
}

export async function getShopState(): Promise<ShopState> {
  const storedState = await loadStateFromMongo();
  if (storedState) {
    if (!storedState.ownerAccount) {
      storedState.ownerAccount = getDefaultOwnerAccount();
    }
    if (!Array.isArray(storedState.staffAccounts)) {
      storedState.staffAccounts = [];
    }
    return storedState;
  }

  const initial = createEmptyShopState();
  await saveShopState(initial);
  return initial;
}

export async function saveShopState(state: ShopState): Promise<void> {
  await syncStateToMongo(state);
}
