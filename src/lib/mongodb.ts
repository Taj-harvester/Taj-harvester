import { MongoClient } from 'mongodb';
import type { ShopState } from '@/types/shop';

const MONGODB_URI = process.env.MONGODB_URI?.trim() || '';
const MONGODB_DATABASE = 'partsshop';

declare global {
  var _mongoClientPromise: Promise<MongoClient> | null | undefined;
  var _mongoIsConnected: boolean | undefined;
}

export async function getMongoClient(): Promise<MongoClient | null> {
  if (!MONGODB_URI) {
    console.error('MongoDB connection skipped: MONGODB_URI is not configured.');
    global._mongoIsConnected = false;
    return null;
  }
  try {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 2500,
        connectTimeoutMS: 2500,
      });
      global._mongoClientPromise = client.connect();
    }
    const connected = await global._mongoClientPromise;
    await connected.db(MONGODB_DATABASE).command({ ping: 1 });
    global._mongoIsConnected = true;
    console.log(`MongoDB connected: database "${MONGODB_DATABASE}"`);
    return connected;
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    global._mongoClientPromise = null;
    global._mongoIsConnected = false;
    return null;
  }
}

export function isMongoConnected(): boolean {
  return Boolean(global._mongoIsConnected);
}

export async function syncStateToMongo(state: ShopState): Promise<void> {
  try {
    const client = await getMongoClient();
    if (!client) return;
    const db = client.db(MONGODB_DATABASE);
    await db
      .collection('shop_state')
      .updateOne(
        { _id: 'taj_harvester_main_v4' as unknown as import('mongodb').ObjectId },
        { $set: { ...state, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
  } catch (error) {
    console.error('MongoDB state sync failed:', error);
  }
}
