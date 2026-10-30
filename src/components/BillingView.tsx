/**
 * ============================================================================
 * TAJ HARVESTER — POS CUSTOMER BILLING VIEW (src/components/BillingView.tsx)
 * ============================================================================
 * Features:
 * - Fast Spare Parts search and "+" add to bill
 * - Customer Name, Phone Number, and Address inputs (no preset customer clutter)
 * - Per-part Discount (₹) input so discounts can be applied to specific parts only
 * - Automatic "(org)" tag on Original parts (Kubota, Yanmar, GM)
 * - Strictly Cash and UPI payment modes
 * - Bottom Final Price and Pending Due calculation
 */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  LoaderCircle,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import type { Bill, BillItem, PartSet, PaymentMode, PendingDue, SparePart } from '../types/shop';
import {
  TAJ_HARVESTER_SHOP_INFO,
  calculateBillTotals,
  filterAndSearchParts,
  formatBillPartName,
  isPartSetWithoutPartNumber,
} from '../utils/shopLogic';
import { Button, Card, Dialog, Input, Select } from './ui/primitives';

interface BillingViewProps {
  parts: SparePart[];
  bills: Bill[];
  dues: PendingDue[];
  cart: BillItem[];
  countCheckEnabled?: boolean;
  onToggleCountCheck?: (enabled: boolean) => void;
  onAddToCart: (part: SparePart) => void;
  onAddPart: (partData: {
    partSet: PartSet;
    partNumber: string;
    nameModel: string;
    rackLocation: string;
    stockQty: number;
    price: number;
    minStockLevel: number;
  }) => Promise<SparePart>;
  onUpdateCartQty: (partId: string, quantity: number) => void;
  onUpdateCartUnitPrice: (partId: string, unitPrice: number) => void;
  onUpdateCartDiscount: (partId: string, discountPercent: number) => void;
  onRemoveFromCart: (partId: string) => void;
  onClearCart: () => void;
  onCompleteSale: (payload: {
    customerName: string;
    customerPhone: string;
    customerVillage: string;
    items: {
      partId: string;
      quantity: number;
      discountPercent?: number;
      discount: number;
      unitPrice?: number;
    }[];
    discountAmount: number;
    paidAmount: number;
    paymentMode: PaymentMode;
    ignoreStockCount?: boolean;
  }) => Promise<Bill>;
  onPrintBill: (bill: Bill) => void;
}

export const BillingView: React.FC<BillingViewProps> = ({
  parts,
  bills,
  dues,
  cart,
  countCheckEnabled = false,
  onToggleCountCheck,
  onAddToCart,
  onAddPart,
  onUpdateCartQty,
  onUpdateCartUnitPrice,
  onUpdateCartDiscount,
  onRemoveFromCart,
  onClearCart,
  onCompleteSale,
  onPrintBill,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [setFilter, setSetFilter] = useState<'ALL' | PartSet>('ALL');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerSuggestionsOpen, setCustomerSuggestionsOpen] = useState(false);
  const [paidInput, setPaidInput] = useState<string>('');
  const [isPaidManuallyEdited, setIsPaidManuallyEdited] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastCompletedBill, setLastCompletedBill] = useState<Bill | null>(null);
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [addPartSaving, setAddPartSaving] = useState(false);
  const [addPartError, setAddPartError] = useState('');
  const [newPartSet, setNewPartSet] = useState<PartSet>('local');
  const [newPartNumber, setNewPartNumber] = useState('');
  const [newPartName, setNewPartName] = useState('');
  const [newPartRack, setNewPartRack] = useState('Rack L-05');
  const [newPartStock, setNewPartStock] = useState('20');
  const [newPartPrice, setNewPartPrice] = useState('');

  const normalizeCustomerLookup = (value: string) =>
    value.toLocaleLowerCase().replace(/\s+/g, '');

  const matchingParts = useMemo(
    () => filterAndSearchParts(parts, searchQuery, 'ALL', setFilter).slice(0, 35),
    [parts, searchQuery, setFilter]
  );

  const customerDirectory = useMemo(() => {
    const records = [
      ...bills.map((bill) => ({
        customerName: bill.customerName,
        customerPhone: bill.customerPhone,
        customerVillage: bill.customerVillage,
        updatedAt: bill.createdAt,
      })),
      ...dues.map((due) => ({
        customerName: due.customerName,
        customerPhone: due.customerPhone,
        customerVillage: due.customerVillage,
        updatedAt: due.lastUpdated,
      })),
    ];
    const unique = new Map<string, (typeof records)[number]>();
    for (const record of records) {
      const name = record.customerName.trim();
      if (!name) continue;
      const key = [
        normalizeCustomerLookup(name),
        normalizeCustomerLookup(record.customerPhone),
        normalizeCustomerLookup(record.customerVillage),
      ].join('|');
      const previous = unique.get(key);
      if (!previous || record.updatedAt > previous.updatedAt) {
        unique.set(key, { ...record, customerName: name });
      }
    }
    return [...unique.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [bills, dues]);

  const customerSuggestions = useMemo(() => {
    const query = normalizeCustomerLookup(customerName);
    const phoneQuery = normalizeCustomerLookup(customerPhone);
    const addressQuery = normalizeCustomerLookup(customerAddress);
    if (!query && !phoneQuery && !addressQuery) return customerDirectory.slice(0, 8);
    return customerDirectory
      .filter((record) => {
        const fields = [
          normalizeCustomerLookup(record.customerName),
          normalizeCustomerLookup(record.customerPhone),
          normalizeCustomerLookup(record.customerVillage),
        ];
        return fields.some(
          (field) =>
            (query && field.includes(query)) ||
            (phoneQuery && field.includes(phoneQuery)) ||
            (addressQuery && field.includes(addressQuery))
        );
      })
      .slice(0, 8);
  }, [customerAddress, customerDirectory, customerName, customerPhone]);

  const fillCustomerDetails = (record: {
    customerName: string;
    customerPhone: string;
    customerVillage: string;
  }) => {
    setCustomerName(record.customerName);
    setCustomerPhone(record.customerPhone);
    setCustomerAddress(record.customerVillage);
    setCustomerSuggestionsOpen(false);
  };

  const tryAutofillCustomer = (field: 'name' | 'phone' | 'address', value: string) => {
    const normalized = normalizeCustomerLookup(value);
    if (!normalized) return;
    const matches = customerDirectory.filter((record) => {
      const candidate =
        field === 'name'
          ? record.customerName
          : field === 'phone'
            ? record.customerPhone
            : record.customerVillage;
      return normalizeCustomerLookup(candidate) === normalized;
    });
    if (matches.length === 1) fillCustomerDetails(matches[0]);
  };

  // Calculate subtotal and sum of per-part discounts
  const preliminaryTotals = useMemo(
    () => calculateBillTotals(cart, 0, 0),
    [cart]
  );

  const effectivePaidAmount = isPaidManuallyEdited
    ? Math.max(0, Math.min(preliminaryTotals.netTotal, Number(paidInput) || 0))
    : preliminaryTotals.netTotal;

  const totals = useMemo(
    () => calculateBillTotals(cart, 0, effectivePaidAmount),
    [cart, effectivePaidAmount]
  );

  const handleSubmitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (cart.length === 0) {
      setErrorMsg('Please add at least one spare part to the bill.');
      return;
    }

    if (!customerName.trim()) {
      setErrorMsg('Please enter the customer name.');
      return;
    }

    if (totals.dueAmount > 0 && !customerPhone.trim()) {
      setErrorMsg('Customer phone number is required when there is a pending due balance.');
      return;
    }

    setSubmitting(true);
    try {
      const createdBill = await onCompleteSale({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerVillage: customerAddress.trim() || 'Local',
        items: cart.map((i) => ({
          partId: i.partId,
          quantity: i.quantity,
          discountPercent: i.discountPercent || 0,
          discount: i.discount || 0,
          unitPrice: i.unitPrice,
        })),
        discountAmount: totals.discountAmount,
        paidAmount: totals.paidAmount,
        paymentMode,
        ignoreStockCount: !countCheckEnabled,
      });

      setLastCompletedBill(createdBill);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setPaidInput('');
      setIsPaidManuallyEdited(false);
      onPrintBill(createdBill);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveMissingPart = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddPartError('');
    const isNoPartNumber = isPartSetWithoutPartNumber(newPartSet);
    const name = newPartName.trim();
    const code = isNoPartNumber ? '--' : newPartNumber.trim().toUpperCase();
    const priceValue = Number(newPartPrice);

    if (!name) {
      setAddPartError('Part description is required.');
      return;
    }
    if (!isNoPartNumber && !code) {
      setAddPartError('Part number is required for this part set.');
      return;
    }
    if (!Number.isFinite(priceValue) || priceValue <= 0) {
      setAddPartError('Enter a selling price greater than ₹0.');
      return;
    }

    setAddPartSaving(true);
    try {
      const savedPart = await onAddPart({
        partSet: newPartSet,
        partNumber: code,
        nameModel: name,
        rackLocation: newPartRack.trim() || (isNoPartNumber ? 'Bin / Counter' : 'Rack'),
        stockQty: Math.max(0, Math.round(Number(newPartStock) || 0)),
        price: Math.round(priceValue * 100) / 100,
        minStockLevel: 5,
      });
      onAddToCart(savedPart);
      setAddPartOpen(false);
      setSearchQuery('');
    } catch (err) {
      setAddPartError((err as Error).message);
    } finally {
      setAddPartSaving(false);
    }
  };

  const openAddPart = () => {
    setAddPartError('');
    setNewPartSet('local');
    setNewPartNumber('');
    setNewPartName('');
    setNewPartRack('Rack L-05');
    setNewPartStock('20');
    setNewPartPrice('');
    setAddPartOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div className="relative">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Customer Bill
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {countCheckEnabled
              ? 'Stock Count is ON — items with 0 count cannot be billed.'
              : 'Stock Count is OFF — you can bill any item even if Count is 0.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Stock Count Turn Off / On Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={countCheckEnabled}
            data-testid="toggle-stock-count-check"
            onClick={() => onToggleCountCheck?.(!countCheckEnabled)}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-2.5 transition-colors cursor-pointer ${
              countCheckEnabled
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}
          >
            <span
              className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                countCheckEnabled ? 'bg-emerald-600 justify-end' : 'bg-slate-400 justify-start'
              }`}
            >
              <span className="w-3.5 h-3.5 rounded-full bg-white shadow-2xs block" />
            </span>
            <span>
              {countCheckEnabled ? 'Count Check: ON' : 'Count Check: OFF (Bill Without Count)'}
            </span>
          </button>

          {lastCompletedBill && (
            <Button variant="outline" onClick={() => onPrintBill(lastCompletedBill)}>
              <Printer className="w-4 h-4" />
              Reprint Last Bill ({lastCompletedBill.invoiceNumber})
            </Button>
          )}
        </div>
      </div>

      {lastCompletedBill && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 text-sm"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              Saved <strong>{lastCompletedBill.invoiceNumber}</strong> for{' '}
              <strong>{lastCompletedBill.customerName}</strong> · Final Price ₹
              {lastCompletedBill.netTotal.toLocaleString('en-IN')} · Paid ₹
              {lastCompletedBill.paidAmount.toLocaleString('en-IN')}
              {lastCompletedBill.dueAmount > 0
                ? ` · Pending Due: ₹${lastCompletedBill.dueAmount.toLocaleString('en-IN')}`
                : ' · Paid'}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => onPrintBill(lastCompletedBill)}>
            <Printer className="w-3.5 h-3.5" />
            Print Bill
          </Button>
        </div>
      )}

      {/* Split Screen Layout: Left = Spare Parts Picker | Right = Customer Bill */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Spare Parts Search */}
        <Card className="lg:col-span-5 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 whitespace-nowrap shrink-0">
                Select Parts
              </h2>
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'kubota', 'yanmar', 'gm', 'local', 'bearings', 'others'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSetFilter(s)}
                    className={`px-2 py-1 rounded text-[11px] font-semibold uppercase whitespace-nowrap shrink-0 cursor-pointer ${
                      setFilter === s
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {s === 'ALL' ? 'All' : s}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="search"
                aria-label="Search part for billing"
                placeholder="Search Part Number or Description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="button" variant="amber" size="sm" onClick={openAddPart}>
              <Plus className="w-4 h-4" />
              Add Missing Part
            </Button>
          </div>

          <div className="divide-y divide-slate-200 max-h-[600px] overflow-y-auto">
            {matchingParts.map((part) => {
              const inCartItem = cart.find((c) => c.partId === part.id);
              const outOfStock = part.stockQty <= 0;
              const isAddBlocked = countCheckEnabled && outOfStock;
              return (
                <div
                  key={part.id}
                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="font-mono font-bold text-slate-900 whitespace-nowrap">
                        {isPartSetWithoutPartNumber(part.partSet)
                          ? '--'
                          : part.partNumber}
                      </span>
                      <span>·</span>
                      <span className="font-medium text-slate-800">{part.rackLocation}</span>
                      <span>·</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          outOfStock
                            ? countCheckEnabled
                              ? 'text-red-600'
                              : 'text-slate-700'
                            : part.stockQty <= part.minStockLevel
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        Count: {part.stockQty}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mt-1 truncate">
                      {formatBillPartName(part.nameModel, part.partSet, part.partNumber)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <div className="text-sm font-bold text-slate-900">
                        ₹{part.price.toLocaleString('en-IN')}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant={inCartItem ? 'amber' : 'primary'}
                      size="md"
                      disabled={isAddBlocked}
                      onClick={() => onAddToCart(part)}
                      aria-label={`Add ${part.partNumber} to bill`}
                    >
                      <Plus className="w-4 h-4" />
                      {inCartItem ? `Added (${inCartItem.quantity})` : 'Add'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* RIGHT COLUMN: Customer Bill */}
        <Card className="lg:col-span-7 p-5 space-y-5">
          <div className="flex items-start justify-between pb-3 border-b border-slate-200">
            <div className="relative">
              <h2 className="text-base font-bold text-slate-900">
                {TAJ_HARVESTER_SHOP_INFO.name} — Customer Bill
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                Address: {TAJ_HARVESTER_SHOP_INFO.address} · Ph: {TAJ_HARVESTER_SHOP_INFO.phone}
              </p>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={onClearCart}
                className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer shrink-0"
              >
                Clear Bill
              </button>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
            >
              {errorMsg}
            </div>
          )}

          {/* Bill Line Items Table: Part No | Description | Count | Single Price | Discount (%) | Total Price */}
          <div className="border border-slate-400 rounded-lg overflow-hidden">
            {cart.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-slate-500">
                <ShoppingCart className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                No parts added to bill yet.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-400 bg-slate-200 text-slate-900">
                      <th className="py-2.5 px-2 font-semibold whitespace-nowrap">Part No</th>
                      <th className="py-2.5 px-2 font-semibold">Description</th>
                      <th className="py-2.5 px-1.5 font-semibold text-center whitespace-nowrap">Count</th>
                      <th className="py-2.5 px-1.5 font-semibold text-right whitespace-nowrap">Single Price (₹)</th>
                      <th className="py-2.5 px-1.5 font-semibold text-right whitespace-nowrap">Discount (%)</th>
                      <th className="py-2.5 px-2 font-semibold text-right whitespace-nowrap">Total Price</th>
                      <th className="py-2.5 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {cart.map((item) => {
                      const isNoCode =
                        !item.partNumber ||
                        item.partNumber === 'N/A' ||
                        item.partNumber === '—' ||
                        item.partNumber === '--' ||
                        isPartSetWithoutPartNumber(item.partSet);
                      return (
                        <tr key={item.partId} className="hover:bg-slate-100">
                          <td className="py-2.5 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {isNoCode ? '--' : item.partNumber}
                          </td>
                          <td className="py-2.5 px-2 font-medium text-slate-900 leading-snug">
                            {formatBillPartName(item.nameModel, item.partSet, item.partNumber)}
                          </td>
                          <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Decrease quantity of ${item.nameModel}`}
                                onClick={() => onUpdateCartQty(item.partId, item.quantity - 1)}
                                className="w-6 h-6 rounded border border-slate-300 bg-white flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                aria-label={`Quantity for ${item.nameModel}`}
                                value={item.quantity}
                                onChange={(e) =>
                                  onUpdateCartQty(
                                    item.partId,
                                    Math.max(1, Number(e.target.value) || 1)
                                  )
                                }
                                className="w-9 h-6 text-center font-mono tabular-nums text-xs font-bold border border-slate-300 rounded bg-white"
                              />
                              <button
                                type="button"
                                aria-label={`Increase quantity of ${item.nameModel}`}
                                onClick={() => onUpdateCartQty(item.partId, item.quantity + 1)}
                                className="w-6 h-6 rounded border border-slate-300 bg-white flex items-center justify-center hover:bg-slate-100 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-1.5 text-right whitespace-nowrap">
                            <input
                              type="number"
                              min="1"
                              aria-label={`Single price for ${item.nameModel}`}
                              value={item.unitPrice > 0 ? String(item.unitPrice) : ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  onUpdateCartUnitPrice(item.partId, 0);
                                  return;
                                }
                                onUpdateCartUnitPrice(
                                  item.partId,
                                  Math.max(0, Math.round(Number(raw) || 0))
                                );
                              }}
                              className="w-20 h-7 px-1.5 text-right font-mono tabular-nums text-xs font-bold text-slate-900 border border-slate-300 rounded bg-white focus:ring-2 focus:ring-amber-600 focus:outline-none"
                            />
                          </td>
                          <td className="py-2.5 px-1.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-0.5">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                placeholder="0"
                                aria-label={`Discount percentage for ${item.nameModel}`}
                                value={
                                  item.discountPercent && item.discountPercent > 0
                                    ? String(item.discountPercent)
                                    : ''
                                }
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    onUpdateCartDiscount(item.partId, 0);
                                    return;
                                  }
                                  onUpdateCartDiscount(
                                    item.partId,
                                    Math.max(0, Math.min(100, Number(raw) || 0))
                                  );
                                }}
                                className="w-14 h-7 px-1.5 text-right font-mono tabular-nums text-xs font-semibold border border-slate-300 rounded bg-white placeholder:text-slate-400"
                              />
                              <span className="text-[11px] font-mono font-bold text-slate-600">%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                            ₹{item.lineTotal.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <button
                              type="button"
                              aria-label={`Remove ${item.partNumber} from bill`}
                              onClick={() => onRemoveFromCart(item.partId)}
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Customer Details (Name, Phone, Address) & Final Price Form */}
          <form onSubmit={handleSubmitBill} className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="relative">
                <label
                  htmlFor="pos-customer-name"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Customer Name *
                </label>
                <Input
                  id="pos-customer-name"
                  required
                  value={customerName}
                  onFocus={() => setCustomerSuggestionsOpen(true)}
                  onBlur={() => window.setTimeout(() => setCustomerSuggestionsOpen(false), 150)}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    tryAutofillCustomer('name', e.target.value);
                  }}
                  placeholder="Customer Name"
                />
                {customerSuggestionsOpen && customerSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl ring-1 ring-slate-950/5">
                    {customerSuggestions.map((record) => (
                      <button
                        key={`${record.customerName}-${record.customerPhone}-${record.customerVillage}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => fillCustomerDetails(record)}
                        className="block w-full rounded-md border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none"
                      >
                        <div className="text-xs font-semibold text-slate-900">{record.customerName}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {record.customerPhone || 'No phone'} · {record.customerVillage || 'No address'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <label
                  htmlFor="pos-customer-phone"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Phone Number {totals.dueAmount > 0 ? '*' : ''}
                </label>
                <Input
                  id="pos-customer-phone"
                  value={customerPhone}
                  onFocus={() => setCustomerSuggestionsOpen(true)}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    tryAutofillCustomer('phone', e.target.value);
                  }}
                  placeholder="Phone Number"
                />
              </div>
              <div className="relative">
                <label
                  htmlFor="pos-customer-address"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Address
                </label>
                <Input
                  id="pos-customer-address"
                  value={customerAddress}
                  onFocus={() => setCustomerSuggestionsOpen(true)}
                  onChange={(e) => {
                    setCustomerAddress(e.target.value);
                    tryAutofillCustomer('address', e.target.value);
                  }}
                  placeholder="Village / City Address"
                />
              </div>
            </div>

            {/* Bottom Final Price & Payment Section (Strictly Cash & UPI) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} Count)</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  ₹{totals.subtotal.toLocaleString('en-IN')}
                </span>
              </div>

              {totals.discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Parts Discount</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-700">
                    -₹{totals.discountAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-300 flex items-center justify-between">
                <span className="text-base font-bold text-slate-900">Final Price</span>
                <span
                  className="text-2xl font-bold text-slate-900 font-mono tabular-nums"
                  data-testid="pos-net-total"
                >
                  ₹{totals.netTotal.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="pos-payment-mode"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Payment Mode (Cash / UPI)
                  </label>
                  <Select
                    id="pos-payment-mode"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    className="w-full"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                  </Select>
                </div>

                <div>
                  <label
                    htmlFor="pos-paid-amount"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Paid Amount (₹)
                  </label>
                  <Input
                    id="pos-paid-amount"
                    type="number"
                    min="0"
                    max={totals.netTotal}
                    value={isPaidManuallyEdited ? paidInput : String(totals.netTotal)}
                    onChange={(e) => {
                      setIsPaidManuallyEdited(true);
                      setPaidInput(e.target.value);
                    }}
                    className="font-mono tabular-nums font-bold text-right"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Balance Due</span>
                <span
                  className={`text-base font-bold font-mono tabular-nums ${
                    totals.dueAmount > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                  data-testid="pos-due-amount"
                >
                  {totals.dueAmount > 0
                    ? `₹${totals.dueAmount.toLocaleString('en-IN')} Due`
                    : '₹0'}
                </span>
              </div>
            </div>

            <Button
              type="submit"
              variant="amber"
              size="lg"
              disabled={submitting || cart.length === 0}
              className="w-full"
            >
              {submitting ? (
                <LoaderCircle className="w-5 h-5 animate-spin" />
              ) : (
                <Printer className="w-5 h-5" />
              )}
              {submitting ? 'Saving Bill...' : 'Complete Sale & Print Bill'}
            </Button>
          </form>
        </Card>
      </div>

      <Dialog
        open={addPartOpen}
        onClose={() => {
          if (!addPartSaving) setAddPartOpen(false);
        }}
        title="Add Missing Part"
        description="Save this part to inventory and add it directly to the current bill."
      >
        <form onSubmit={handleSaveMissingPart} className="space-y-4">
          {addPartError && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {addPartError}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Part Set
              <Select
                className="mt-1 w-full"
                value={newPartSet}
                onChange={(e) => {
                  const nextSet = e.target.value as PartSet;
                  setNewPartSet(nextSet);
                  if (isPartSetWithoutPartNumber(nextSet)) {
                    setNewPartNumber('');
                    setNewPartRack('Bin / Counter');
                  } else if (newPartSet === 'others') {
                    setNewPartRack('Rack L-05');
                  }
                }}
                disabled={addPartSaving}
              >
                <option value="kubota">Kubota</option>
                <option value="yanmar">Yanmar</option>
                <option value="gm">GM</option>
                <option value="local">Local</option>
                <option value="bearings">Bearings</option>
                <option value="others">Others</option>
              </Select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Part Number
              <Input
                className="mt-1"
                value={newPartNumber}
                onChange={(e) => setNewPartNumber(e.target.value)}
                placeholder={isPartSetWithoutPartNumber(newPartSet) ? 'Not required' : 'e.g. AF101-010'}
                disabled={addPartSaving || isPartSetWithoutPartNumber(newPartSet)}
              />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-700">
            Description
            <Input
              className="mt-1"
              value={newPartName}
              onChange={(e) => setNewPartName(e.target.value)}
              placeholder="Part name / description"
              disabled={addPartSaving}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-xs font-semibold text-slate-700">
              Rack / Bin
              <Input className="mt-1" value={newPartRack} onChange={(e) => setNewPartRack(e.target.value)} disabled={addPartSaving} />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Stock
              <Input className="mt-1" type="number" min="0" value={newPartStock} onChange={(e) => setNewPartStock(e.target.value)} disabled={addPartSaving} />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              Selling Price
              <Input className="mt-1" type="number" min="1" step="0.01" value={newPartPrice} onChange={(e) => setNewPartPrice(e.target.value)} disabled={addPartSaving} />
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setAddPartOpen(false)} disabled={addPartSaving}>
              Cancel
            </Button>
            <Button type="submit" variant="amber" disabled={addPartSaving}>
              {addPartSaving ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {addPartSaving ? 'Saving Part...' : 'Save & Add to Bill'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
