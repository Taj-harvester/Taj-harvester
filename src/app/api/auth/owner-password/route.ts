/**
 * ============================================================================
 * TAJ HARVESTER — OWNER PASSWORD UPDATE & FORGOT PASSWORD API ROUTE
 * ============================================================================
 * Supports:
 * 1. Updating Owner password from the Staff & Auth settings page
 * 2. Owner-only Forgot Password reset using the registered Owner email (.env OWNER_EMAIL)
 */

import { NextResponse } from 'next/server';
import { getShopState, saveShopState } from '@/lib/store';
import { getDefaultOwnerAccount } from '@/utils/shopLogic';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode, currentPassword, email, newPassword } = body || {};

    const cleanNewPass = String(newPassword || '').trim();
    if (cleanNewPass.length < 4) {
      return NextResponse.json(
        { error: 'New password must be at least 4 characters.' },
        { status: 400 }
      );
    }

    const shopState = getShopState();
    const owner = shopState.ownerAccount || getDefaultOwnerAccount();

    if (mode === 'FORGOT_EMAIL_RESET') {
      const cleanEmail = String(email || '').trim().toLowerCase();
      if (!cleanEmail || cleanEmail !== owner.email.toLowerCase()) {
        return NextResponse.json(
          {
            error:
              'Entered email does not match the registered Owner email in .env.',
          },
          { status: 401 }
        );
      }

      shopState.ownerAccount = {
        ...owner,
        password: cleanNewPass,
        updatedAt: new Date().toISOString(),
      };
      saveShopState(shopState);

      return NextResponse.json({
        message: 'Owner password has been reset successfully.',
        state: shopState,
      });
    }

    // Standard Owner password update from dashboard
    const cleanCurrPass = String(currentPassword || '').trim();
    if (cleanCurrPass !== owner.password) {
      return NextResponse.json(
        { error: 'Current Owner password is incorrect.' },
        { status: 401 }
      );
    }

    shopState.ownerAccount = {
      ...owner,
      password: cleanNewPass,
      email: email ? String(email).trim() : owner.email,
      updatedAt: new Date().toISOString(),
    };
    saveShopState(shopState);

    return NextResponse.json({
      message: 'Owner password updated successfully.',
      state: shopState,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
