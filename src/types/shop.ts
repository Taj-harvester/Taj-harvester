/**
 * ============================================================================
 * TAJ HARVESTER — CORE TYPESCRIPT DEFINITIONS
 * ============================================================================
 * Defines data structures for:
 * - Role-based Authentication (Owner from .env + Owner-managed Staff accounts)
 * - 4 Spare Parts Database Sets ('kubota', 'yanmar', 'gm', 'local')
 * - 5-Field Spare Parts Inventory (partNumber, nameModel, rackLocation, stockQty, price)
 * - POS Customer Billing with per-part discount, Address, Cash/UPI only, and (org) badge
 * - Customer Pending Dues (Khata) & Simple Custom Dealer Order Lists
 */

export type UserRole = 'OWNER' | 'STAFF';

export interface ShopUser {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  role: UserRole;
  clerkUserId?: string;
}

/**
 * Owner Account stored in state (initialized from .env: OWNER_USER_ID, OWNER_PASSWORD, OWNER_EMAIL).
 * Owner can update their password or reset it via registered email.
 */
export interface OwnerAccount {
  username: string;
  password: string;
  fullName: string;
  email: string;
  updatedAt: string;
}

/**
 * Staff Account created and managed exclusively by the Owner.
 * Owner can view staff credentials (username & password) at any time if staff forgets.
 */
export interface StaffAccount {
  id: string;
  username: string;
  password: string; // Stored visibly for the Owner so staff can ask the Owner for their credentials
  fullName: string;
  createdAt: string;
}

/**
 * 5 Database Sets requested by user:
 * - 'kubota': Kubota original parts -> prints (org) on bill
 * - 'yanmar': Yanmar original parts -> prints (org) on bill
 * - 'gm': GM original parts -> prints (org) on bill
 * - 'local': All other different local parts -> no (org) suffix
 * - 'others': Hardware & general items with no part number (Nut Bolt, Washer, Spring Washer, Gum, Rust Spray, etc.)
 */
export type PartSet = 'kubota' | 'yanmar' | 'gm' | 'local' | 'others';

/**
 * Every part holds the 5 core details:
 * 1. partNumber (Part Number, or 'N/A' for 'others')
 * 2. nameModel (Part Name holding "BrandName - PartName")
 * 3. rackLocation (Rack No - for inventory only, never shown on customer bill)
 * 4. stockQty (Count)
 * 5. price (Selling Price)
 */
export interface SparePart {
  id: string;
  partSet: PartSet;
  partNumber: string;
  nameModel: string;
  rackLocation: string;
  stockQty: number;
  price: number;
  minStockLevel: number;
  brand: string;
  category: string;
  unit: string;
  updatedAt: string;
  isArchived?: boolean;
}

/**
 * Customer Bill Line Item:
 * - No rack number shown on bill
 * - Supports per-part percentage discount (`discountPercent`, e.g. 10%) and calculated `discount` (₹)
 * - Original parts ('kubota' | 'yanmar' | 'gm') print with "(org)" on the bill
 */
export interface BillItem {
  partId: string;
  partSet?: PartSet;
  partNumber: string;
  nameModel: string;
  rackLocation?: string;
  unitPrice: number; // Single Price
  quantity: number; // Count
  discountPercent?: number; // Per-part Discount Percentage (0-100%), e.g. 10 for 10%
  discount: number; // Calculated Per-part Discount Amount (₹) = Math.round((unitPrice * quantity * discountPercent) / 100)
  lineTotal: number; // After calculation Total Price = (unitPrice * quantity) - discount
}

export type PaymentStatus = 'PAID' | 'PARTIAL_DUE' | 'UNPAID';

/**
 * Payment Mode restricted strictly to Cash and UPI as requested.
 */
export type PaymentMode = 'CASH' | 'UPI';

export interface Bill {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  customerVillage: string; // Customer Address
  items: BillItem[];
  subtotal: number;
  discountAmount: number; // Sum of per-part discounts
  netTotal: number; // Final Price at bottom of bill
  paidAmount: number;
  dueAmount: number;
  paymentStatus: PaymentStatus;
  paymentMode: PaymentMode;
  createdBy: string;
  createdAt: string;
  isVoided: boolean;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
}

export interface DuePaymentRecord {
  id: string;
  amount: number;
  paymentMode: PaymentMode;
  note: string;
  recordedBy: string;
  recordedAt: string;
  billId?: string;
}

export interface PendingDue {
  id: string;
  customerName: string;
  customerPhone: string;
  customerVillage: string; // Customer Address
  totalBilled: number;
  totalPaid: number;
  balanceDue: number;
  billIds: string[];
  invoiceNumbers: string[];
  payments: DuePaymentRecord[];
  importedBillRows?: {
    billNo: string;
    date: string;
    dueAmount: number;
  }[];
  lastUpdated: string;
  status: 'ACTIVE_DUE' | 'SETTLED';
}

export interface Dealer {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  city: string;
  brandsSupplied: string[];
  gstNumber: string;
}

export interface DealerOrderItem {
  partId: string;
  partNumber: string;
  nameModel: string;
  rackLocation?: string;
  currentStock: number;
  minStockLevel: number;
  orderQty: number;
  estimatedUnitCost?: number;
}

export interface DealerOrder {
  id: string;
  orderNumber: string;
  dealerId: string;
  dealerName: string;
  dealerPhone: string;
  dealerCity: string;
  items: DealerOrderItem[];
  totalItemsCount: number;
  totalUnitsQty: number;
  estimatedOrderValue: number;
  notes: string;
  createdBy: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action:
    | 'BILL_CREATED'
    | 'BILL_VOIDED'
    | 'DUE_PAYMENT_RECEIVED'
    | 'PART_ADDED'
    | 'PART_UPDATED'
    | 'PART_ARCHIVED'
    | 'EXCEL_IMPORT_RESTORE'
    | 'BACKUP_EXPORTED'
    | 'DEALER_ORDER_GENERATED';
  actor: string;
  summary: string;
  referenceId?: string;
}

export interface BackupSnapshot {
  id: string;
  createdAt: string;
  type: 'AUTO_DAILY' | 'MANUAL_EXCEL';
  partsCount: number;
  billsCount: number;
  activeDuesCount: number;
  totalStockValue: number;
  triggeredBy: string;
}

export interface ShopState {
  schemaVersion?: number;
  ownerAccount?: OwnerAccount;
  staffAccounts?: StaffAccount[];
  parts: SparePart[];
  bills: Bill[];
  dues: PendingDue[];
  dealers: Dealer[];
  dealerOrders: DealerOrder[];
  auditLogs: AuditLogEntry[];
  backups: BackupSnapshot[];
}
