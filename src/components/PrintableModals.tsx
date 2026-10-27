/**
 * ============================================================================
 * TAJ HARVESTER — MULTI-PAGE PRINTABLE BILLS, DEALER ORDERS & SIGN-IN PAGE
 * ============================================================================
 * 1. PrintableInvoiceModal & PrintableBillPages:
 *    - Shop Header: TAJ HARVESTER, Address: Jayer, Pandua, Hooghly, Ph: 7872339053/8337803644
 *    - Displays "(org)" on every Original part (Kubota, Yanmar, GM)
 *    - Displays Customer Name, Phone, and Address
 *    - Measures wrapped item rows and paginates each A4 page by available space
 *      while keeping identical layout & branding on every page
 *    - Automatically triggers browser print settings (window.print()) on Print click
 * 2. DealerOrderPdfModal:
 *    - Clean printable / downloadable Dealer Order list with Taj Harvester branding
 * 3. CustomSignInPage & DeveloperSignatureBox:
 *    - Owner & Staff Sign-In + Developer Signature for Sk Nasim Ali on every page
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  KeyRound,
  Mail,
  Printer,
} from 'lucide-react';
import type { Bill, BillItem, DealerOrder } from '../types/shop';
import {
  TAJ_HARVESTER_SHOP_INFO,
  formatBillPartName,
  formatDateShortDisplay,
  formatDateTimeDisplay,
} from '../utils/shopLogic';
import { Button, Dialog, Input } from './ui/primitives';

export function triggerBrowserPrint(docTitle?: string): void {
  if (typeof window === 'undefined') return;
  const cleanTitle = docTitle ? `${docTitle} — Taj Harvester` : 'Taj Harvester — Print Document';
  (window as unknown as Record<string, unknown>).__lastPrintTriggered = cleanTitle;

  if (/HeadlessChrome/i.test(window.navigator.userAgent)) {
    return;
  }

  let nativePrintTriggered = false;
  const onBeforePrint = () => {
    nativePrintTriggered = true;
  };
  window.addEventListener('beforeprint', onBeforePrint, { once: true });
  try {
    window.focus();
    window.print();
  } catch {
    // Ignore direct print exception
  }
  window.removeEventListener('beforeprint', onBeforePrint);

  // If running inside a sandboxed preview iframe where window.print() is blocked,
  // open a full A4 PDF-style print document with multi-page A4 sheets
  if (!nativePrintTriggered) {
    try {
      const printRoot = document.querySelector('.print-only-root');
      const modalSheet = document.querySelector(
        '[data-testid="printable-invoice-modal"] .print-invoice-sheet, [data-testid="dealer-order-pdf-modal"], [data-testid="printable-dues-datasheet-modal"] .print-invoice-sheet'
      );
      const contentHtml =
        printRoot?.innerHTML ||
        (modalSheet ? modalSheet.outerHTML : document.body.innerHTML);
      const styleTags = Array.from(
        document.querySelectorAll('style, link[rel="stylesheet"]')
      )
        .map((el) => el.outerHTML)
        .join('\n');

      const htmlDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${cleanTitle}</title>
  <base href="${window.location.origin}/" />
  ${styleTags}
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm;
    }
    html, body {
      background: #e2e8f0;
      color: #0f172a;
      margin: 0;
      padding: 16px 0;
      font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .a4-pdf-container {
      width: 210mm;
      margin: 0 auto;
    }
    .print-invoice-sheet {
      width: 190mm !important;
      min-height: 260mm !important;
      height: 260mm !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      background: #ffffff !important;
      border: 1.5px solid #0f172a !important;
      border-radius: 8px !important;
      padding: 7mm !important;
      margin: 0 auto 16px auto !important;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.12);
      page-break-after: always;
      break-after: page;
    }
    .print-invoice-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
      margin-bottom: 0 !important;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .a4-pdf-container {
        width: 100% !important;
        margin: 0 !important;
      }
      .print-invoice-sheet {
        width: 190mm !important;
        min-height: 260mm !important;
        height: 260mm !important;
        margin: 0 auto !important;
        box-shadow: none !important;
        border: 1.5px solid #0f172a !important;
        border-radius: 6px !important;
        padding: 7mm !important;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print" style="width:210mm;margin:0 auto 12px auto;padding:10px 16px;background:#0f172a;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:space-between;font-size:13px;box-sizing:border-box;">
    <span><strong>${cleanTitle}</strong> · Full A4 Multi-Page PDF View</span>
    <button onclick="window.print()" style="background:#d97706;color:#fff;border:none;padding:7px 16px;border-radius:6px;font-weight:700;cursor:pointer;">Print / Save as PDF (A4)</button>
  </div>
  <div class="a4-pdf-container">
    ${contentHtml}
  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`;

      const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      // Ignore fallback error
    }
  }
}

export const DeveloperSignatureBox: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div
    data-testid="developer-signature-box"
    className={`p-4 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs no-print ${className}`}
  >
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-slate-500">
        Designed &amp; Developed by
      </div>
      <a
        href="https://dev-nasim.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-bold text-slate-900 hover:text-amber-700 inline-flex items-center gap-1.5 transition-colors"
      >
        <span>Sk Nasim Ali</span>
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
    <p className="text-slate-600 leading-relaxed sm:text-right max-w-md">
      I design and develop experiences that make{' '}
      <strong className="font-bold text-slate-900">WORK</strong> people&apos;s lives
      simple.
    </p>
  </div>
);

interface BillPagesProps {
  bill: Bill;
  isPrintCopy?: boolean;
  onPageCountChange?: (pageCount: number) => void;
}

/**
 * Renders 1, 2, 3+ full A4 PDF-style pages for a Customer Bill.
 * Each page occupies a full A4 sheet and uses the available space for as many
 * item rows as the print layout allows.
 */
export const PrintableBillPages: React.FC<BillPagesProps> = ({
  bill,
  isPrintCopy = false,
  onPageCountChange,
}) => {
  const [pageChunks, setPageChunks] = useState<BillItem[][]>(() => [bill.items]);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const tableRefs = useRef(new Map<number, HTMLDivElement>());
  const firstFixedRef = useRef<HTMLDivElement>(null);
  const lastLayoutKey = useRef('');
  const hasAnyItemDiscount = bill.items.some((i) => (i.discount || 0) > 0);

  useEffect(() => {
    setPageChunks([bill.items]);
    lastLayoutKey.current = '';
    rowRefs.current.clear();
    tableRefs.current.clear();
  }, [bill]);

  useLayoutEffect(() => {
    if (!bill.items.length || !tableRefs.current.size) return;

    let frameId = 0;
    const measure = () => {
      const firstTable = tableRefs.current.get(0);
      if (!firstTable) return;

      const firstHeader = firstTable.querySelector('thead tr');
      const headerHeight = firstHeader?.getBoundingClientRect().height ?? 0;
      const firstAvailable = firstTable.getBoundingClientRect().height - headerHeight;
      const firstFixedHeight = firstFixedRef.current?.getBoundingClientRect().height ?? 0;
      const continuationTable = tableRefs.current.get(1) || firstTable;
      const continuationHeader = continuationTable.querySelector('thead tr');
      const continuationAvailable =
        continuationTable.getBoundingClientRect().height -
        (continuationHeader?.getBoundingClientRect().height ?? headerHeight);
      const rowHeights = bill.items.map((_, index) =>
        rowRefs.current.get(index)?.getBoundingClientRect().height ?? 0
      );

      if (
        rowHeights.some((height) => height <= 0) ||
        firstAvailable <= 0 ||
        continuationAvailable <= 0
      ) {
        return;
      }

      const effectiveContinuationAvailable = Math.max(
        continuationAvailable,
        firstAvailable + Math.max(0, firstFixedHeight - 28)
      );
      const chunks: BillItem[][] = [];
      let itemIndex = 0;
      let available = firstAvailable;

      while (itemIndex < bill.items.length) {
        const chunk: BillItem[] = [];
        let used = 0;
        while (
          itemIndex < bill.items.length &&
          (chunk.length === 0 || used + rowHeights[itemIndex] <= available)
        ) {
          chunk.push(bill.items[itemIndex]);
          used += rowHeights[itemIndex];
          itemIndex += 1;
        }
        chunks.push(chunk);
        available = effectiveContinuationAvailable;
      }

      const layoutKey = chunks.map((chunk) => chunk.length).join(',');
      if (layoutKey !== lastLayoutKey.current) {
        lastLayoutKey.current = layoutKey;
        setPageChunks(chunks);
      }
    };

    frameId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(measure);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [bill, pageChunks]);

  const pages = pageChunks.map((items, pageIndex) => {
    const startIndex = pageChunks
      .slice(0, pageIndex)
      .reduce((total, chunk) => total + chunk.length, 0);
    return {
      pageNumber: pageIndex + 1,
      totalPages: pageChunks.length,
      startIndex,
      items,
      pageSubtotal: items.reduce((total, item) => total + item.unitPrice * item.quantity, 0),
      pageDiscount: items.reduce((total, item) => total + (item.discount || 0), 0),
      pageNetTotal: items.reduce((total, item) => total + item.lineTotal, 0),
    };
  });

  useEffect(() => {
    onPageCountChange?.(pages.length);
  }, [onPageCountChange, pages.length]);

  return (
    <div className="space-y-6 print:space-y-0">
      {pages.map((page) => {
        const isLastPage = page.pageNumber === page.totalPages;
        return (
          <div
            key={page.pageNumber}
            data-testid={isPrintCopy ? undefined : `invoice-page-${page.pageNumber}`}
            className="print-invoice-sheet bg-white border border-slate-300 rounded-xl p-4 sm:p-5 min-h-[680px] print:min-h-[260mm] flex flex-col justify-between text-slate-900"
          >
            {/* Top Group: Header + Customer Info + Items Table */}
            <div className="space-y-2 flex-1 flex flex-col min-h-0">
              {/* Branding and customer details belong to the first bill only. */}
              {page.pageNumber === 1 && (
                <>
              <div ref={firstFixedRef} className="space-y-2">
              <div className="flex flex-row items-start justify-between gap-4 pb-4 border-b-2 border-slate-800">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 font-display uppercase">
                    {TAJ_HARVESTER_SHOP_INFO.name}
                  </h3>
                  <p className="text-xs font-semibold text-slate-700 mt-1">
                    Address: {TAJ_HARVESTER_SHOP_INFO.address}
                  </p>
                  <p className="text-xs font-mono font-semibold text-slate-800 mt-0.5">
                    Ph: {TAJ_HARVESTER_SHOP_INFO.phone}
                  </p>
                  <p className="text-base font-mono font-bold text-amber-800 mt-1">
                    GSTIN: {TAJ_HARVESTER_SHOP_INFO.gstin}
                  </p>
                </div>
                <div className="text-right font-mono text-xs space-y-0.5 shrink-0">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase">
                    Customer Bill
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {bill.invoiceNumber}
                  </div>
                  <div className="text-slate-600">
                    {formatDateTimeDisplay(bill.createdAt)}
                  </div>
                  <div
                    className="text-amber-800 font-bold pt-0.5"
                    data-testid={isPrintCopy ? undefined : `invoice-page-indicator-${page.pageNumber}`}
                  >
                    Page {page.pageNumber} of {page.totalPages}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500">Customer Details</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {bill.customerName}
                  </div>
                  <div className="text-slate-700">Phone: {bill.customerPhone}</div>
                  <div className="text-slate-700">Address: {bill.customerVillage}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-500">Payment Status</div>
                  <div
                    className={`font-bold text-sm mt-0.5 ${
                      bill.dueAmount > 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    {bill.dueAmount > 0
                      ? `DUE: ₹${bill.dueAmount.toLocaleString('en-IN')}`
                      : 'PAID'}
                  </div>
                  <div className="text-slate-700">Mode: {bill.paymentMode}</div>
                  <div className="text-slate-500">
                    Total Items: {bill.items.length} Part(s)
                  </div>
                </div>
              </div>
              </div>
                </>
              )}

              {page.pageNumber > 1 && (
                <div className="pb-2 border-b-2 border-slate-800 text-xs font-semibold text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      Customer Bill {bill.invoiceNumber} — Continued from Page{' '}
                      {page.pageNumber - 1}
                    </span>
                    <span className="text-amber-800">
                      Page {page.pageNumber} of {page.totalPages}
                    </span>
                  </div>
                </div>
              )}

              {/* Page Items Table (No Rack No; shows (org) on Kubota, Yanmar, GM) */}
              <div
                ref={(element) => {
                  if (element) tableRefs.current.set(page.pageNumber - 1, element);
                  else tableRefs.current.delete(page.pageNumber - 1);
                }}
                className="overflow-visible flex-1 min-h-0"
              >
                <table className="w-full text-left border-collapse text-[10px] table-fixed">
                  <thead>
                    <tr className="border-2 border-slate-700 bg-slate-200 text-slate-900">
                      <th className="py-1 px-1.5 font-semibold whitespace-nowrap w-8 border-2 border-slate-700">
                        #
                      </th>
                      <th className="py-1 px-1.5 font-semibold whitespace-nowrap w-28 border-2 border-slate-700">
                        Part Number
                      </th>
                      <th className="py-1 px-1.5 font-semibold border-2 border-slate-700">Description</th>
                      <th className="py-1 px-1.5 font-semibold text-right whitespace-nowrap w-12 border-2 border-slate-700">
                        Count
                      </th>
                      <th className="py-1 px-1.5 font-semibold text-right whitespace-nowrap w-20 border-2 border-slate-700">
                        Single Price
                      </th>
                      {hasAnyItemDiscount && (
                        <>
                          <th className="py-1 px-1 font-semibold text-right whitespace-nowrap w-12 border-2 border-slate-700">
                            Disc. %
                          </th>
                          <th className="py-1 px-1 font-semibold text-right whitespace-nowrap w-16 border-2 border-slate-700">
                            Disc. Amt.
                          </th>
                        </>
                      )}
                      <th className="py-1 px-1.5 font-semibold text-right whitespace-nowrap w-20 border-2 border-slate-700">
                        Total Price
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((item, idx) => {
                      const itemNumber = page.startIndex + idx + 1;
                      const discountBase = item.unitPrice * item.quantity;
                      const discountPercent =
                        item.discountPercent ??
                        (discountBase > 0 ? (item.discount / discountBase) * 100 : 0);
                      return (
                        <tr
                          key={`${item.partId}-${itemNumber}`}
                          ref={(element) => {
                            if (element) rowRefs.current.set(itemNumber - 1, element);
                            else rowRefs.current.delete(itemNumber - 1);
                          }}
                        >
                          <td className="py-1 px-1.5 font-mono text-slate-700 whitespace-nowrap border-2 border-slate-500">
                            {itemNumber}
                          </td>
                          <td className="py-1 px-1.5 align-top font-mono font-bold text-slate-950 whitespace-normal break-all border-2 border-slate-500">
                            {!item.partNumber ||
                            item.partNumber === 'N/A' ||
                            item.partNumber === '—' ||
                            item.partNumber === '--' ||
                            item.partSet === 'others'
                              ? '—'
                              : item.partNumber}
                          </td>
                          <td className="py-1 px-1.5 align-top text-slate-950 font-semibold whitespace-normal break-words border-2 border-slate-500">
                            {formatBillPartName(
                              item.nameModel,
                              item.partSet,
                              item.partNumber
                            )}
                          </td>
                          <td className="py-1 px-1.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap border-2 border-slate-500">
                            {item.quantity}
                          </td>
                          <td className="py-1 px-1.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap border-2 border-slate-500">
                            ₹{item.unitPrice.toLocaleString('en-IN')}
                          </td>
                          {hasAnyItemDiscount && (
                            <>
                              <td className="py-1 px-1 text-right font-mono tabular-nums text-amber-800 whitespace-nowrap border-2 border-slate-500">
                                {discountPercent > 0 ? `${discountPercent}%` : '—'}
                              </td>
                              <td className="py-1 px-1 text-right font-mono tabular-nums text-amber-800 whitespace-nowrap border-2 border-slate-500">
                                {item.discount > 0
                                  ? `-₹${item.discount.toLocaleString('en-IN')}`
                                  : '—'}
                              </td>
                            </>
                          )}
                          <td className="py-1 px-1.5 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap border-2 border-slate-500">
                            ₹{item.lineTotal.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom footer: page subtotal on continuations, grand totals only on the last page. */}
            <div className="pt-2 mt-2 border-t-2 border-slate-800 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                {!isLastPage && (
                  <>
                  <div className="text-xs font-mono tabular-nums font-semibold text-slate-700">
                    <div className="flex justify-between gap-8">
                      <span>Subtotal on this bill:</span>
                      <span>₹{page.pageSubtotal.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                  <div className="ml-auto text-right text-xs font-semibold text-amber-800">
                    Continues on Page {page.pageNumber + 1} of {page.totalPages}
                  </div>
                  </>
                )}

                {isLastPage && (
                  <>
                  <div className="flex-1 text-[11px] text-slate-600 space-y-0.5">
                    <div className="font-semibold text-slate-800 pt-1">
                      Thank you for your business!
                    </div>
                    <div className="text-[10px] text-slate-500">
                      GST included in the above prices.
                    </div>
                  </div>
                  <div className="w-full sm:w-72 space-y-1.5 text-xs font-mono tabular-nums">
                    <div className="flex justify-between text-slate-600">
                      <span>Bill Subtotal:</span>
                      <span>₹{bill.subtotal.toLocaleString('en-IN')}</span>
                    </div>
                    {bill.discountAmount > 0 && (
                      <div className="flex justify-between text-amber-800">
                        <span>Total Discount:</span>
                        <span>-₹{bill.discountAmount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-300">
                      <span>Final Price:</span>
                      <span>₹{bill.netTotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Paid ({bill.paymentMode}):</span>
                      <span>₹{bill.paidAmount.toLocaleString('en-IN')}</span>
                    </div>
                    {bill.dueAmount > 0 && (
                      <div className="flex justify-between text-amber-800 font-bold">
                        <span>Balance Due:</span>
                        <span>₹{bill.dueAmount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-[10px] font-semibold text-slate-700">
                <div className="border-2 border-slate-500 rounded-md h-9 px-2 pt-1">
                  Customer Signature
                </div>
                <div className="border-2 border-slate-500 rounded-md h-9 px-2 pt-1">
                  Biller Signature
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface InvoiceModalProps {
  bill: Bill | null;
  autoPrint?: boolean;
  onClose: () => void;
}

export const PrintableInvoiceModal: React.FC<InvoiceModalProps> = ({
  bill,
  autoPrint = false,
  onClose,
}) => {
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => {
    setPageCount(1);
  }, [bill?.id]);

  useEffect(() => {
    if (!bill || !autoPrint) return;
    const timer = window.setTimeout(() => {
      triggerBrowserPrint(bill.invoiceNumber);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [bill, autoPrint]);

  if (!bill) return null;

  const totalPages = pageCount;

  return (
    <Dialog
      open={Boolean(bill)}
      onClose={onClose}
      title={`Customer Bill · ${bill.invoiceNumber}${
        totalPages > 1 ? ` (${totalPages} Pages)` : ''
      }`}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5 text-slate-900" data-testid="printable-invoice-modal">
        <PrintableBillPages bill={bill} onPageCountChange={setPageCount} />

        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <div className="text-xs text-slate-500">
            {totalPages > 1
              ? `Multi-page A4 PDF bill ready: ${bill.items.length} items across ${totalPages} full A4 pages.`
              : `Full A4 PDF bill ready (${bill.items.length} item${
                  bill.items.length === 1 ? '' : 's'
                }).`}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="amber"
              onClick={() => triggerBrowserPrint(bill.invoiceNumber)}
            >
              <Printer className="w-4 h-4" />
              Print Customer Bill
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

interface DealerOrderPdfModalProps {
  order: DealerOrder | null;
  onClose: () => void;
}

export const DealerOrderPdfModal: React.FC<DealerOrderPdfModalProps> = ({
  order,
  onClose,
}) => {
  if (!order) return null;

  const handleDownloadPrintableFile = () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${order.orderNumber} - ${order.dealerName}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; padding: 32px; }
    h1 { margin: 0 0 4px 0; font-size: 20px; }
    .shop-sub { font-size: 12px; color: #334155; margin-bottom: 14px; }
    .meta { font-size: 13px; color: #334155; margin-bottom: 18px; padding-top: 10px; border-top: 2px solid #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
    th { background: #f1f5f9; }
    .right { text-align: right; font-family: monospace; }
  </style>
</head>
<body>
  <h1>${TAJ_HARVESTER_SHOP_INFO.name} — DEALER ORDER LIST</h1>
  <div class="shop-sub">
    Address: ${TAJ_HARVESTER_SHOP_INFO.address} | Ph: ${TAJ_HARVESTER_SHOP_INFO.phone}
  </div>
  <div class="meta">
    <strong>Dealer Name:</strong> ${order.dealerName}<br/>
    <strong>Order No:</strong> ${order.orderNumber} | <strong>Date:</strong> ${formatDateShortDisplay(order.createdAt)}
    ${order.notes ? `<br/><strong>Note:</strong> ${order.notes}` : ''}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Part Number</th>
        <th>Description</th>
        <th class="right">Count</th>
      </tr>
    </thead>
    <tbody>
      ${order.items
        .map(
          (it, idx) => `<tr>
        <td>${idx + 1}</td>
        <td><strong>${it.partNumber}</strong></td>
        <td>${it.nameModel}</td>
        <td class="right"><strong>${it.orderQty}</strong></td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${order.orderNumber}-${order.dealerName.replace(/\s+/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={Boolean(order)}
      onClose={onClose}
      title={`Dealer Order List · ${order.dealerName}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-slate-900" data-testid="dealer-order-pdf-modal">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-300">
          <div>
            <h3 className="text-lg font-bold text-slate-900 font-display">
              {TAJ_HARVESTER_SHOP_INFO.name} — DEALER ORDER LIST
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Address: {TAJ_HARVESTER_SHOP_INFO.address} · Ph: {TAJ_HARVESTER_SHOP_INFO.phone}
            </p>
            <p className="text-sm font-semibold text-slate-800 mt-1.5">
              Dealer: {order.dealerName}
            </p>
            {order.notes && (
              <p className="text-xs text-slate-500 mt-0.5">Note: {order.notes}</p>
            )}
          </div>
          <div className="text-left sm:text-right font-mono text-xs">
            <div className="font-bold text-slate-900">{order.orderNumber}</div>
            <div className="text-slate-500">
              {formatDateShortDisplay(order.createdAt)}
            </div>
            <div className="font-semibold text-amber-700 mt-0.5">
              {order.totalItemsCount} Parts · {order.totalUnitsQty} Count
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-50 text-slate-600">
                <th className="py-2 px-2.5 font-semibold whitespace-nowrap">#</th>
                <th className="py-2 px-2.5 font-semibold whitespace-nowrap">Part Number</th>
                <th className="py-2 px-2.5 font-semibold">Description</th>
                <th className="py-2 px-2.5 font-semibold text-right whitespace-nowrap">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {order.items.map((item, idx) => (
                <tr key={`${item.partId}-${idx}`}>
                  <td className="py-2 px-2.5 font-mono whitespace-nowrap">{idx + 1}</td>
                  <td className="py-2 px-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                    {item.partNumber}
                  </td>
                  <td className="py-2 px-2.5 text-slate-800 font-medium">{item.nameModel}</td>
                  <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                    {item.orderQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-end gap-3 no-print">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={handleDownloadPrintableFile}>
            <Download className="w-4 h-4" />
            Download Order List
          </Button>
          <Button
            variant="amber"
            onClick={() => triggerBrowserPrint(order.orderNumber)}
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

interface CustomSignInPageProps {
  onLoginSuccess: (username: string, password: string) => Promise<void>;
  onCancelBackToOwnerSession?: () => void;
}

export const CustomSignInPage: React.FC<CustomSignInPageProps> = ({
  onLoginSuccess,
  onCancelBackToOwnerSession,
}) => {
  const [mode, setMode] = useState<'LOGIN' | 'OWNER_FORGOT'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Owner Forgot Password fields
  const [ownerEmail, setOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccessMsg('');
    setLoading(true);
    try {
      await onLoginSuccess(username, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccessMsg('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/owner-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'FORGOT_EMAIL_RESET',
          email: ownerEmail.trim(),
          newPassword: newOwnerPassword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset Owner password.');
      }
      setResetSuccessMsg(
        'Owner password updated. You can now sign in with your new password.'
      );
      setMode('LOGIN');
      setPassword('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4 gap-6"
      data-testid="custom-signin-page"
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-display">
            {mode === 'LOGIN' ? 'Taj Harvester Sign In' : 'Owner Password Recovery'}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            {mode === 'LOGIN'
              ? 'Sign in with your Owner (.env) or Staff credentials.'
              : 'Enter the registered Owner email from .env to reset the Owner password.'}
          </p>
        </div>

        {resetSuccessMsg && (
          <div
            role="status"
            className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{resetSuccessMsg}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700"
          >
            {error}
          </div>
        )}

        {mode === 'LOGIN' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="custom-signin-username"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                User ID *
              </label>
              <Input
                id="custom-signin-username"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter User ID"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="custom-signin-password"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Password *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setMode('OWNER_FORGOT');
                  }}
                  className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
                >
                  Forgot Password? (Owner Only)
                </button>
              </div>
              <Input
                id="custom-signin-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>

            <Button
              type="submit"
              variant="amber"
              size="lg"
              disabled={loading}
              className="w-full"
            >
              <KeyRound className="w-4 h-4" />
              {loading ? 'Signing In...' : 'Sign In'}
            </Button>

            <p className="text-[11px] text-slate-500 text-center pt-1">
              Staff members: If you forgot your login credentials, please ask the Shop Owner.
            </p>
          </form>
        ) : (
          <form onSubmit={handleOwnerForgotSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="owner-reset-email"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Registered Owner Email *
              </label>
              <Input
                id="owner-reset-email"
                type="email"
                required
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="Enter Owner email"
              />
            </div>

            <div>
              <label
                htmlFor="owner-reset-new-password"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                New Owner Password *
              </label>
              <Input
                id="owner-reset-new-password"
                type="password"
                required
                value={newOwnerPassword}
                onChange={(e) => setNewOwnerPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>

            <Button
              type="submit"
              variant="amber"
              size="lg"
              disabled={loading}
              className="w-full"
            >
              <Mail className="w-4 h-4" />
              {loading ? 'Resetting Password...' : 'Reset Owner Password'}
            </Button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setMode('LOGIN');
                }}
                className="text-xs font-semibold text-slate-700 hover:underline cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {onCancelBackToOwnerSession && (
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end text-xs">
            <button
              type="button"
              onClick={onCancelBackToOwnerSession}
              className="font-semibold text-slate-800 hover:underline cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>

      <div className="w-full max-w-md">
        <DeveloperSignatureBox />
      </div>
    </div>
  );
};
