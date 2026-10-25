import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { syncStateToMongo } from '@/lib/mongodb';
import type { BackupSnapshot } from '@/types/shop';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { type, actor } = await request.json();
    let shopState = getShopState();
    const nowIso = new Date().toISOString();
    const activeParts = shopState.parts.filter((p) => !p.isArchived);
    const totalStockValue = activeParts.reduce((s, p) => s + p.price * p.stockQty, 0);

    const snapshot: BackupSnapshot = {
      id: `bkp-${Date.now()}`,
      createdAt: nowIso,
      type: type === 'AUTO_DAILY' ? 'AUTO_DAILY' : 'MANUAL_EXCEL',
      partsCount: activeParts.length,
      billsCount: shopState.bills.length,
      activeDuesCount: shopState.dues.filter((d) => d.status === 'ACTIVE_DUE').length,
      totalStockValue,
      triggeredBy: actor || 'tajharvester000 (Manual CSV Download)',
    };

    shopState = {
      ...shopState,
      backups: [snapshot, ...shopState.backups],
      auditLogs: [
        {
          id: `audit-${Date.now()}`,
          timestamp: nowIso,
          action: 'BACKUP_EXPORTED',
          actor: actor || 'tajharvester000',
          summary: `Exported CSV backup snapshot (${snapshot.partsCount} active parts, stock value ₹${snapshot.totalStockValue.toLocaleString('en-IN')})`,
          referenceId: snapshot.id,
        },
        ...shopState.auditLogs,
      ],
    };

    saveShopState(shopState);
    syncStateToMongo(shopState).catch(() => {});
    return NextResponse.json({ snapshot, state: shopState }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
