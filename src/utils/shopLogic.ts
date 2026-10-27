/**
 * ============================================================================
 * TAJ HARVESTER — CORE BUSINESS LOGIC & INVENTORY ENGINE
 * ============================================================================
 * Pure, unit-tested business functions for:
 * 1. 4 Database Sets ('kubota', 'yanmar', 'gm', 'local') & (org) label formatting
 * 2. 5-Column CSV Export & Restore (Part Number, Part Name, Rack No, Count, Selling Price)
 * 3. Per-Part Discount Billing & Atomic Stock Deduction
 * 4. Pending Customer Dues (Khata) & Bill Deletion
 * 5. Owner (.env) & Staff Credentials Management
 */

import * as XLSX from 'xlsx';
import type {
  AuditLogEntry,
  BackupSnapshot,
  Bill,
  BillItem,
  Dealer,
  DealerOrder,
  OwnerAccount,
  PartSet,
  PaymentMode,
  PaymentStatus,
  PendingDue,
  ShopState,
  SparePart,
  StaffAccount,
} from '../types/shop.ts';

export const TAJ_HARVESTER_SHOP_INFO = {
  name: 'TAJ HARVESTER',
  address: 'Jayer, Pandua, Hooghly',
  phone: '7872339053 / 8337803644',
  gstin: '19BBKPM0354H1ZK',
} as const;

const BILL_INVOICE_PREFIX = 'INV-85';
const BILL_INVOICE_START = 8901;

export interface PaginatedBillPage {
  pageNumber: number;
  totalPages: number;
  startIndex: number;
  items: BillItem[];
  pageSubtotal: number;
  pageDiscount: number;
  pageNetTotal: number;
}

/**
 * Splits a bill's line items into print-ready pages (default 20 items per page)
 * so every A4 bill page has a fixed 20-row table.
 */
export function paginateBillItemsForPrint(
  items: BillItem[],
  itemsPerPage = 20
): PaginatedBillPage[] {
  const safePerPage = Math.max(1, itemsPerPage);
  if (!items || items.length === 0) {
    return [
      {
        pageNumber: 1,
        totalPages: 1,
        startIndex: 0,
        items: [],
        pageSubtotal: 0,
        pageDiscount: 0,
        pageNetTotal: 0,
      },
    ];
  }

  const totalPages = Math.ceil(items.length / safePerPage);
  const pages: PaginatedBillPage[] = [];

  for (let p = 0; p < totalPages; p++) {
    const startIndex = p * safePerPage;
    const chunk = items.slice(startIndex, startIndex + safePerPage);
    const pageSubtotal = chunk.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
    const pageDiscount = chunk.reduce((s, it) => s + (it.discount || 0), 0);
    const pageNetTotal = chunk.reduce((s, it) => s + it.lineTotal, 0);

    pages.push({
      pageNumber: p + 1,
      totalPages,
      startIndex,
      items: chunk,
      pageSubtotal,
      pageDiscount,
      pageNetTotal,
    });
  }

  return pages;
}

/**
 * Checks if a bill timestamp belongs to the current active operating day
 * (matches current UTC/IST date or seed operating date 2026-10-18).
 */
export function isTodayBill(createdAt: string, nowIso = new Date().toISOString()): boolean {
  if (!createdAt) return false;
  const todayPrefix = nowIso.slice(0, 10);
  return createdAt.startsWith(todayPrefix) || createdAt.startsWith('2026-10-18');
}

export const PART_SET_META: Record<
  PartSet,
  {
    id: PartSet;
    label: string;
    shortLabel: string;
    codePrefix: string;
    rackPrefix: string;
    brandPrefix: string;
    isOriginal: boolean;
  }
> = {
  kubota: {
    id: 'kubota',
    label: 'Kubota Original Parts',
    shortLabel: 'Kubota Original',
    codePrefix: 'KB',
    rackPrefix: 'K',
    brandPrefix: 'Kubota',
    isOriginal: true,
  },
  yanmar: {
    id: 'yanmar',
    label: 'Yanmar Original Parts',
    shortLabel: 'Yanmar Original',
    codePrefix: 'YM',
    rackPrefix: 'Y',
    brandPrefix: 'Yanmar',
    isOriginal: true,
  },
  gm: {
    id: 'gm',
    label: 'GM Original Parts',
    shortLabel: 'GM Original',
    codePrefix: 'GM',
    rackPrefix: 'G',
    brandPrefix: 'GM',
    isOriginal: true,
  },
  local: {
    id: 'local',
    label: 'Local Parts',
    shortLabel: 'Local Parts',
    codePrefix: 'LC',
    rackPrefix: 'L',
    brandPrefix: 'Local',
    isOriginal: false,
  },
  others: {
    id: 'others',
    label: 'Others (No Part No.)',
    shortLabel: 'Others',
    codePrefix: 'N/A',
    rackPrefix: 'BIN',
    brandPrefix: 'Others',
    isOriginal: false,
  },
};

const SET_ORDER: PartSet[] = ['kubota', 'yanmar', 'gm', 'local'];
const ALL_PART_SETS: PartSet[] = ['kubota', 'yanmar', 'gm', 'local', 'others'];

const SET_MODELS: Record<PartSet, string[]> = {
  kubota: ['Kubota DC-68G', 'Kubota MU5502', 'Kubota MU4501', 'Kubota PRO-888'],
  yanmar: ['Yanmar AW70G', 'Yanmar YH850', 'Yanmar YM348A', 'Yanmar AG600'],
  gm: ['GM Combine 900', 'GM Harvester 4WD', 'GM Axial Pro', 'GM Heavy Duty'],
  local: [
    'Local Kartar 4000',
    'Local John Deere 5310',
    'Local Mahindra 575',
    'Local Swaraj 855',
    'Local Preet 987',
    'Local Sonalika 750',
  ],
  others: ['General Hardware', 'Workshop Consumable'],
};

const PART_TEMPLATES = [
  { baseName: 'Combine Cutter Bar Blade Forged', basePrice: 185, minStock: 40 },
  { baseName: 'Knife Guard Double Finger Heavy Duty', basePrice: 340, minStock: 30 },
  { baseName: 'Hydraulic Gear Pump Assembly', basePrice: 6850, minStock: 4 },
  { baseName: 'Dual Clutch Plate 12-Inch Cerametallic', basePrice: 4250, minStock: 6 },
  { baseName: 'Clutch Release Bearing Sealed', basePrice: 890, minStock: 10 },
  { baseName: 'Threshing Drum Concave Bar Set', basePrice: 5400, minStock: 3 },
  { baseName: 'Straw Walker Crankshaft Bearing', basePrice: 1120, minStock: 12 },
  { baseName: 'Elevator Chain 42-Link Roller', basePrice: 3650, minStock: 5 },
  { baseName: 'Harvester Flat Drive Belt Kevlar', basePrice: 2890, minStock: 6 },
  { baseName: 'Fuel Water Separator Filter Spin-On', basePrice: 460, minStock: 25 },
  { baseName: 'Primary Air Filter Element Outer', basePrice: 780, minStock: 15 },
  { baseName: 'Hydraulic Return Line Oil Filter', basePrice: 920, minStock: 12 },
  { baseName: 'Power Steering Cylinder Seal Kit', basePrice: 640, minStock: 10 },
  { baseName: 'PTO Shaft Universal Cross Joint', basePrice: 1250, minStock: 8 },
  { baseName: 'Water Pump Impeller Assembly', basePrice: 2150, minStock: 5 },
  { baseName: 'Cylinder Head Gasket Multi-Layer Steel', basePrice: 1480, minStock: 8 },
  { baseName: 'Diesel Fuel Injector Nozzle Calibrated', basePrice: 1950, minStock: 8 },
  { baseName: 'Alternator 12V 65A Dust-Proof', basePrice: 5800, minStock: 3 },
  { baseName: 'Self-Starter Solenoid Switch High-Torque', basePrice: 1320, minStock: 8 },
  { baseName: 'Front Axle King Pin Bush & Thrust Kit', basePrice: 1680, minStock: 6 },
  { baseName: 'Tie Rod End Assembly Left/Right', basePrice: 980, minStock: 10 },
  { baseName: 'Oil Immersed Brake Disc Friction Liner', basePrice: 1150, minStock: 12 },
];

/**
 * Determines which of the 5 database sets a part belongs to ('kubota' | 'yanmar' | 'gm' | 'local' | 'others').
 */
export function detectPartSet(
  partNumber: string,
  partName: string,
  explicitSet?: PartSet,
  rackLocation = ''
): PartSet {
  if (explicitSet && ALL_PART_SETS.includes(explicitSet)) {
    return explicitSet;
  }
  const cleanCode = (partNumber || '').trim().toUpperCase();
  if (!cleanCode || cleanCode === 'N/A' || cleanCode === '—' || cleanCode === 'NONE' || cleanCode === '-') {
    return 'others';
  }
  const cleanRack = (rackLocation || '').trim().toUpperCase();
  const combined = `${partNumber || ''} ${partName || ''} ${rackLocation || ''}`.toLowerCase();

  if (
    combined.includes('gm ') ||
    combined.startsWith('gm-') ||
    combined.includes('gam ') ||
    combined.startsWith('gam-') ||
    cleanRack.startsWith('GAM') ||
    cleanCode.startsWith('GM-') ||
    cleanCode.startsWith('W1.8') ||
    cleanCode.startsWith('W2.') ||
    cleanCode.startsWith('W25') ||
    cleanCode.startsWith('WD-') ||
    cleanCode.startsWith('WD.') ||
    cleanCode.startsWith('Y25') ||
    cleanCode.startsWith('L18X')
  ) {
    return 'gm';
  }
  if (
    combined.includes('kubota') ||
    cleanCode.startsWith('KB-') ||
    /^(5T|5H|1J|3C|1G|1C|TC|TD|RD)[0-9A-Z]/i.test(cleanCode)
  ) {
    return 'kubota';
  }
  if (
    combined.includes('yanmar') ||
    cleanCode.startsWith('YM-') ||
    /^(1E|168|198|243|158|1A|1B)[0-9A-Z]/i.test(cleanCode)
  ) {
    return 'yanmar';
  }
  return 'local';
}

/**
 * Checks whether a part belongs to one of the 3 Original sets (Kubota, Yanmar, GM).
 */
export function isOriginalPart(
  partSet?: PartSet,
  partNumber = '',
  nameModel = ''
): boolean {
  const resolvedSet = detectPartSet(partNumber, nameModel, partSet);
  return resolvedSet === 'kubota' || resolvedSet === 'yanmar' || resolvedSet === 'gm';
}

/**
 * Formats the Part Name for Customer Bills and Printed Invoices:
 * Appends "(org)" to every original part (Kubota, Yanmar, GM) and leaves Local parts unchanged.
 */
export function formatBillPartName(
  nameModel: string,
  partSet?: PartSet,
  partNumber = ''
): string {
  const cleanName = nameModel.replace(/\s*\(org\)\s*$/i, '').trim();
  if (isOriginalPart(partSet, partNumber, cleanName)) {
    return `${cleanName} (org)`;
  }
  return cleanName;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Hydration-safe deterministic date-time formatter (IST UTC+5:30).
 * Ensures identical output on both Node.js SSR and client browsers.
 */
export function formatDateTimeDisplay(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = MONTH_NAMES[ist.getUTCMonth()] || 'Jan';
  const year = ist.getUTCFullYear();
  const hours24 = ist.getUTCHours();
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = String(hours24 % 12 || 12).padStart(2, '0');
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours12}:${minutes} ${ampm}`;
}

/**
 * Hydration-safe deterministic short date formatter (IST UTC+5:30).
 * Ensures identical output on both Node.js SSR and client browsers.
 */
export function formatDateShortDisplay(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = MONTH_NAMES[ist.getUTCMonth()] || 'Jan';
  const year = ist.getUTCFullYear();
  return `${day} ${month} ${year}`;
}


const OTHERS_SEED_ITEMS: {
  nameModel: string;
  rackLocation: string;
  stockQty: number;
  price: number;
  minStockLevel: number;
}[] = [
  {
    nameModel: 'High Tensile Nut Bolt Set (10mm / 12mm / 14mm)',
    rackLocation: 'Bin O-01 (Counter)',
    stockQty: 250,
    price: 20,
    minStockLevel: 50,
  },
  {
    nameModel: 'Heavy Duty Plain Washer Assorted Pack',
    rackLocation: 'Bin O-02 (Counter)',
    stockQty: 400,
    price: 10,
    minStockLevel: 80,
  },
  {
    nameModel: 'Hardened Spring Washer (Lock Washer)',
    rackLocation: 'Bin O-03 (Counter)',
    stockQty: 350,
    price: 10,
    minStockLevel: 60,
  },
  {
    nameModel: 'Silicone Gasket Gum / Bond Tube (RTV High-Temp)',
    rackLocation: 'Bin O-04 (Shelf 1)',
    stockQty: 45,
    price: 120,
    minStockLevel: 10,
  },
  {
    nameModel: 'Anti-Rust Penetrating Rosting Spray (400ml Can)',
    rackLocation: 'Bin O-05 (Shelf 1)',
    stockQty: 35,
    price: 220,
    minStockLevel: 8,
  },
  {
    nameModel: 'Split Cotter Pin Assorted Size Pack',
    rackLocation: 'Bin O-06 (Counter)',
    stockQty: 180,
    price: 15,
    minStockLevel: 40,
  },
  {
    nameModel: 'Hydraulic Grease Nipple Brass (Straight / Bend)',
    rackLocation: 'Bin O-07 (Counter)',
    stockQty: 160,
    price: 25,
    minStockLevel: 30,
  },
  {
    nameModel: 'Heavy Duty Hose Pipe Clamp Clip',
    rackLocation: 'Bin O-08 (Counter)',
    stockQty: 110,
    price: 35,
    minStockLevel: 25,
  },
  {
    nameModel: 'Nitrile Rubber O-Ring Seal Assorted',
    rackLocation: 'Bin O-09 (Counter)',
    stockQty: 220,
    price: 15,
    minStockLevel: 40,
  },
  {
    nameModel: 'Heavy Duty Nylon Cable Tie / Harvester Wire Lock',
    rackLocation: 'Bin O-10 (Counter)',
    stockQty: 140,
    price: 60,
    minStockLevel: 20,
  },
];

/**
 * Generates 1,040 deterministic spare parts across the 4 coded sets:
 * - kubota (260 parts)
 * - yanmar (260 parts)
 * - gm (260 parts)
 * - local (260 parts)
 * Plus 10 "Others" items with no part number (Nut Bolt, Washer, Spring Washer, Gum, Rosting Spray, etc.)
 */
export function generateSeedParts(count = 1040): SparePart[] {
  const parts: SparePart[] = [];

  for (let i = 0; i < count; i++) {
    const partSet = SET_ORDER[i % SET_ORDER.length];
    const meta = PART_SET_META[partSet];
    const models = SET_MODELS[partSet];
    const brandModel = models[Math.floor(i / 4) % models.length];
    const tpl = PART_TEMPLATES[i % PART_TEMPLATES.length];
    const seqNum = String(i + 1).padStart(4, '0');
    const partNumber = `${meta.codePrefix}-${seqNum}`;

    const rackBay = String((Math.floor(i / 4) % 30) + 1).padStart(2, '0');
    const shelf = (i % 5) + 1;
    const rackLocation = `Rack ${meta.rackPrefix}-${rackBay} (S${shelf})`;

    const priceVariance = ((i * 37) % 11) * 25;
    const price = tpl.basePrice + priceVariance;

    let stockQty: number;
    if (i < 40 && i % 2 === 1) {
      stockQty = Math.max(0, Math.floor(tpl.minStock / 3) - (i % 3));
    } else if (i % 35 === 0) {
      stockQty = Math.max(1, tpl.minStock - 2);
    } else {
      stockQty = tpl.minStock + 6 + ((i * 7) % 35);
    }

    const specVariant = i >= 160 ? ` #${Math.floor(i / 160) + 1}` : '';
    const nameModel = `${brandModel} - ${tpl.baseName}${specVariant}`;

    parts.push({
      id: `part-${seqNum}`,
      partSet,
      partNumber,
      nameModel,
      rackLocation,
      stockQty,
      price,
      minStockLevel: tpl.minStock,
      brand: meta.brandPrefix,
      category: meta.shortLabel,
      unit: 'Pc',
      updatedAt: '2026-10-18T08:00:00.000Z',
      isArchived: false,
    });
  }

  for (let j = 0; j < OTHERS_SEED_ITEMS.length; j++) {
    const item = OTHERS_SEED_ITEMS[j];
    const seqNum = String(j + 1).padStart(3, '0');
    parts.push({
      id: `part-oth-${seqNum}`,
      partSet: 'others',
      partNumber: 'N/A',
      nameModel: item.nameModel,
      rackLocation: item.rackLocation,
      stockQty: item.stockQty,
      price: item.price,
      minStockLevel: item.minStockLevel,
      brand: 'Others',
      category: 'Others',
      unit: 'Pc',
      updatedAt: '2026-10-18T08:00:00.000Z',
      isArchived: false,
    });
  }

  return parts;
}

/**
 * Returns default Owner credentials initialized from .env variables.
 */
export function getDefaultOwnerAccount(): OwnerAccount {
  const envUser =
    (typeof process !== 'undefined' && process.env?.OWNER_USER_ID) || '';
  const envPass =
    (typeof process !== 'undefined' && process.env?.OWNER_PASSWORD) || '';
  const rawEmail =
    (typeof process !== 'undefined' && process.env?.OWNER_EMAIL) || '';
  const envEmail = rawEmail.includes('@') ? rawEmail : '';

  return {
    username: envUser.trim() || 'owner',
    password: envPass.trim(),
    fullName: 'Taj Harvester Owner',
    email: envEmail.trim() || 'owner@example.invalid',
    updatedAt: '2026-10-18T08:00:00.000Z',
  };
}

/**
 * Generates initial shop state with 1,040 parts, Owner account from .env, Staff list, and sample records.
 */
export function generateInitialShopState(): ShopState {
  const parts = generateSeedParts(1040);
  const ownerAccount = getDefaultOwnerAccount();
  const staffAccounts: StaffAccount[] = [
    {
      id: 'staff-01',
      username: 'staff_ravi',
      password: 'staff123',
      fullName: 'Ravi Kumar (Counter Staff)',
      createdAt: '2026-10-18T08:00:00.000Z',
    },
  ];

  const dealers: Dealer[] = [
    {
      id: 'dealer-1',
      name: 'Kubota Spares Distributor',
      contactPerson: 'Sardar Harjinder Singh',
      phone: '9814022310',
      city: 'Ludhiana',
      brandsSupplied: ['Kubota'],
      gstNumber: '03AABCP4412R1Z8',
    },
  ];

  const bills: Bill[] = [
    {
      id: 'bill-1001',
      invoiceNumber: 'INV-2026-1001',
      customerName: 'Balwinder Singh Sandhu',
      customerPhone: '9815244190',
      customerVillage: 'Chak Fateh Singh Wala',
      items: [
        {
          partId: parts[2].id,
          partSet: parts[2].partSet,
          partNumber: parts[2].partNumber,
          nameModel: parts[2].nameModel,
          unitPrice: parts[2].price,
          quantity: 1,
          discount: 200,
          lineTotal: parts[2].price - 200,
        },
        {
          partId: parts[0].id,
          partSet: parts[0].partSet,
          partNumber: parts[0].partNumber,
          nameModel: parts[0].nameModel,
          unitPrice: parts[0].price,
          quantity: 10,
          discount: 0,
          lineTotal: parts[0].price * 10,
        },
      ],
      subtotal: parts[2].price + parts[0].price * 10,
      discountAmount: 200,
      netTotal: parts[2].price + parts[0].price * 10 - 200,
      paidAmount: 4500,
      dueAmount: parts[2].price + parts[0].price * 10 - 200 - 4500,
      paymentStatus: 'PARTIAL_DUE',
      paymentMode: 'CASH',
      createdBy: 'tajharvester000',
      createdAt: '2026-10-18T09:15:00.000Z',
    },
    {
      id: 'bill-1002',
      invoiceNumber: 'INV-2026-1002',
      customerName: 'Kisan Agro Harvester Contractors',
      customerPhone: '9417088231',
      customerVillage: 'Mandi Gobindgarh',
      items: [
        {
          partId: parts[3].id,
          partSet: parts[3].partSet,
          partNumber: parts[3].partNumber,
          nameModel: parts[3].nameModel,
          unitPrice: parts[3].price,
          quantity: 2,
          discount: 0,
          lineTotal: parts[3].price * 2,
        },
        {
          partId: parts[4].id,
          partSet: parts[4].partSet,
          partNumber: parts[4].partNumber,
          nameModel: parts[4].nameModel,
          unitPrice: parts[4].price,
          quantity: 2,
          discount: 0,
          lineTotal: parts[4].price * 2,
        },
      ],
      subtotal: parts[3].price * 2 + parts[4].price * 2,
      discountAmount: 0,
      netTotal: parts[3].price * 2 + parts[4].price * 2,
      paidAmount: parts[3].price * 2 + parts[4].price * 2,
      dueAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'UPI',
      createdBy: 'staff_ravi',
      createdAt: '2026-10-18T10:30:00.000Z',
    },
    {
      id: 'bill-1003',
      invoiceNumber: 'INV-2026-1003',
      customerName: 'Sukhdev Custom Hiring Center',
      customerPhone: '9872311904',
      customerVillage: 'Jagraon Road',
      items: [
        {
          partId: parts[5].id,
          partSet: parts[5].partSet,
          partNumber: parts[5].partNumber,
          nameModel: parts[5].nameModel,
          unitPrice: parts[5].price,
          quantity: 2,
          discount: 350,
          lineTotal: parts[5].price * 2 - 350,
        },
        {
          partId: parts[7].id,
          partSet: parts[7].partSet,
          partNumber: parts[7].partNumber,
          nameModel: parts[7].nameModel,
          unitPrice: parts[7].price,
          quantity: 2,
          discount: 0,
          lineTotal: parts[7].price * 2,
        },
      ],
      subtotal: parts[5].price * 2 + parts[7].price * 2,
      discountAmount: 350,
      netTotal: parts[5].price * 2 + parts[7].price * 2 - 350,
      paidAmount: 6000,
      dueAmount: parts[5].price * 2 + parts[7].price * 2 - 350 - 6000,
      paymentStatus: 'PARTIAL_DUE',
      paymentMode: 'UPI',
      createdBy: 'tajharvester000',
      createdAt: '2026-10-17T15:40:00.000Z',
    },
    {
      id: 'bill-1004',
      invoiceNumber: 'INV-2026-1004',
      customerName: 'Mahendra Farms & Combine Service',
      customerPhone: '9914567210',
      customerVillage: 'Samrala Chowk',
      items: [
        {
          partId: parts[17].id,
          partSet: parts[17].partSet,
          partNumber: parts[17].partNumber,
          nameModel: parts[17].nameModel,
          unitPrice: parts[17].price,
          quantity: 1,
          discount: 0,
          lineTotal: parts[17].price,
        },
      ],
      subtotal: parts[17].price,
      discountAmount: 0,
      netTotal: parts[17].price,
      paidAmount: parts[17].price,
      dueAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      createdBy: 'staff_ravi',
      createdAt: '2026-10-15T12:10:00.000Z',
    },
  ];

  const dues: PendingDue[] = [
    {
      id: 'due-1',
      customerName: 'Balwinder Singh Sandhu',
      customerPhone: '9815244190',
      customerVillage: 'Chak Fateh Singh Wala',
      totalBilled: bills[0].netTotal,
      totalPaid: bills[0].paidAmount,
      balanceDue: bills[0].dueAmount,
      billIds: [bills[0].id],
      invoiceNumbers: [bills[0].invoiceNumber],
      payments: [
        {
          id: 'pay-init-1',
          amount: bills[0].paidAmount,
          paymentMode: 'CASH',
          note: 'Initial down payment on invoice INV-2026-1001',
          recordedBy: 'tajharvester000',
          recordedAt: '2026-10-18T09:15:00.000Z',
          billId: bills[0].id,
        },
      ],
      lastUpdated: '2026-10-18T09:15:00.000Z',
      status: 'ACTIVE_DUE',
    },
    {
      id: 'due-2',
      customerName: 'Sukhdev Custom Hiring Center',
      customerPhone: '9872311904',
      customerVillage: 'Jagraon Road',
      totalBilled: bills[2].netTotal,
      totalPaid: bills[2].paidAmount,
      balanceDue: bills[2].dueAmount,
      billIds: [bills[2].id],
      invoiceNumbers: [bills[2].invoiceNumber],
      payments: [
        {
          id: 'pay-init-2',
          amount: bills[2].paidAmount,
          paymentMode: 'UPI',
          note: 'Advance UPI payment against combine overhaul parts',
          recordedBy: 'tajharvester000',
          recordedAt: '2026-10-17T15:40:00.000Z',
          billId: bills[2].id,
        },
      ],
      lastUpdated: '2026-10-17T15:40:00.000Z',
      status: 'ACTIVE_DUE',
    },
  ];

  const dealerOrders: DealerOrder[] = [
    {
      id: 'po-2001',
      orderNumber: 'ORDER-2026-01',
      dealerId: 'custom-dealer',
      dealerName: 'Ludhiana Harvester Spares',
      dealerPhone: '',
      dealerCity: '',
      items: [
        {
          partId: parts[1].id,
          partNumber: parts[1].partNumber,
          nameModel: parts[1].nameModel,
          rackLocation: parts[1].rackLocation,
          currentStock: parts[1].stockQty,
          minStockLevel: parts[1].minStockLevel,
          orderQty: 30,
          estimatedUnitCost: Math.round(parts[1].price * 0.78),
        },
        {
          partId: parts[3].id,
          partNumber: parts[3].partNumber,
          nameModel: parts[3].nameModel,
          rackLocation: parts[3].rackLocation,
          currentStock: parts[3].stockQty,
          minStockLevel: parts[3].minStockLevel,
          orderQty: 10,
          estimatedUnitCost: Math.round(parts[3].price * 0.78),
        },
      ],
      totalItemsCount: 2,
      totalUnitsQty: 40,
      estimatedOrderValue: 0,
      notes: 'Urgent restock parts list',
      createdBy: 'tajharvester000',
      createdAt: '2026-10-17T18:00:00.000Z',
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'audit-1',
      timestamp: '2026-10-18T10:30:00.000Z',
      action: 'BILL_CREATED',
      actor: 'staff_ravi',
      summary: `Created ${bills[1].invoiceNumber} for ${bills[1].customerName} (Final Price ₹${bills[1].netTotal.toLocaleString('en-IN')}, Fully Paid)`,
      referenceId: bills[1].id,
    },
    {
      id: 'audit-2',
      timestamp: '2026-10-18T09:15:00.000Z',
      action: 'BILL_CREATED',
      actor: 'tajharvester000',
      summary: `Created ${bills[0].invoiceNumber} for ${bills[0].customerName} (Final Price ₹${bills[0].netTotal.toLocaleString('en-IN')}, Paid ₹${bills[0].paidAmount.toLocaleString('en-IN')}, Due ₹${bills[0].dueAmount.toLocaleString('en-IN')})`,
      referenceId: bills[0].id,
    },
    {
      id: 'audit-3',
      timestamp: '2026-10-18T06:00:00.000Z',
      action: 'BACKUP_EXPORTED',
      actor: 'SYSTEM_CRON',
      summary: 'Daily automatic snapshot completed across all 4 sets (Kubota, Yanmar, GM, Local).',
    },
  ];

  const totalStockValue = parts.reduce((sum, p) => sum + p.price * p.stockQty, 0);

  const backups: BackupSnapshot[] = [
    {
      id: 'bkp-auto-today',
      createdAt: '2026-10-18T06:00:00.000Z',
      type: 'AUTO_DAILY',
      partsCount: parts.length,
      billsCount: bills.length,
      activeDuesCount: dues.length,
      totalStockValue,
      triggeredBy: 'Automatic Daily Scheduler (06:00 AM)',
    },
    {
      id: 'bkp-auto-yesterday',
      createdAt: '2026-10-17T06:00:00.000Z',
      type: 'AUTO_DAILY',
      partsCount: parts.length,
      billsCount: 2,
      activeDuesCount: 1,
      totalStockValue: totalStockValue + 18400,
      triggeredBy: 'Automatic Daily Scheduler (06:00 AM)',
    },
  ];

  return {
    schemaVersion: 6,
    ownerAccount,
    staffAccounts,
    parts,
    bills,
    dues,
    dealers,
    dealerOrders,
    auditLogs,
    backups,
  };
}

/**
 * Normalizes a part number for duplicate detection (ignoring empty, N/A, '--', and 'others' set).
 */
export function normalizePartNumberForDupCheck(partNumber?: string, partSet?: PartSet): string {
  if (!partNumber || partSet === 'others') return '';
  const trimmed = partNumber.trim().toUpperCase();
  if (
    !trimmed ||
    trimmed === 'N/A' ||
    trimmed === '—' ||
    trimmed === '--' ||
    trimmed === '-'
  ) {
    return '';
  }
  return trimmed;
}

/**
 * Returns the set of normalized part numbers that appear more than once among active parts
 * (either across all sets or within a selected setFilter).
 */
export function getDuplicatePartNumberSet(
  parts: SparePart[],
  setFilter: 'ALL' | PartSet = 'ALL'
): Set<string> {
  const counts = new Map<string, number>();
  for (const p of parts) {
    if (p.isArchived) continue;
    const effectiveSet = p.partSet || detectPartSet(p.partNumber, p.nameModel);
    if (setFilter !== 'ALL' && effectiveSet !== setFilter) continue;
    const norm = normalizePartNumberForDupCheck(p.partNumber, effectiveSet);
    if (!norm) continue;
    counts.set(norm, (counts.get(norm) || 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [code, count] of counts.entries()) {
    if (count > 1) {
      duplicates.add(code);
    }
  }
  return duplicates;
}

/**
 * Pure search and filter function for the 1,000+ spare parts inventory across the 5 sets.
 */
export function filterAndSearchParts(
  parts: SparePart[],
  searchQuery: string,
  stockFilter:
    | 'ALL'
    | 'LOW_STOCK'
    | 'OUT_OF_STOCK'
    | 'HEALTHY'
    | 'DUPLICATE_PART_NO' = 'ALL',
  setFilter: 'ALL' | PartSet = 'ALL'
): SparePart[] {
  const q = searchQuery.trim().toLowerCase();
  const duplicateCodes =
    stockFilter === 'DUPLICATE_PART_NO'
      ? getDuplicatePartNumberSet(parts, setFilter)
      : null;

  const filtered = parts.filter((part) => {
    if (part.isArchived) return false;

    const effectiveSet = part.partSet || detectPartSet(part.partNumber, part.nameModel);
    if (setFilter !== 'ALL' && effectiveSet !== setFilter) {
      return false;
    }

    if (stockFilter === 'DUPLICATE_PART_NO') {
      const normCode = normalizePartNumberForDupCheck(part.partNumber, effectiveSet);
      if (!normCode || !duplicateCodes?.has(normCode)) {
        return false;
      }
    } else if (stockFilter === 'LOW_STOCK' && part.stockQty > part.minStockLevel) {
      return false;
    } else if (stockFilter === 'OUT_OF_STOCK' && part.stockQty > 0) {
      return false;
    } else if (stockFilter === 'HEALTHY' && part.stockQty <= part.minStockLevel) {
      return false;
    }

    if (!q) return true;

    return (
      part.partNumber.toLowerCase().includes(q) ||
      part.nameModel.toLowerCase().includes(q) ||
      part.rackLocation.toLowerCase().includes(q)
    );
  });

  if (stockFilter === 'DUPLICATE_PART_NO') {
    return [...filtered].sort((a, b) => {
      const cmp = a.partNumber.toUpperCase().localeCompare(b.partNumber.toUpperCase());
      if (cmp !== 0) return cmp;
      return a.nameModel.localeCompare(b.nameModel);
    });
  }

  return filtered;
}

/**
 * Slices a filtered part list for infinite scrolling.
 */
export function paginateParts(
  filteredParts: SparePart[],
  page: number,
  pageSize = 40
): { items: SparePart[]; total: number; hasMore: boolean; loadedCount: number } {
  const safePage = Math.max(1, page);
  const endIndex = safePage * pageSize;
  const items = filteredParts.slice(0, endIndex);
  return {
    items,
    total: filteredParts.length,
    loadedCount: items.length,
    hasMore: endIndex < filteredParts.length,
  };
}

/**
 * Calculates subtotal, total discount (from per-part discounts + any extra discount),
 * net total (Final Price), paid amount, due amount, and payment status.
 */
export function calculateBillTotals(
  items: BillItem[],
  extraDiscountAmount = 0,
  paidAmount = 0
): {
  subtotal: number;
  discountAmount: number;
  netTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentStatus: PaymentStatus;
} {
  const subtotal = items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const itemDiscountsSum = items.reduce((acc, item) => {
    const gross = item.unitPrice * item.quantity;
    const resolvedDiscount =
      item.discountPercent !== undefined && item.discountPercent > 0
        ? Math.round((gross * Math.min(100, Math.max(0, item.discountPercent))) / 100)
        : Math.round(item.discount || 0);
    return acc + Math.max(0, Math.min(gross, resolvedDiscount));
  }, 0);
  const totalDiscountRaw = itemDiscountsSum + Math.max(0, Math.round(extraDiscountAmount || 0));
  const clampedDiscount = Math.max(0, Math.min(subtotal, totalDiscountRaw));
  const netTotal = Math.max(0, subtotal - clampedDiscount);
  const clampedPaid = Math.max(0, Math.min(netTotal, Math.round(paidAmount || 0)));
  const dueAmount = Math.max(0, netTotal - clampedPaid);

  let paymentStatus: PaymentStatus = 'PAID';
  if (dueAmount > 0 && clampedPaid > 0) {
    paymentStatus = 'PARTIAL_DUE';
  } else if (dueAmount > 0 && clampedPaid === 0) {
    paymentStatus = 'UNPAID';
  }

  return {
    subtotal,
    discountAmount: clampedDiscount,
    netTotal,
    paidAmount: clampedPaid,
    dueAmount,
    paymentStatus,
  };
}

export interface CreateBillPayload {
  customerName: string;
  customerPhone: string;
  customerVillage: string; // Customer Address
  items: {
    partId: string;
    quantity: number;
    discountPercent?: number;
    discount?: number;
    unitPrice?: number;
  }[];
  discountAmount?: number;
  paidAmount: number;
  paymentMode: PaymentMode;
  createdBy: string;
  ignoreStockCount?: boolean;
}

/**
 * Executes an atomic bill creation transaction:
 * 1. Validates items, stock availability (unless ignoreStockCount is true), per-part percentage discounts (discountPercent), and optional updated single item price
 * 2. Deducts stock quantities from parts (and updates part.price if edited at checkout)
 * 3. Creates the Bill record (marking partSet so original parts display "(org)")
 * 4. Creates or updates a PendingDue record if dueAmount > 0
 * 5. Records an immutable AuditLog entry
 */
export function executeAtomicBillTransaction(
  state: ShopState,
  payload: CreateBillPayload,
  nowIso = new Date().toISOString()
): { nextState: ShopState; createdBill: Bill } {
  if (!payload.items || payload.items.length === 0) {
    throw new Error('Cannot save an empty bill. Add at least one spare part.');
  }

  const customerName = payload.customerName.trim();
  if (!customerName) {
    throw new Error('Customer name is required to generate a bill.');
  }

  const partsClone = state.parts.map((p) => ({ ...p }));
  const billItems: BillItem[] = [];

  for (const reqItem of payload.items) {
    if (reqItem.quantity <= 0) {
      throw new Error('Item quantity must be at least 1.');
    }
    const partIndex = partsClone.findIndex((p) => p.id === reqItem.partId && !p.isArchived);
    if (partIndex === -1) {
      throw new Error(`Part not found in inventory: ${reqItem.partId}`);
    }
    const part = partsClone[partIndex];
    if (!payload.ignoreStockCount && part.stockQty < reqItem.quantity) {
      throw new Error(
        `Insufficient stock for ${part.partNumber} (${part.nameModel}). Available: ${part.stockQty}, Requested: ${reqItem.quantity}`
      );
    }

    const effectiveUnitPrice =
      reqItem.unitPrice !== undefined && Number(reqItem.unitPrice) > 0
        ? Math.max(1, Math.round(Number(reqItem.unitPrice)))
        : part.price;

    part.stockQty = Math.max(0, part.stockQty - reqItem.quantity);
    part.price = effectiveUnitPrice;
    part.updatedAt = nowIso;

    const grossLine = effectiveUnitPrice * reqItem.quantity;
    let clampedPercent = 0;
    let itemDiscount = 0;

    if (reqItem.discountPercent !== undefined && Number(reqItem.discountPercent) > 0) {
      clampedPercent = Math.max(0, Math.min(100, Number(reqItem.discountPercent)));
      itemDiscount = Math.max(0, Math.min(grossLine, Math.round((grossLine * clampedPercent) / 100)));
    } else if (reqItem.discount !== undefined && Number(reqItem.discount) > 0) {
      itemDiscount = Math.max(0, Math.min(grossLine, Math.round(Number(reqItem.discount))));
      clampedPercent = grossLine > 0 ? Math.round((itemDiscount / grossLine) * 100 * 10) / 10 : 0;
    }

    const resolvedSet = part.partSet || detectPartSet(part.partNumber, part.nameModel);

    billItems.push({
      partId: part.id,
      partSet: resolvedSet,
      partNumber: part.partNumber,
      nameModel: part.nameModel,
      unitPrice: effectiveUnitPrice,
      quantity: reqItem.quantity,
      discountPercent: clampedPercent,
      discount: itemDiscount,
      lineTotal: Math.max(0, grossLine - itemDiscount),
    });
  }

  const sumItemDiscounts = billItems.reduce((s, i) => s + (i.discount || 0), 0);
  const extraDiscount =
    sumItemDiscounts > 0 ? 0 : Math.max(0, Math.round(payload.discountAmount || 0));

  const totals = calculateBillTotals(billItems, extraDiscount, payload.paidAmount);

  if (totals.dueAmount > 0 && !payload.customerPhone.trim()) {
    throw new Error('Customer phone number is mandatory when there is a pending due balance.');
  }

  const safePaymentMode: PaymentMode = payload.paymentMode === 'UPI' ? 'UPI' : 'CASH';

  const usedInvoiceSequences = new Set(
    state.bills
      .map((bill) => bill.invoiceNumber.match(/^INV-85-(\d+)$/i))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => Number(match[1]))
  );
  let nextInvoiceSequence = BILL_INVOICE_START;
  while (usedInvoiceSequences.has(nextInvoiceSequence)) {
    nextInvoiceSequence += 1;
  }
  const invoiceNumber = `${BILL_INVOICE_PREFIX}-${nextInvoiceSequence}`;
  const createdBill: Bill = {
    id: `bill-${nextInvoiceSequence}-${Date.now()}`,
    invoiceNumber,
    customerName,
    customerPhone: payload.customerPhone.trim() || 'N/A',
    customerVillage: payload.customerVillage.trim() || 'Local',
    items: billItems,
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    netTotal: totals.netTotal,
    paidAmount: totals.paidAmount,
    dueAmount: totals.dueAmount,
    paymentStatus: totals.paymentStatus,
    paymentMode: safePaymentMode,
    createdBy: payload.createdBy,
    createdAt: nowIso,
  };

  const duesClone = state.dues.map((d) => ({
    ...d,
    billIds: [...d.billIds],
    invoiceNumbers: [...d.invoiceNumbers],
    payments: [...d.payments],
  }));

  if (totals.dueAmount > 0) {
    const normalizedPhone = payload.customerPhone.trim();
    const existingDue = duesClone.find(
      (d) =>
        (normalizedPhone && d.customerPhone === normalizedPhone) ||
        d.customerName.toLowerCase() === customerName.toLowerCase()
    );

    if (existingDue) {
      existingDue.totalBilled += totals.netTotal;
      existingDue.totalPaid += totals.paidAmount;
      existingDue.balanceDue += totals.dueAmount;
      existingDue.billIds.unshift(createdBill.id);
      existingDue.invoiceNumbers.unshift(createdBill.invoiceNumber);
      existingDue.lastUpdated = nowIso;
      existingDue.status = 'ACTIVE_DUE';
      if (totals.paidAmount > 0) {
        existingDue.payments.unshift({
          id: `pay-${Date.now()}`,
          amount: totals.paidAmount,
          paymentMode: safePaymentMode,
          note: `Partial payment at billing (${createdBill.invoiceNumber})`,
          recordedBy: payload.createdBy,
          recordedAt: nowIso,
          billId: createdBill.id,
        });
      }
    } else {
      duesClone.unshift({
        id: `due-${Date.now()}`,
        customerName,
        customerPhone: normalizedPhone,
        customerVillage: createdBill.customerVillage,
        totalBilled: totals.netTotal,
        totalPaid: totals.paidAmount,
        balanceDue: totals.dueAmount,
        billIds: [createdBill.id],
        invoiceNumbers: [createdBill.invoiceNumber],
        payments:
          totals.paidAmount > 0
            ? [
                {
                  id: `pay-${Date.now()}`,
                  amount: totals.paidAmount,
                  paymentMode: safePaymentMode,
                  note: `Initial payment at billing (${createdBill.invoiceNumber})`,
                  recordedBy: payload.createdBy,
                  recordedAt: nowIso,
                  billId: createdBill.id,
                },
              ]
            : [],
        lastUpdated: nowIso,
        status: 'ACTIVE_DUE',
      });
    }
  }

  const auditEntry: AuditLogEntry = {
    id: `audit-${Date.now()}`,
    timestamp: nowIso,
    action: 'BILL_CREATED',
    actor: payload.createdBy,
    summary: `Created ${createdBill.invoiceNumber} for ${createdBill.customerName} (Final Price ₹${createdBill.netTotal.toLocaleString('en-IN')}, Paid ₹${createdBill.paidAmount.toLocaleString('en-IN')}, Due ₹${createdBill.dueAmount.toLocaleString('en-IN')})`,
    referenceId: createdBill.id,
  };

  return {
    nextState: {
      ...state,
      parts: partsClone,
      bills: [createdBill, ...state.bills],
      dues: duesClone,
      auditLogs: [auditEntry, ...state.auditLogs],
    },
    createdBill,
  };
}

/**
 * Records a payment (Cash or UPI) against a customer's Pending Due and updates associated bills.
 */
export function recordDuePayment(
  state: ShopState,
  dueId: string,
  amount: number,
  paymentMode: PaymentMode,
  note: string,
  recordedBy: string,
  nowIso = new Date().toISOString()
): { nextState: ShopState; updatedDue: PendingDue } {
  const cleanAmount = Math.round(amount);
  if (!cleanAmount || cleanAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const duesClone = state.dues.map((d) => ({
    ...d,
    billIds: [...d.billIds],
    invoiceNumbers: [...d.invoiceNumbers],
    payments: [...d.payments],
  }));

  const targetDue = duesClone.find((d) => d.id === dueId);
  if (!targetDue) {
    throw new Error('Pending due record not found.');
  }

  if (cleanAmount > targetDue.balanceDue) {
    throw new Error(
      `Payment amount (₹${cleanAmount}) cannot exceed remaining balance due (₹${targetDue.balanceDue}).`
    );
  }

  const safeMode: PaymentMode = paymentMode === 'UPI' ? 'UPI' : 'CASH';

  targetDue.totalPaid += cleanAmount;
  targetDue.balanceDue -= cleanAmount;
  targetDue.status = targetDue.balanceDue === 0 ? 'SETTLED' : 'ACTIVE_DUE';
  targetDue.lastUpdated = nowIso;
  targetDue.payments.unshift({
    id: `pay-${Date.now()}`,
    amount: cleanAmount,
    paymentMode: safeMode,
    note: note.trim() || 'Payment received against pending balance',
    recordedBy,
    recordedAt: nowIso,
  });

  let remainingToAllocate = cleanAmount;
  const billsClone = state.bills.map((b) => ({ ...b }));
  const customerBills = billsClone
    .filter((b) => targetDue.billIds.includes(b.id) && b.dueAmount > 0)
    .reverse();

  for (const bill of customerBills) {
    if (remainingToAllocate <= 0) break;
    const allocation = Math.min(bill.dueAmount, remainingToAllocate);
    bill.paidAmount += allocation;
    bill.dueAmount -= allocation;
    bill.paymentStatus = bill.dueAmount === 0 ? 'PAID' : 'PARTIAL_DUE';
    remainingToAllocate -= allocation;
  }

  const auditEntry: AuditLogEntry = {
    id: `audit-${Date.now()}`,
    timestamp: nowIso,
    action: 'DUE_PAYMENT_RECEIVED',
    actor: recordedBy,
    summary: `Received ₹${cleanAmount.toLocaleString('en-IN')} (${safeMode}) from ${targetDue.customerName}. Remaining due: ₹${targetDue.balanceDue.toLocaleString('en-IN')}`,
    referenceId: targetDue.id,
  };

  return {
    nextState: {
      ...state,
      bills: billsClone,
      dues: duesClone,
      auditLogs: [auditEntry, ...state.auditLogs],
    },
    updatedDue: targetDue,
  };
}

/**
 * Permanently deletes a bill, restores its stock, removes its due references,
 * and leaves its invoice sequence available for reuse.
 */
export function deleteBillTransaction(
  state: ShopState,
  billId: string,
  deletedBy: string,
  nowIso = new Date().toISOString()
): ShopState {
  const targetBill = state.bills.find((b) => b.id === billId);
  if (!targetBill) {
    throw new Error('Bill not found.');
  }

  const partsClone = state.parts.map((p) => ({ ...p }));
  for (const item of targetBill.items) {
    const part = partsClone.find((p) => p.id === item.partId);
    if (part) {
      part.stockQty += item.quantity;
      part.updatedAt = nowIso;
    }
  }

  const billsClone = state.bills.filter((b) => b.id !== billId);
  const duesClone = state.dues
    .map((d) => {
      if (!d.billIds.includes(billId)) return d;
      const billIds = d.billIds.filter((id) => id !== billId);
      const invoiceNumbers = d.invoiceNumbers.filter(
        (invoiceNumber) => invoiceNumber !== targetBill.invoiceNumber
      );
      const payments = d.payments.filter((payment) => payment.billId !== billId);
      const remainingBills = billsClone.filter((bill) => billIds.includes(bill.id));
      const totalBilled = remainingBills.reduce((sum, bill) => sum + bill.netTotal, 0);
      const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
      const balanceDue = Math.max(0, totalBilled - totalPaid);
      return {
        ...d,
        billIds,
        invoiceNumbers,
        payments,
        totalBilled,
        totalPaid,
        balanceDue,
        status: balanceDue === 0 ? ('SETTLED' as const) : ('ACTIVE_DUE' as const),
        lastUpdated: nowIso,
      };
    })
    .filter((d) => d.billIds.length > 0);

  const auditEntry: AuditLogEntry = {
    id: `audit-${Date.now()}`,
    timestamp: nowIso,
    action: 'BILL_DELETED',
    actor: deletedBy,
    summary: `Deleted ${targetBill.invoiceNumber}. Restored stock for ${targetBill.items.length} part(s).`,
    referenceId: billId,
  };

  return {
    ...state,
    parts: partsClone,
    bills: billsClone,
    dues: duesClone,
    auditLogs: [auditEntry, ...state.auditLogs],
  };
}

/**
 * Exports active spare parts (filtered optionally by PartSet: kubota, yanmar, gm, local)
 * to an Excel-compatible CSV string with the exact 5 fields requested:
 * Part Number, Part Name, Rack No, Count, Selling Price
 */
export function generateCsvBackup(parts: SparePart[], setFilter: 'ALL' | PartSet = 'ALL'): string {
  const headers = ['Part Number', 'Part Name', 'Rack No', 'Count', 'Selling Price'];

  const escapeCsvCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = parts
    .filter((p) => {
      if (p.isArchived) return false;
      if (setFilter === 'ALL') return true;
      const effectiveSet = p.partSet || detectPartSet(p.partNumber, p.nameModel);
      return effectiveSet === setFilter;
    })
    .map((p) =>
      [p.partNumber, p.nameModel, p.rackLocation, p.stockQty, p.price]
        .map(escapeCsvCell)
        .join(',')
    );

  return [headers.join(','), ...rows].join('\n');
}

export interface ExtractedShopPartRow {
  partNumber: string;
  nameModel: string;
  rackLocation: string;
  stockQty: number;
  price: number;
  sheetSetHint?: PartSet;
}

export interface ExtractedShopSheetResult {
  isPartSheet: boolean;
  rows: ExtractedShopPartRow[];
  detectedSet?: PartSet;
  bannerTitle?: string;
  isShopFormat: boolean;
}

function normalizeHeaderToken(val: unknown): string {
  return String(val ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanExcelCellText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseExcelNumericRate(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) && val >= 0 ? Math.round(val * 100) / 100 : 0;
  }
  const cleaned = String(val ?? '')
    .replace(/[₹$,\s]/g, '')
    .trim();
  if (!cleaned || cleaned.startsWith('#') || cleaned === '-' || cleaned === '--') {
    return 0;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : 0;
}

function detectBannerPartSet(bannerText: string, sheetName = ''): PartSet | undefined {
  const combined = `${bannerText} ${sheetName}`.toUpperCase();
  const hasYanmar = combined.includes('YANMAR');
  const hasKubota = combined.includes('KUBOTA');
  if (combined.includes('GAM') || /\bGM\b/.test(combined)) {
    return 'gm';
  }
  if (hasYanmar && !hasKubota) {
    return 'yanmar';
  }
  if (hasKubota && !hasYanmar) {
    return 'kubota';
  }
  if (
    /\b(BEARING|OIL|WRANCH|WRENCH|GREASE|LOCAL BELT|BELT|LOCAL)\b/.test(
      sheetName.toUpperCase()
    )
  ) {
    return 'local';
  }
  return undefined;
}

/**
 * Extracts normalized spare part rows from a 2D array of spreadsheet cells (AoA).
 * Supports both:
 * 1. The user's shop Excel sheets (TAJ HARVESTER, YANMAR ORGINAL, KUBOTA ORIGINAL, GAM)
 *    with banner rows, merged/empty intermediate columns, PART NO / DESCRIPTION / SELLING RATE / RATE / POSITION / POS,
 *    setting Count = 0, "--" when DESCRIPTION is missing, and ignoring SL NO / OPENING QTY / QTY / MATERIALS IN/OUT/BALANCE.
 * 2. Standard 5-column backup sheets (Part Number, Part Name, Rack No, Count, Selling Price).
 */
export function extractShopPartsFromAoA(
  aoa: unknown[][],
  options?: { sheetName?: string; forceZeroCount?: boolean }
): ExtractedShopSheetResult {
  if (!aoa || aoa.length === 0) {
    return { isPartSheet: false, rows: [], isShopFormat: false };
  }

  const maxScan = Math.min(aoa.length, 30);
  let headerRowIdx = -1;
  let partNoIdx = -1;
  let descIdx = -1;
  let posIdx = -1;
  let rateIdx = -1;
  let backupCountIdx = -1;
  let setHintIdx = -1;
  let hasShopExtraColumns = false;

  for (let r = 0; r < maxScan; r++) {
    const row = aoa[r] || [];
    let pIdx = -1;
    let dIdx = -1;
    let posCol = -1;
    let rateCol = -1;
    let cntCol = -1;
    let setCol = -1;
    let slCol = -1;
    let shopExtra = false;
    let isLedgerRow = false;

    for (let c = 0; c < row.length; c++) {
      const h = normalizeHeaderToken(row[c]);
      if (!h) continue;

      if (
        h === 'bill no' ||
        h === 'receipt voucher no' ||
        h === 'due amount' ||
        h === 'paid amount' ||
        h === 'invoice number'
      ) {
        isLedgerRow = true;
      }

      if (
        pIdx === -1 &&
        (h === 'part no' ||
          h === 'part number' ||
          h === 'partno' ||
          h === 'part code' ||
          h === 'item code' ||
          h === 'code no' ||
          h === 'p/n' ||
          h.startsWith('part no ') ||
          h.startsWith('part number'))
      ) {
        pIdx = c;
      } else if (
        dIdx === -1 &&
        (h === 'description' ||
          h === 'discription' ||
          h === 'part name' ||
          h === 'item name' ||
          h === 'particulars' ||
          h === 'item description' ||
          h === 'name' ||
          h.startsWith('part name') ||
          h.startsWith('description') ||
          h.startsWith('discription'))
      ) {
        dIdx = c;
      } else if (
        posCol === -1 &&
        (h === 'position' ||
          h === 'pos' ||
          h === 'rack no' ||
          h === 'rack' ||
          h === 'rack location' ||
          h === 'location' ||
          h === 'bin' ||
          h === 'bin no' ||
          h.startsWith('rack ') ||
          h.startsWith('position'))
      ) {
        posCol = c;
      } else if (
        rateCol === -1 &&
        (h === 'selling rate' ||
          h === 'single rate' ||
          h === 'rate' ||
          h === 'selling price' ||
          h === 'price' ||
          h === 'mrp' ||
          h === 'unit price' ||
          h === 'sale rate' ||
          h.startsWith('selling rate') ||
          h.startsWith('single rate') ||
          h.startsWith('selling price'))
      ) {
        rateCol = c;
      } else if (cntCol === -1 && (h === 'count' || h === 'stock count')) {
        cntCol = c;
      } else if (setCol === -1 && (h === 'set' || h === 'part set' || h === 'db set')) {
        setCol = c;
      } else if (
        h === 'sl no' ||
        h === 'sr no' ||
        h === 's no' ||
        h === 'serial no' ||
        h === 'opening qty' ||
        h === 'qty' ||
        h === 'quantity' ||
        h === 'materials in' ||
        h === 'materials out' ||
        h === 'materials balance' ||
        h === 'material in' ||
        h === 'material out' ||
        h === 'material balance' ||
        h === 'balance'
      ) {
        if (h === 'sl no' || h === 'sr no' || h === 's no' || h === 'serial no') {
          slCol = c;
        }
        shopExtra = true;
      }
    }

    if (isLedgerRow) {
      return { isPartSheet: false, rows: [], isShopFormat: false };
    }

    const matchedCoreCols =
      (pIdx >= 0 ? 1 : 0) +
      (dIdx >= 0 ? 1 : 0) +
      (posCol >= 0 ? 1 : 0) +
      (rateCol >= 0 ? 1 : 0) +
      (slCol >= 0 ? 1 : 0);

    if ((pIdx >= 0 || dIdx >= 0) && matchedCoreCols >= 2) {
      headerRowIdx = r;
      partNoIdx = pIdx;
      descIdx = dIdx;
      posIdx = posCol;
      rateIdx = rateCol;
      backupCountIdx = cntCol;
      setHintIdx = setCol;
      hasShopExtraColumns = shopExtra || cntCol === -1 || r > 0;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return { isPartSheet: false, rows: [], isShopFormat: false };
  }

  // Collect banner text from rows above the header row
  const bannerLines: string[] = [];
  for (let r = 0; r < headerRowIdx; r++) {
    const rowText = (aoa[r] || [])
      .map(cleanExcelCellText)
      .filter(Boolean)
      .join(' ');
    if (rowText) bannerLines.push(rowText);
  }
  const bannerTitle = bannerLines.join(' · ').trim() || undefined;
  const detectedSet = detectBannerPartSet(bannerTitle || '', options?.sheetName || '');

  const rows: ExtractedShopPartRow[] = [];
  const shouldZeroCount = Boolean(options?.forceZeroCount || hasShopExtraColumns || backupCountIdx === -1);

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const rawPartNo = partNoIdx >= 0 ? cleanExcelCellText(row[partNoIdx]) : '';
    const rawDesc = descIdx >= 0 ? cleanExcelCellText(row[descIdx]) : '';
    const rawPos = posIdx >= 0 ? cleanExcelCellText(row[posIdx]) : '';
    const rawRateText = rateIdx >= 0 ? cleanExcelCellText(row[rateIdx]) : '';
    const rawRate = rateIdx >= 0 ? parseExcelNumericRate(row[rateIdx]) : 0;
    const rawCount =
      !shouldZeroCount && backupCountIdx >= 0
        ? Math.max(0, Math.round(parseExcelNumericRate(row[backupCountIdx])))
        : 0;
    const rowSetHintRaw =
      setHintIdx >= 0 ? cleanExcelCellText(row[setHintIdx]).toLowerCase() : '';
    const rowSetHint = ALL_PART_SETS.includes(rowSetHintRaw as PartSet)
      ? (rowSetHintRaw as PartSet)
      : detectedSet;

    if (!rawPartNo && !rawDesc && !rawPos && !rawRateText) continue;

    const normPart = normalizeHeaderToken(rawPartNo);
    const normDesc = normalizeHeaderToken(rawDesc);
    if (
      normPart === 'part no' ||
      normPart === 'part number' ||
      normDesc === 'description' ||
      normDesc === 'discription' ||
      normPart === 'total' ||
      normDesc === 'total'
    ) {
      continue;
    }

    const finalPartNo = rawPartNo ? rawPartNo.toUpperCase() : '--';
    // Use "--" when DESCRIPTION (Part Name) is not given in the Excel sheet
    const finalDesc = rawDesc || '--';
    const finalPos = rawPos || '--';

    rows.push({
      partNumber: finalPartNo,
      nameModel: finalDesc,
      rackLocation: finalPos,
      stockQty: rawCount,
      price: rawRate,
      sheetSetHint: rowSetHint,
    });
  }

  return {
    isPartSheet: rows.length > 0,
    rows,
    detectedSet,
    bannerTitle,
    isShopFormat: hasShopExtraColumns,
  };
}

function parseDelimitedTextToAoA(csvText: string): string[][] {
  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === ',' || ch === '\t') && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (ch === '\n' && !inQuotes) {
      currentRow.push(currentCell.trim());
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }
  currentRow.push(currentCell.trim());
  if (currentRow.some((c) => c !== '')) {
    rows.push(currentRow);
  }
  return rows;
}

/**
 * Parses CSV / Excel text with either:
 * - The shop's Excel format (PART NO, DESCRIPTION, SELLING RATE / SINGLE RATE / RATE, POSITION / POS, Count = 0, "--" when DESCRIPTION missing)
 * - Or the 5 core fields (Part Number, Part Name, Rack No, Count, Selling Price)
 * and adds/replaces or merges all items directly into the selected dataset.
 */
export function importPartsFromCsv(
  state: ShopState,
  csvText: string,
  actor: string,
  nowIso = new Date().toISOString(),
  targetSet?: PartSet,
  options?: { forceZeroCount?: boolean; replaceTargetSet?: boolean }
): { nextState: ShopState; addedCount: number; updatedCount: number } {
  const aoa = parseDelimitedTextToAoA(csvText);
  if (aoa.length < 2) {
    throw new Error('CSV/Excel file must contain a header row and at least one data row.');
  }

  const extracted = extractShopPartsFromAoA(aoa, {
    forceZeroCount: options?.forceZeroCount,
  });

  if (!extracted.isPartSheet || extracted.rows.length === 0) {
    throw new Error(
      'No valid part rows found. Compatible headers: PART NO / Part Number, DESCRIPTION / Part Name, POSITION / POS / Rack No, SELLING RATE / RATE / Selling Price.'
    );
  }

  let partsClone = state.parts.map((p) => ({ ...p }));
  const isReplaceMode = Boolean(options?.replaceTargetSet);

  if (isReplaceMode) {
    if (targetSet) {
      partsClone = partsClone.filter((p) => {
        const s = p.partSet || detectPartSet(p.partNumber, p.nameModel, undefined, p.rackLocation);
        return s !== targetSet;
      });
    } else {
      partsClone = partsClone.filter((p) => !p.id.startsWith('part-seed-'));
    }
  }

  let addedCount = 0;
  let updatedCount = 0;
  const newlyAddedParts: SparePart[] = [];
  const baseTs = Date.now();

  for (let i = 0; i < extracted.rows.length; i++) {
    const row = extracted.rows[i];
    const rawPartNumber = (row.partNumber || '').trim().toUpperCase();
    const nameModel = (row.nameModel || '--').trim() || '--';
    const stockQty = options?.forceZeroCount ? 0 : Math.max(0, Math.round(Number(row.stockQty) || 0));
    const price = Math.max(0, Math.round(Number(row.price || 0) * 100) / 100);

    // If the user selected a target dataset, place 100% of rows directly into that dataset without re-analyzing
    const assignedSet: PartSet =
      targetSet && ALL_PART_SETS.includes(targetSet)
        ? targetSet
        : detectPartSet(
            rawPartNumber,
            nameModel === '--' ? '' : nameModel,
            row.sheetSetHint || extracted.detectedSet,
            row.rackLocation
          );

    const isNoCode =
      assignedSet === 'others' ||
      !rawPartNumber ||
      rawPartNumber === 'N/A' ||
      rawPartNumber === '—' ||
      rawPartNumber === '-' ||
      rawPartNumber === '--';

    const partNumber =
      assignedSet === 'others'
        ? 'N/A'
        : isNoCode
        ? '--'
        : rawPartNumber;

    const rackLocation =
      row.rackLocation?.trim() || (assignedSet === 'others' ? 'Bin / Counter' : '--');
    const meta = PART_SET_META[assignedSet];

    // In Replace mode, never merge or skip rows — add every single Excel row in exact 1-to-1 order.
    // In Merge mode, only match existing parts inside the SAME dataset.
    let existingIdxInClone = -1;
    if (!isReplaceMode) {
      if (isNoCode) {
        if (nameModel !== '--') {
          existingIdxInClone = partsClone.findIndex(
            (p) =>
              p.partSet === assignedSet &&
              (p.partNumber === 'N/A' || p.partNumber === '--') &&
              p.nameModel.toLowerCase() === nameModel.toLowerCase()
          );
        }
      } else {
        existingIdxInClone = partsClone.findIndex(
          (p) =>
            p.partSet === assignedSet &&
            p.partNumber.toUpperCase() === partNumber &&
            (p.nameModel.toLowerCase() === nameModel.toLowerCase() ||
              nameModel === '--' ||
              p.nameModel === '--' ||
              p.id.startsWith('part-seed-'))
        );
      }
    }

    if (existingIdxInClone >= 0) {
      const prev = partsClone[existingIdxInClone];
      partsClone[existingIdxInClone] = {
        ...prev,
        partSet: assignedSet,
        partNumber,
        nameModel: nameModel === '--' && prev.nameModel && prev.nameModel !== '--' ? prev.nameModel : nameModel,
        rackLocation: rackLocation === '--' && prev.rackLocation ? prev.rackLocation : rackLocation,
        stockQty,
        price: price > 0 ? price : prev.price,
        brand: meta.brandPrefix,
        category: meta.shortLabel,
        isArchived: false,
        updatedAt: nowIso,
      };
      updatedCount++;
    } else {
      newlyAddedParts.push({
        id: `part-imp-${baseTs}-${i}`,
        partSet: assignedSet,
        partNumber,
        nameModel,
        rackLocation,
        stockQty,
        price,
        minStockLevel: 5,
        brand: meta.brandPrefix,
        category: meta.shortLabel,
        unit: 'Pc',
        updatedAt: nowIso,
        isArchived: false,
      });
      addedCount++;
    }
  }

  if (addedCount === 0 && updatedCount === 0) {
    throw new Error(
      'No valid part rows found. Ensure columns include PART NO / Part Number, DESCRIPTION / Part Name, POSITION / Rack No, SELLING RATE / Selling Price.'
    );
  }

  const finalParts = [...newlyAddedParts, ...partsClone];

  const auditEntry: AuditLogEntry = {
    id: `audit-${Date.now()}`,
    timestamp: nowIso,
    action: 'EXCEL_IMPORT_RESTORE',
    actor,
    summary: `Excel/XLSX Import (${isReplaceMode ? 'Replaced' : 'Merged'} ${targetSet ? targetSet.toUpperCase() : 'Inventory'}): ${addedCount} part(s) added, ${updatedCount} part(s) updated.`,
  };

  return {
    nextState: {
      ...state,
      parts: finalParts,
      auditLogs: [auditEntry, ...state.auditLogs],
    },
    addedCount,
    updatedCount,
  };
}

/**
 * Formats an ISO timestamp as DD.MM.YYYY (e.g., 18.04.2024) to match the shop's Excel ledger sheet.
 */
export function formatDateDotDisplay(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const year = ist.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

export interface CustomerLedgerBillRow {
  billId: string;
  billNo: string;
  date: string;
  dueAmount: number;
  billNetTotal: number;
  initialPaid: number;
}

export interface CustomerLedgerReceiptRow {
  id: string;
  date: string;
  voucherNo: string;
  paidAmount: number;
  paymentMode: PaymentMode;
  note: string;
}

export interface CustomerLedgerSheetData {
  billRows: CustomerLedgerBillRow[];
  receiptRows: CustomerLedgerReceiptRow[];
  totalBillDue: number;
  totalReceiptPaid: number;
  remainingBalance: number;
}

/**
 * Builds the side-by-side Excel ledger data for a single customer due record:
 * - Left table: BILL NO | DATE | DUE AMOUNT (original credit due from each bill)
 * - Middle table: DATE | RECEIPT VOUCHER NO | PAID AMOUNT (subsequent due payments)
 * - Right summary: Remaining Balance Due (totalBillDue - totalReceiptPaid)
 */
export function buildCustomerLedgerSheetData(
  due: PendingDue,
  bills: Bill[]
): CustomerLedgerSheetData {
  // Payments recorded against pending dues (without billId) are Receipt Vouchers
  const receiptPayments = [...due.payments]
    .filter((p) => !p.billId)
    .reverse();

  const receiptRows: CustomerLedgerReceiptRow[] = receiptPayments.map((pay, idx) => {
    const isImported = pay.id.startsWith('imp-pay-');
    const voucherCode = isImported
      ? pay.note || '--'
      : `RV-${String(idx + 1).padStart(2, '0')} (${pay.paymentMode})${
          pay.note && !pay.note.startsWith('Payment received') ? ` · ${pay.note}` : ''
        }`;
    return {
      id: pay.id,
      date: isImported ? pay.recordedAt : formatDateDotDisplay(pay.recordedAt),
      voucherNo: voucherCode,
      paidAmount: pay.amount,
      paymentMode: pay.paymentMode,
      note: pay.note || '',
    };
  });

  const totalReceiptPaid = receiptRows.reduce((sum, r) => sum + r.paidAmount, 0);

  // Match customer's credit bills in chronological order
  const matchedBills = bills
    .filter(
      (b) =>
        (due.billIds.includes(b.id) || due.invoiceNumbers.includes(b.invoiceNumber))
    )
    .reverse();

  const billRows: CustomerLedgerBillRow[] = [];

  if (due.importedBillRows && due.importedBillRows.length > 0) {
    due.importedBillRows.forEach((imp, idx) => {
      billRows.push({
        billId: `${due.id}-imp-bill-${idx}`,
        billNo: imp.billNo,
        date: imp.date,
        dueAmount: imp.dueAmount,
        billNetTotal: imp.dueAmount,
        initialPaid: 0,
      });
    });
  }

  if (matchedBills.length > 0) {
    for (const bill of matchedBills) {
      if (billRows.some((r) => r.billNo === bill.invoiceNumber)) continue;
      const initialPaymentsForBill = due.payments
        .filter((p) => p.billId === bill.id)
        .reduce((s, p) => s + p.amount, 0);
      const originalDueOnBill = Math.max(0, bill.netTotal - initialPaymentsForBill);
      billRows.push({
        billId: bill.id,
        billNo: bill.invoiceNumber,
        date: formatDateDotDisplay(bill.createdAt),
        dueAmount: originalDueOnBill,
        billNetTotal: bill.netTotal,
        initialPaid: initialPaymentsForBill,
      });
    }
  } else if (billRows.length === 0) {
    // Fallback if a legacy due has invoice numbers not in bills list
    const fallbackTotalDue = due.balanceDue + totalReceiptPaid;
    const invList = due.invoiceNumbers.length > 0 ? due.invoiceNumbers : ['OPEN-BAL'];
    invList.forEach((inv, idx) => {
      billRows.push({
        billId: `${due.id}-inv-${idx}`,
        billNo: inv,
        date: formatDateDotDisplay(due.lastUpdated),
        dueAmount: idx === 0 ? fallbackTotalDue : 0,
        billNetTotal: due.totalBilled,
        initialPaid: Math.max(0, due.totalPaid - totalReceiptPaid),
      });
    });
  }

  const totalBillDue = billRows.reduce((sum, r) => sum + r.dueAmount, 0);

  return {
    billRows,
    receiptRows,
    totalBillDue,
    totalReceiptPaid,
    remainingBalance: due.balanceDue,
  };
}

function parseLedgerNumericAmount(val: unknown): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.round(val) : 0;
  }
  const str = String(val ?? '')
    .replace(/₹|rs\.?|inr|,/gi, '')
    .trim();
  if (!str) return 0;
  const num = Number(str);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function extractCustomerMetaFromRawTitle(
  rawPrimary: string,
  rawSecondary = ''
): { customerName: string; customerPhone: string; customerVillage: string } {
  const cleanFile = rawPrimary.replace(/\.(xlsx|xls|csv)$/i, '').trim();
  const cleanSheet = rawSecondary.replace(/\.(xlsx|xls|csv)$/i, '').trim();
  const combined = `${cleanFile} ${cleanSheet}`;

  // Extract 10-digit Indian phone number if present
  const phoneMatch = combined.match(/([6-9]\d{9})/);
  const customerPhone = phoneMatch ? phoneMatch[1] : '—';

  const isGenericSheet =
    !cleanSheet ||
    /^sheet\d*$/i.test(cleanSheet) ||
    /^all customer dues$/i.test(cleanSheet) ||
    /credit report/i.test(cleanSheet);
  const isGenericFile =
    !cleanFile ||
    /^sheet\d*$/i.test(cleanFile) ||
    /^all customer dues$/i.test(cleanFile) ||
    /credit report/i.test(cleanFile);
  const baseLabel =
    (!isGenericFile && cleanFile.length > 2
      ? cleanFile
      : !isGenericSheet && cleanSheet.length > 2
      ? cleanSheet
      : cleanFile) || 'Customer';

  // Remove phone number and cleanup underscores/empty parens
  let working = baseLabel
    .replace(customerPhone !== '—' ? customerPhone : '', '')
    .replace(/\(\s*\)/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let customerVillage = 'Local';
  const parenMatch = working.match(/^(.+?)\s*\(([^)]+)\)\s*(.*)$/);
  if (parenMatch) {
    const before = parenMatch[1].trim();
    const inside = parenMatch[2].trim();
    const after = parenMatch[3].trim();
    if (before) {
      working = after ? `${before} ${after}`.trim() : before;
      if (inside) customerVillage = inside;
    }
  } else if (working.includes(' - ')) {
    const parts = working.split(' - ').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      working = parts[0];
      customerVillage = parts.slice(1).join(' - ');
    }
  }

  return {
    customerName: working || cleanFile || 'Customer',
    customerPhone,
    customerVillage,
  };
}

/**
 * Parses an uploaded Excel (.xlsx / .xls / .csv) buffer containing either:
 * 1. A Customer Credit Report sheet (BILL NO | DATE | DUE AMOUNT || DATE | RECEIPT VOUCHER NO | PAID AMOUNT)
 *    including multi-sheet customer workbooks or individual customer files from CUSTOMER'S CREDIT REPORT
 * 2. A Summary Dues table (Customer Name / Name, Phone, Due / Balance Due, Invoice No)
 */
export function parseDuesFromXlsxBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName = '',
  nowIso = new Date().toISOString()
): PendingDue[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return [];
  }

  const parsedDues: PendingDue[] = [];
  const baseTs = Date.now();
  const nonSummarySheets = wb.SheetNames.filter((n) => !/^all customer dues$/i.test(n.trim()));

  for (let sIdx = 0; sIdx < wb.SheetNames.length; sIdx++) {
    const sheetName = wb.SheetNames[sIdx];
    // If workbook has both "All Customer Dues" summary AND individual customer tabs, prefer the detailed tabs
    if (/^all customer dues$/i.test(sheetName.trim()) && nonSummarySheets.length > 0) {
      continue;
    }

    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    });
    if (aoa.length === 0) continue;

    // Check if this sheet is a Summary Dues table (Columns: Customer Name / Name, Phone, Balance Due / Due)
    let summaryHeaderRow = -1;
    let nameCol = -1;
    let phoneCol = -1;
    let villageCol = -1;
    let invCol = -1;
    let billedCol = -1;
    let paidCol = -1;
    let dueCol = -1;

    for (let r = 0; r < Math.min(8, aoa.length); r++) {
      const rowCells = (aoa[r] || []).map((c) => String(c ?? '').trim().toUpperCase());
      const hasName = rowCells.findIndex(
        (c) => c === 'CUSTOMER NAME' || c === 'NAME' || c === 'PARTY NAME' || c === 'CUSTOMER'
      );
      const hasDue = rowCells.findIndex(
        (c) =>
          c.includes('REMAINING DUE') ||
          c.includes('BALANCE DUE') ||
          c === 'DUE' ||
          c === 'DUE AMOUNT' ||
          c === 'TOTAL DUE'
      );
      const hasBillNoCol = rowCells.some((c) => c === 'BILL NO' || c === 'BILL NO.');

      if (hasName >= 0 && hasDue >= 0 && !hasBillNoCol) {
        summaryHeaderRow = r;
        nameCol = hasName;
        dueCol = hasDue;
        phoneCol = rowCells.findIndex((c) => c.includes('PHONE') || c.includes('MOBILE'));
        villageCol = rowCells.findIndex((c) => c.includes('ADDRESS') || c.includes('VILLAGE'));
        invCol = rowCells.findIndex((c) => c.includes('INVOICE') || c.includes('BILL NO') || c.includes('BILL NUMBERS'));
        billedCol = rowCells.findIndex((c) => c.includes('TOTAL BILLED') || c.includes('TOTAL BILL CREDIT'));
        paidCol = rowCells.findIndex((c) => c.includes('VOUCHERS PAID') || c.includes('TOTAL PAID') || c === 'PAID');
        break;
      }
    }

    if (summaryHeaderRow >= 0) {
      for (let r = summaryHeaderRow + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const rawName = String(row[nameCol] ?? '').trim();
        if (!rawName || /^total$/i.test(rawName)) continue;
        const balanceDue = Math.max(0, parseLedgerNumericAmount(row[dueCol]));
        const totalPaid = paidCol >= 0 ? Math.max(0, parseLedgerNumericAmount(row[paidCol])) : 0;
        const totalBilled =
          billedCol >= 0
            ? Math.max(balanceDue + totalPaid, parseLedgerNumericAmount(row[billedCol]))
            : balanceDue + totalPaid;
        const rawPhone = phoneCol >= 0 ? String(row[phoneCol] ?? '').trim() : '—';
        const rawVillage = villageCol >= 0 ? String(row[villageCol] ?? '').trim() : 'Local';
        const rawInvoices =
          invCol >= 0
            ? String(row[invCol] ?? '')
                .split(/[/,;]+/)
                .map((s) => s.trim())
                .filter(Boolean)
            : ['OPEN-BAL'];

        if (balanceDue === 0 && totalBilled === 0) continue;

        parsedDues.push({
          id: `due-imp-${baseTs}-${sIdx}-${r}`,
          customerName: rawName,
          customerPhone: rawPhone || '—',
          customerVillage: rawVillage || 'Local',
          totalBilled,
          totalPaid,
          balanceDue,
          billIds: [],
          invoiceNumbers: rawInvoices.length > 0 ? rawInvoices : ['OPEN-BAL'],
          payments:
            totalPaid > 0
              ? [
                  {
                    id: `imp-pay-${baseTs}-${sIdx}-${r}`,
                    amount: totalPaid,
                    paymentMode: 'CASH',
                    note: 'Imported Paid Balance',
                    recordedBy: 'EXCEL_IMPORT',
                    recordedAt: formatDateDotDisplay(nowIso),
                  },
                ]
              : [],
          importedBillRows: [
            {
              billNo: rawInvoices[0] || 'OPEN-BAL',
              date: formatDateDotDisplay(nowIso),
              dueAmount: totalBilled,
            },
          ],
          lastUpdated: nowIso,
          status: balanceDue > 0 ? 'ACTIVE_DUE' : 'SETTLED',
        });
      }
      continue;
    }

    // Otherwise parse as Customer Credit Report sheet (BILL NO | DATE | DUE AMOUNT || DATE | RECEIPT VOUCHER NO | PAID AMOUNT)
    let headerRowIdx = -1;
    let billNoCol = 0;
    let billDateCol = 1;
    let dueAmtCol = 2;
    let recDateCol = 4;
    let voucherCol = 5;
    let paidAmtCol = 6;
    let bannerTitle = '';

    for (let r = 0; r < Math.min(8, aoa.length); r++) {
      const rowCells = (aoa[r] || []).map((c) => String(c ?? '').trim());
      const upperCells = rowCells.map((c) => c.toUpperCase());
      const bIdx = upperCells.findIndex(
        (c) => c === 'BILL NO' || c === 'BILL NO.' || c === 'INVOICE NO' || c === 'BILL NUMBER'
      );
      const dIdx = upperCells.findIndex((c) => c.includes('DUE AMOUNT') || c === 'DUE');
      if (bIdx >= 0 || dIdx >= 0) {
        headerRowIdx = r;
        if (bIdx >= 0) billNoCol = bIdx;
        if (dIdx >= 0) dueAmtCol = dIdx;
        billDateCol = Math.max(0, dueAmtCol - 1);

        // Locate right-side Receipt columns after dueAmtCol
        const pIdx = upperCells.findIndex(
          (c, idx) => idx > dueAmtCol && (c.includes('PAID AMOUNT') || c === 'PAID')
        );
        const vIdx = upperCells.findIndex(
          (c, idx) => idx > dueAmtCol && (c.includes('RECEIPT') || c.includes('VOUCHER'))
        );
        const rDateIdx = upperCells.findIndex(
          (c, idx) => idx > dueAmtCol && c === 'DATE'
        );
        if (rDateIdx >= 0) recDateCol = rDateIdx;
        if (vIdx >= 0) voucherCol = vIdx;
        if (pIdx >= 0) paidAmtCol = pIdx;
        break;
      } else if (r === 0) {
        const nonEmpty = rowCells.filter(Boolean);
        if (
          nonEmpty.length === 1 &&
          nonEmpty[0].length > 3 &&
          !/credit report/i.test(nonEmpty[0])
        ) {
          bannerTitle = nonEmpty[0];
        }
      }
    }

    const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
    const billRows: { billNo: string; date: string; dueAmount: number }[] = [];
    const receiptRows: { date: string; voucherNo: string; paidAmount: number }[] = [];

    for (let r = startRow; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const rawBillNo = String(row[billNoCol] ?? '').trim();
      const rawBillDate = String(row[billDateCol] ?? '').trim();
      const rawDueAmt = parseLedgerNumericAmount(row[dueAmtCol]);

      const isLeftTotal =
        /^total$/i.test(rawBillNo) ||
        /^total$/i.test(rawBillDate) ||
        /^grand total$/i.test(rawBillNo) ||
        /^grand total$/i.test(rawBillDate);

      // Left-side Bill Row: must not be TOTAL row, and must have either a billNo or billDate when dueAmt > 0
      // (avoids treating an unlabeled =SUM(...) cell at the bottom of Column C as a bill row)
      const currentBillSum = billRows.reduce((s, b) => s + b.dueAmount, 0);
      const isUnlabeledLeftSumRow =
        !rawBillNo &&
        !rawBillDate &&
        billRows.length > 0 &&
        rawDueAmt > 0 &&
        rawDueAmt === currentBillSum;

      if (!isLeftTotal && !isUnlabeledLeftSumRow && (rawBillNo || rawBillDate) && rawDueAmt > 0) {
        billRows.push({
          billNo: rawBillNo || '--',
          date: rawBillDate || '--',
          dueAmount: rawDueAmt,
        });
      }

      // Right-side Receipt Payment Row
      const rawRecDate = String(row[recDateCol] ?? '').trim();
      const rawVoucher = String(row[voucherCol] ?? '').trim();
      const rawPaidAmt = parseLedgerNumericAmount(row[paidAmtCol]);

      const isRightTotal =
        /^total$/i.test(rawRecDate) ||
        /^total$/i.test(rawVoucher) ||
        /^grand total$/i.test(rawRecDate) ||
        /^grand total$/i.test(rawVoucher);

      const currentReceiptSum = receiptRows.reduce((s, rec) => s + rec.paidAmount, 0);
      const isUnlabeledRightSumRow =
        !rawRecDate &&
        !rawVoucher &&
        (isLeftTotal ||
          isUnlabeledLeftSumRow ||
          (receiptRows.length > 0 && rawPaidAmt === currentReceiptSum));

      if (!isRightTotal && !isUnlabeledRightSumRow && rawPaidAmt > 0 && (rawRecDate || rawVoucher || r === startRow)) {
        receiptRows.push({
          date: rawRecDate || '--',
          voucherNo: rawVoucher || '--',
          paidAmount: rawPaidAmt,
        });
      }
    }

    if (billRows.length === 0 && receiptRows.length === 0) {
      continue;
    }

    const totalBillDue = billRows.reduce((s, b) => s + b.dueAmount, 0);
    const totalReceiptPaid = receiptRows.reduce((s, rec) => s + rec.paidAmount, 0);
    const balanceDue = Math.max(0, totalBillDue - totalReceiptPaid);

    const meta =
      nonSummarySheets.length <= 1
        ? extractCustomerMetaFromRawTitle(fileName || bannerTitle || sheetName, bannerTitle || sheetName)
        : extractCustomerMetaFromRawTitle(bannerTitle || sheetName, fileName);

    // Store receipt payments in reverse chronological array order so buildCustomerLedgerSheetData (.reverse())
    // renders them in exact top-to-bottom Excel row order
    const payments: PendingDue['payments'] = [...receiptRows].reverse().map((rec, idx) => ({
      id: `imp-pay-${baseTs}-${sIdx}-${idx}`,
      amount: rec.paidAmount,
      paymentMode: 'CASH',
      note: rec.voucherNo,
      recordedBy: 'EXCEL_IMPORT',
      recordedAt: rec.date,
    }));

    parsedDues.push({
      id: `due-imp-${baseTs}-${sIdx}`,
      customerName: meta.customerName,
      customerPhone: meta.customerPhone,
      customerVillage: meta.customerVillage,
      totalBilled: totalBillDue,
      totalPaid: totalReceiptPaid,
      balanceDue,
      billIds: [],
      invoiceNumbers: billRows.map((b) => b.billNo).filter((b) => b && b !== '--'),
      payments,
      importedBillRows: billRows,
      lastUpdated: nowIso,
      status: balanceDue > 0 ? 'ACTIVE_DUE' : 'SETTLED',
    });
  }

  return parsedDues;
}

/**
 * Replaces or merges imported PendingDue records into the shop state.
 */
export function importDuesRecords(
  state: ShopState,
  incomingDues: Omit<PendingDue, 'id'>[],
  options?: { replaceAll?: boolean; actor?: string } | boolean,
  actorOrNowIso?: string,
  nowIso = new Date().toISOString()
): { nextState: ShopState; addedCount: number; updatedCount: number } {
  if (!incomingDues || incomingDues.length === 0) {
    throw new Error('No valid customer due records found in the uploaded Excel file(s).');
  }

  const replaceAll =
    typeof options === 'boolean' ? options : Boolean(options?.replaceAll);
  const actor =
    typeof options === 'boolean'
      ? actorOrNowIso || 'OWNER'
      : options?.actor || 'OWNER';
  const effectiveNowIso =
    typeof options === 'boolean' ? nowIso : actorOrNowIso || nowIso;
  let addedCount = 0;
  let updatedCount = 0;

  let nextDues: PendingDue[];
  if (replaceAll) {
    nextDues = incomingDues.map((d, idx) => ({
      ...d,
      id: (d as PendingDue).id || `due-imp-${Date.now()}-${idx}`,
      lastUpdated: effectiveNowIso,
    }));
    addedCount = nextDues.length;
  } else {
    nextDues = state.dues.map((d) => ({ ...d }));
    for (const inc of incomingDues) {
      const existingIdx = nextDues.findIndex(
        (d) =>
          d.customerName.trim().toLowerCase() === inc.customerName.trim().toLowerCase() &&
          (d.customerPhone === inc.customerPhone || inc.customerPhone === '—' || d.customerPhone === '—')
      );
      if (existingIdx >= 0) {
        nextDues[existingIdx] = {
          ...inc,
          id: nextDues[existingIdx].id,
          customerPhone:
            inc.customerPhone !== '—' ? inc.customerPhone : nextDues[existingIdx].customerPhone,
          lastUpdated: effectiveNowIso,
        };
        updatedCount++;
      } else {
        nextDues.push({
          ...inc,
          id: (inc as PendingDue).id || `due-imp-${Date.now()}-${addedCount}`,
          lastUpdated: effectiveNowIso,
        });
        addedCount++;
      }
    }
  }

  const auditEntry: AuditLogEntry = {
    id: `audit-${Date.now()}`,
    timestamp: effectiveNowIso,
    action: 'EXCEL_IMPORT_RESTORE',
    actor,
    summary: `Customer Dues Excel Import (${replaceAll ? 'Replaced' : 'Merged'}): ${addedCount} customer due(s) added, ${updatedCount} updated.`,
  };

  return {
    nextState: {
      ...state,
      dues: nextDues,
      auditLogs: [auditEntry, ...state.auditLogs],
    },
    addedCount,
    updatedCount,
  };
}

/**
 * Returns true if a customer's phone number is missing or a placeholder.
 */
export function isCustomerPhoneMissing(phone?: string): boolean {
  if (!phone) return true;
  const trimmed = phone.trim().toUpperCase();
  return (
    !trimmed ||
    trimmed === '—' ||
    trimmed === '--' ||
    trimmed === '-' ||
    trimmed === 'N/A' ||
    trimmed === 'NA' ||
    trimmed === 'NONE' ||
    trimmed === '0'
  );
}

/**
 * Normalizes a customer name so duplicate entries (including "- Copy" or "#25" suffixes)
 * can be identified reliably.
 */
export function normalizeCustomerNameForDupCheck(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\bcopy\b/gi, '')
    .replace(/#\d+/g, '')
    .replace(/\(\s*\d*\s*\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface DuplicateCustomerInfo {
  isDuplicateName: boolean;
  isDuplicatePhone: boolean;
  isCopySuffix: boolean;
  reason: string;
}

/**
 * Identifies customer records that have duplicate names, duplicate phone numbers,
 * or "- Copy" suffixes so the shop owner can filter, review, and clean them up.
 */
export function getDuplicateCustomerAnalysis(
  dues: PendingDue[]
): Map<string, DuplicateCustomerInfo> {
  const nameCounts = new Map<string, number>();
  const phoneCounts = new Map<string, number>();

  for (const d of dues) {
    const normName = normalizeCustomerNameForDupCheck(d.customerName);
    if (normName.length >= 2) {
      nameCounts.set(normName, (nameCounts.get(normName) || 0) + 1);
    }
    if (!isCustomerPhoneMissing(d.customerPhone)) {
      const digits = d.customerPhone.replace(/\D/g, '');
      if (digits.length >= 6) {
        phoneCounts.set(digits, (phoneCounts.get(digits) || 0) + 1);
      }
    }
  }

  const result = new Map<string, DuplicateCustomerInfo>();
  for (const d of dues) {
    const normName = normalizeCustomerNameForDupCheck(d.customerName);
    const digits = !isCustomerPhoneMissing(d.customerPhone)
      ? d.customerPhone.replace(/\D/g, '')
      : '';
    const isDuplicateName = Boolean(normName.length >= 2 && (nameCounts.get(normName) || 0) > 1);
    const isDuplicatePhone = Boolean(digits.length >= 6 && (phoneCounts.get(digits) || 0) > 1);
    const isCopySuffix =
      /\bcopy\b/i.test(d.customerName) ||
      /\bcopy\b/i.test(d.customerVillage) ||
      /#\d+$/.test(d.customerName.trim());

    if (isDuplicateName || isDuplicatePhone || isCopySuffix) {
      const reasons: string[] = [];
      if (isDuplicateName) reasons.push('Same Name');
      if (isDuplicatePhone) reasons.push('Same Phone');
      if (isCopySuffix && !isDuplicateName) reasons.push('Copy Entry');
      result.set(d.id, {
        isDuplicateName: isDuplicateName || isCopySuffix,
        isDuplicatePhone,
        isCopySuffix,
        reason: reasons.join(' · ') || 'Duplicate',
      });
    }
  }

  return result;
}

/**
 * Updates a customer's name, phone number, and address/village in PendingDue
 * and synchronizes any linked Bills.
 */
export function updateCustomerDueDetails(
  state: ShopState,
  dueId: string,
  payload: {
    customerName?: string;
    customerPhone?: string;
    customerVillage?: string;
    actor?: string;
  },
  nowIso = new Date().toISOString()
): { nextState: ShopState; updatedDue: PendingDue } {
  const targetIdx = state.dues.findIndex((d) => d.id === dueId);
  if (targetIdx === -1) {
    throw new Error('Customer record not found.');
  }

  const existing = state.dues[targetIdx];
  const nextName =
    payload.customerName !== undefined ? payload.customerName.trim() : existing.customerName;
  if (!nextName) {
    throw new Error('Customer Name cannot be empty.');
  }

  const rawPhone =
    payload.customerPhone !== undefined ? payload.customerPhone.trim() : existing.customerPhone;
  const nextPhone = isCustomerPhoneMissing(rawPhone) ? '—' : rawPhone;

  const rawVillage =
    payload.customerVillage !== undefined
      ? payload.customerVillage.trim()
      : existing.customerVillage;
  const nextVillage =
    !rawVillage || /^copy$/i.test(rawVillage) ? 'Local' : rawVillage;

  const updatedDue: PendingDue = {
    ...existing,
    customerName: nextName,
    customerPhone: nextPhone,
    customerVillage: nextVillage,
    lastUpdated: nowIso,
  };

  const nextDues = [...state.dues];
  nextDues[targetIdx] = updatedDue;

  // Also keep linked bills in sync
  const linkedBillIds = new Set(existing.billIds);
  const linkedInvoices = new Set(existing.invoiceNumbers);
  const nextBills = state.bills.map((b) => {
    if (linkedBillIds.has(b.id) || linkedInvoices.has(b.invoiceNumber)) {
      return {
        ...b,
        customerName: nextName,
        customerPhone: nextPhone,
        customerVillage: nextVillage,
      };
    }
    return b;
  });

  const auditEntry: AuditLogEntry = {
    id: `audit-${Date.now()}`,
    timestamp: nowIso,
    action: 'DUE_PAYMENT_RECEIVED',
    actor: payload.actor || 'OWNER',
    summary: `Updated Customer Details: ${updatedDue.customerName} · Phone: ${updatedDue.customerPhone} · Address: ${updatedDue.customerVillage}`,
    referenceId: updatedDue.id,
  };

  return {
    nextState: {
      ...state,
      dues: nextDues,
      bills: nextBills,
      auditLogs: [auditEntry, ...state.auditLogs],
    },
    updatedDue,
  };
}

/**
 * Deletes a customer due record (e.g. when cleaning up duplicate entries).
 */
export function deleteCustomerDueRecord(
  state: ShopState,
  dueId: string,
  actor = 'OWNER',
  nowIso = new Date().toISOString()
): { nextState: ShopState } {
  const target = state.dues.find((d) => d.id === dueId);
  if (!target) {
    throw new Error('Customer record not found.');
  }

  const auditEntry: AuditLogEntry = {
    id: `audit-${Date.now()}`,
    timestamp: nowIso,
    action: 'DUE_PAYMENT_RECEIVED',
    actor,
    summary: `Removed customer record: ${target.customerName} (${target.customerPhone})`,
    referenceId: dueId,
  };

  return {
    nextState: {
      ...state,
      dues: state.dues.filter((d) => d.id !== dueId),
      auditLogs: [auditEntry, ...state.auditLogs],
    },
  };
}

function escapeCsvCellValue(val: string | number): string {
  const str = String(val ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an Excel-compatible CSV matching the exact side-by-side layout of the shop's Excel workbook
 * for a single customer's due & receipt voucher transactions.
 */
export function generateCustomerLedgerCsv(due: PendingDue, bills: Bill[]): string {
  const sheet = buildCustomerLedgerSheetData(due, bills);
  const maxDataRows = Math.max(sheet.billRows.length, sheet.receiptRows.length, 1);

  const lines: string[] = [];

  // Title Row
  lines.push(
    [
      `${due.customerName.toUpperCase()} ( ${due.customerPhone} ) - ${due.customerVillage.toUpperCase()}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]
      .map(escapeCsvCellValue)
      .join(',')
  );

  // Column Header Row (Columns A-C: Bills | D: Spacer | E-G: Receipt Vouchers | H: Spacer | I: Summary)
  lines.push(
    [
      'BILL NO',
      'DATE',
      'DUE AMOUNT',
      '',
      'DATE',
      'RECEIPT VOUCHER NO',
      'PAID AMOUNT',
      '',
      'TOTAL AMOUNT PAID / NET DUE',
    ]
      .map(escapeCsvCellValue)
      .join(',')
  );

  for (let i = 0; i < maxDataRows; i++) {
    const bRow = sheet.billRows[i];
    const rRow = sheet.receiptRows[i];
    const rightCol =
      i === 0
        ? String(sheet.remainingBalance)
        : i === 1
        ? `Remaining Due: Rs.${sheet.remainingBalance}`
        : i === 2
        ? `Total Voucher Paid: Rs.${sheet.totalReceiptPaid}`
        : '';

    lines.push(
      [
        bRow ? bRow.billNo : '',
        bRow ? bRow.date : '',
        bRow ? bRow.dueAmount : '',
        '',
        rRow ? rRow.date : '',
        rRow ? rRow.voucherNo : '',
        rRow ? rRow.paidAmount : '',
        '',
        rightCol,
      ]
        .map(escapeCsvCellValue)
        .join(',')
    );
  }

  // Footer TOTAL Row
  lines.push(
    [
      '',
      'TOTAL',
      sheet.totalBillDue,
      '',
      '',
      'TOTAL',
      sheet.totalReceiptPaid,
      '',
      sheet.remainingBalance,
    ]
      .map(escapeCsvCellValue)
      .join(',')
  );

  return lines.join('\n');
}

/**
 * Generates an Excel-compatible CSV for all customer dues on the Pending Customer Dues page.
 */
export function generateAllDuesCsv(dues: PendingDue[], bills: Bill[]): string {
  const headers = [
    'Customer Name',
    'Phone Number',
    'Address / Village',
    'Bill Numbers',
    'Total Billed (Rs)',
    'Initial Paid at Billing (Rs)',
    'Total Bill Credit Due (Rs)',
    'Receipt Vouchers Paid (Rs)',
    'Remaining Due Balance (Rs)',
    'Status',
    'Last Updated',
    'Receipt Voucher Details',
  ];

  const rows = dues.map((due) => {
    const sheet = buildCustomerLedgerSheetData(due, bills);
    const initialPaid = Math.max(0, due.totalPaid - sheet.totalReceiptPaid);
    const voucherSummary =
      sheet.receiptRows.length > 0
        ? sheet.receiptRows
            .map((r) => `${r.date}: ${r.voucherNo} = Rs.${r.paidAmount}`)
            .join(' | ')
        : 'No subsequent voucher payments yet';

    return [
      due.customerName,
      due.customerPhone,
      due.customerVillage,
      due.invoiceNumbers.join(' / '),
      due.totalBilled,
      initialPaid,
      sheet.totalBillDue,
      sheet.totalReceiptPaid,
      due.balanceDue,
      due.balanceDue > 0 ? 'ACTIVE_DUE' : 'SETTLED',
      formatDateDotDisplay(due.lastUpdated),
      voucherSummary,
    ]
      .map(escapeCsvCellValue)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generates an Excel-compatible CSV for all customer bills / sales on the Sales Register page.
 */
export function generateSalesCsv(bills: Bill[]): string {
  const headers = [
    'Invoice Number',
    'Date',
    'Customer Name',
    'Phone Number',
    'Address / Village',
    'Items Count',
    'Parts Sold Summary',
    'Subtotal (Rs)',
    'Discount (Rs)',
    'Final Price (Rs)',
    'Paid Amount (Rs)',
    'Due Amount (Rs)',
    'Payment Mode',
    'Status',
    'Created By',
  ];

  const rows = bills.map((bill) => {
    const partsSummary = bill.items
      .map(
        (it) =>
          `${it.partNumber === 'N/A' ? 'NoCode' : it.partNumber} ${it.nameModel} (x${
            it.quantity
          } @ Rs.${it.unitPrice})`
      )
      .join(' | ');

    const statusLabel = bill.dueAmount > 0
      ? 'PARTIAL_DUE'
      : 'PAID';

    return [
      bill.invoiceNumber,
      formatDateTimeDisplay(bill.createdAt),
      bill.customerName,
      bill.customerPhone,
      bill.customerVillage,
      bill.items.reduce((s, i) => s + i.quantity, 0),
      partsSummary,
      bill.subtotal,
      bill.discountAmount,
      bill.netTotal,
      bill.paidAmount,
      bill.dueAmount,
      bill.paymentMode,
      statusLabel,
      bill.createdBy,
    ]
      .map(escapeCsvCellValue)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function parseCsvLineToCells(line: string): (string | number)[] {
  const result: (string | number)[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      const trimmed = current.trim();
      const asNum = Number(trimmed);
      if (trimmed !== '' && !Number.isNaN(asNum) && /^-?\d+(\.\d+)?$/.test(trimmed) && trimmed.length < 10) {
        result.push(asNum);
      } else {
        result.push(trimmed);
      }
      current = '';
    } else {
      current += ch;
    }
  }
  const trimmed = current.trim();
  const asNum = Number(trimmed);
  if (trimmed !== '' && !Number.isNaN(asNum) && /^-?\d+(\.\d+)?$/.test(trimmed) && trimmed.length < 10) {
    result.push(asNum);
  } else {
    result.push(trimmed);
  }
  return result;
}

function sanitizeExcelSheetName(rawName: string, fallback = 'Sheet1'): string {
  const cleaned = (rawName || fallback)
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

function buildWorksheetFromCsv(csvText: string): XLSX.WorkSheet {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n');
  const aoa = lines.map(parseCsvLineToCells);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const maxCols = aoa.reduce((m, r) => Math.max(m, r.length), 0);
  const cols: XLSX.ColInfo[] = [];
  for (let c = 0; c < maxCols; c++) {
    let maxLen = 12;
    for (const row of aoa) {
      const cellStr = String(row[c] ?? '');
      if (cellStr.length > maxLen) {
        maxLen = Math.min(42, cellStr.length + 3);
      }
    }
    cols.push({ wch: maxLen });
  }
  ws['!cols'] = cols;
  return ws;
}

/**
 * Converts a CSV table string into a native Microsoft Excel (.xlsx) binary buffer.
 */
export function generateXlsxBufferFromCsv(csvText: string, sheetName = 'Sheet1'): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheetFromCsv(csvText);
  XLSX.utils.book_append_sheet(wb, ws, sanitizeExcelSheetName(sheetName));
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

/**
 * Generates a multi-sheet .xlsx workbook for Pending Customer Dues:
 * - Sheet 1 ("All Customer Dues"): Summary of all customer credit accounts
 * - Subsequent Sheets: Individual side-by-side Excel ledger tabs for each customer
 */
export function generateAllDuesXlsxBuffer(dues: PendingDue[], bills: Bill[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  const summaryWs = buildWorksheetFromCsv(generateAllDuesCsv(dues, bills));
  XLSX.utils.book_append_sheet(wb, summaryWs, 'All Customer Dues');

  const usedSheetNames = new Set<string>(['All Customer Dues']);
  dues.forEach((due, idx) => {
    const rawTab = `${due.customerName.toUpperCase()} (${due.customerVillage.toUpperCase()})`;
    let tabName = sanitizeExcelSheetName(rawTab, `Customer ${idx + 1}`);
    if (usedSheetNames.has(tabName)) {
      tabName = sanitizeExcelSheetName(`${due.customerName.slice(0, 20)} #${idx + 1}`);
    }
    usedSheetNames.add(tabName);
    const customerWs = buildWorksheetFromCsv(generateCustomerLedgerCsv(due, bills));
    XLSX.utils.book_append_sheet(wb, customerWs, tabName);
  });

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

function formatExtractedRowsAsFiveColumnCsv(rows: ExtractedShopPartRow[]): string {
  const headers = ['Part Number', 'Part Name', 'Rack No', 'Count', 'Selling Price'];
  const lines = rows.map((r) =>
    [r.partNumber, r.nameModel, r.rackLocation, r.stockQty, r.price]
      .map(escapeCsvCellValue)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

export interface InspectedXlsxSheetInfo {
  sheetName: string;
  rowCount: number;
  detectedSet?: PartSet;
  bannerTitle?: string;
  isShopFormat: boolean;
  csvText: string;
}

export interface InspectedXlsxWorkbook {
  sheets: InspectedXlsxSheetInfo[];
  combinedCsvText: string;
  totalRowCount: number;
  preferredSheetIndex: number;
}

/**
 * Inspects all worksheets inside an uploaded Microsoft Excel (.xlsx / .xls) workbook,
 * extracting valid spare part tables (including shop sheets with PART NO, DESCRIPTION,
 * SELLING RATE / RATE, POSITION / POS, banner titles, and empty/merged columns)
 * and skipping non-part tabs (such as HISAB / customer ledger tabs).
 */
export function inspectXlsxWorkbook(
  buffer: ArrayBuffer | Uint8Array,
  fileName = '',
  forceZeroCount = false
): InspectedXlsxWorkbook {
  const wb = XLSX.read(buffer, { type: 'array' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('The uploaded .xlsx file does not contain any worksheets.');
  }

  const sheets: InspectedXlsxSheetInfo[] = [];
  const allRows: ExtractedShopPartRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: '',
      blankrows: false,
    });
    const extracted = extractShopPartsFromAoA(aoa, {
      sheetName,
      forceZeroCount,
    });
    if (extracted.isPartSheet && extracted.rows.length > 0) {
      sheets.push({
        sheetName,
        rowCount: extracted.rows.length,
        detectedSet: extracted.detectedSet,
        bannerTitle: extracted.bannerTitle,
        isShopFormat: extracted.isShopFormat,
        csvText: formatExtractedRowsAsFiveColumnCsv(extracted.rows),
      });
      allRows.push(...extracted.rows);
    }
  }

  if (sheets.length === 0) {
    // Fallback to first sheet raw CSV if custom headers
    const firstWs = wb.Sheets[wb.SheetNames[0]];
    const fallbackCsv = XLSX.utils.sheet_to_csv(firstWs, { blankrows: false });
    return {
      sheets: [
        {
          sheetName: wb.SheetNames[0],
          rowCount: Math.max(0, fallbackCsv.split('\n').length - 1),
          isShopFormat: false,
          csvText: fallbackCsv,
        },
      ],
      combinedCsvText: fallbackCsv,
      totalRowCount: Math.max(0, fallbackCsv.split('\n').length - 1),
      preferredSheetIndex: 0,
    };
  }

  // Default to the active tab saved in the Excel workbook if valid, or match filename
  let preferredSheetIndex = 0;
  const activeTabIdx = (wb.Workbook?.Views?.[0] as { activeTab?: number } | undefined)?.activeTab;
  if (typeof activeTabIdx === 'number' && wb.SheetNames[activeTabIdx]) {
    const activeName = wb.SheetNames[activeTabIdx];
    const foundActive = sheets.findIndex((s) => s.sheetName === activeName);
    if (foundActive >= 0) {
      preferredSheetIndex = foundActive;
    }
  }

  const cleanFile = fileName.replace(/\.(xlsx|xls|csv)$/i, '').trim().toUpperCase();
  if (cleanFile && sheets.length > 1) {
    const matchedIdx = sheets.findIndex((s) => {
      const bannerUpper = (s.bannerTitle || '').toUpperCase();
      const tabUpper = s.sheetName.toUpperCase();
      if (cleanFile.includes('GAM') && (bannerUpper.includes('GAM') || s.detectedSet === 'gm')) {
        return true;
      }
      if (cleanFile.includes('YANMAR') && !cleanFile.includes('KUBOTA') && s.detectedSet === 'yanmar') {
        return true;
      }
      if (cleanFile.includes('KUBOTA') && !cleanFile.includes('YANMAR') && s.detectedSet === 'kubota') {
        return true;
      }
      return bannerUpper.includes(cleanFile) || tabUpper.includes(cleanFile);
    });
    if (matchedIdx >= 0) {
      preferredSheetIndex = matchedIdx;
    }
  }

  return {
    sheets,
    combinedCsvText: formatExtractedRowsAsFiveColumnCsv(allRows),
    totalRowCount: allRows.length,
    preferredSheetIndex,
  };
}

/**
 * Parses an uploaded Microsoft Excel (.xlsx / .xls) binary buffer into a 5-column CSV string
 * (Part Number, Part Name, Rack No, Count, Selling Price) so importPartsFromCsv can restore
 * spare parts directly from either a 5-column backup or the shop's own Excel sheets.
 */
export function parseXlsxBufferToCsv(
  buffer: ArrayBuffer | Uint8Array,
  options?: { sheetName?: string; fileName?: string; forceZeroCount?: boolean; combineAllSheets?: boolean }
): string {
  const wb = XLSX.read(buffer, { type: 'array' });
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error('The uploaded .xlsx file does not contain any worksheets.');
  }

  if (options?.sheetName && wb.Sheets[options.sheetName]) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[options.sheetName], {
      header: 1,
      defval: '',
      blankrows: false,
    });
    const extracted = extractShopPartsFromAoA(aoa, {
      sheetName: options.sheetName,
      forceZeroCount: options.forceZeroCount,
    });
    if (extracted.isPartSheet && extracted.rows.length > 0) {
      return formatExtractedRowsAsFiveColumnCsv(extracted.rows);
    }
    return XLSX.utils.sheet_to_csv(wb.Sheets[options.sheetName], { blankrows: false });
  }

  const inspected = inspectXlsxWorkbook(buffer, options?.fileName || '', Boolean(options?.forceZeroCount));
  if (options?.combineAllSheets) {
    return inspected.combinedCsvText;
  }
  return inspected.sheets[inspected.preferredSheetIndex]?.csvText || inspected.combinedCsvText;
}
