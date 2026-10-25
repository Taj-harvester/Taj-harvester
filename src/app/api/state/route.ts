import { NextResponse } from 'next/server';
import { getShopState } from '@/lib/store';
import { getMongoClient, isMongoConnected } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  const shopState = getShopState();
  await getMongoClient();
  return NextResponse.json({
    ...shopState,
    meta: {
      mongoConnected: isMongoConnected(),
      clerkConfigured: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
    },
  });
}
