import { MongoClient, type Db } from 'mongodb';
import type { ShopState } from '@/types/shop';

const MONGODB_URI = process.env.MONGODB_URI?.trim() || '';
const MONGODB_DATABASE = 'partsshop';
const SHOP_STATE_ID = 'taj_harvester_main_v4';
type ShopStateDocument = ShopState & {
  _id: string;
  updatedAt: string;
};

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

async function getDatabase(): Promise<Db> {
  const client = await getMongoClient();
  if (!client) {
    throw new Error('MongoDB is not configured or unavailable.');
  }
  return client.db(MONGODB_DATABASE);
}

export async function loadStateFromMongo(): Promise<ShopState | null> {
  const db = await getDatabase();
  const document = await db.collection<ShopStateDocument>('shop_state').findOne({
    _id: SHOP_STATE_ID,
  });
  if (!document) return null;
  const { _id: _ignoredId, updatedAt: _ignoredUpdatedAt, ...state } = document;
  if (state.schemaVersion !== 6 || !Array.isArray(state.parts)) {
    throw new Error('MongoDB shop state has an invalid schema.');
  }
  return state;
}

export async function syncStateToMongo(state: ShopState): Promise<void> {
  const db = await getDatabase();
  await db.collection<ShopStateDocument>('shop_state').replaceOne(
    { _id: SHOP_STATE_ID },
    { ...state, updatedAt: new Date().toISOString() },
    { upsert: true }
  );
}
