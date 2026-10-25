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
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import type { Bill, BillItem, PartSet, PaymentMode, SparePart } from '../types/shop';
import {
  TAJ_HARVESTER_SHOP_INFO,
  calculateBillTotals,
  filterAndSearchParts,
  formatBillPartName,
} from '../utils/shopLogic';
import { Button, Card, Input, Select } from './ui/primitives';

interface BillingViewProps {
  parts: SparePart[];
  cart: BillItem[];
  countCheckEnabled?: boolean;
  onToggleCountCheck?: (enabled: boolean) => void;
  onAddToCart: (part: SparePart) => void;
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
  cart,
  countCheckEnabled = false,
  onToggleCountCheck,
  onAddToCart,
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
  const [paidInput, setPaidInput] = useState<string>('');
  const [isPaidManuallyEdited, setIsPaidManuallyEdited] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastCompletedBill, setLastCompletedBill] = useState<Bill | null>(null);

  const matchingParts = useMemo(
    () => filterAndSearchParts(parts, searchQuery, 'ALL', setFilter).slice(0, 35),
    [parts, searchQuery, setFilter]
  );

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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
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
                {(['ALL', 'kubota', 'yanmar', 'gm', 'local', 'others'] as const).map((s) => (
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
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-bold text-slate-900 whitespace-nowrap">
                        {part.partNumber === 'N/A' || part.partSet === 'others'
                          ? 'No Part No.'
                          : part.partNumber}
                      </span>
                      <span>·</span>
                      <span className="font-medium text-slate-700">{part.rackLocation}</span>
                      <span>·</span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          outOfStock
                            ? countCheckEnabled
                              ? 'text-red-600'
                              : 'text-slate-500'
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
            <div>
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
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {cart.length === 0 ? (
              <div className="py-8 px-4 text-center text-xs text-slate-500">
                <ShoppingCart className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                No parts added to bill yet.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2.5 px-2 font-semibold whitespace-nowrap">Part No</th>
                      <th className="py-2.5 px-2 font-semibold">Description</th>
                      <th className="py-2.5 px-1.5 font-semibold text-center whitespace-nowrap">Count</th>
                      <th className="py-2.5 px-1.5 font-semibold text-right whitespace-nowrap">Single Price (₹)</th>
                      <th className="py-2.5 px-1.5 font-semibold text-right whitespace-nowrap">Discount (%)</th>
                      <th className="py-2.5 px-2 font-semibold text-right whitespace-nowrap">Total Price</th>
                      <th className="py-2.5 px-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cart.map((item) => {
                      const isNoCode =
                        !item.partNumber ||
                        item.partNumber === 'N/A' ||
                        item.partNumber === '—' ||
                        item.partSet === 'others';
                      return (
                        <tr key={item.partId} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {isNoCode ? '—' : item.partNumber}
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
              <div>
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
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer Name"
                />
              </div>
              <div>
                <label
                  htmlFor="pos-customer-phone"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Phone Number {totals.dueAmount > 0 ? '*' : ''}
                </label>
                <Input
                  id="pos-customer-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Phone Number"
                />
              </div>
              <div>
                <label
                  htmlFor="pos-customer-address"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Address
                </label>
                <Input
                  id="pos-customer-address"
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
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
              <Printer className="w-5 h-5" />
              {submitting ? 'Saving Bill...' : 'Complete Sale & Print Bill'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
