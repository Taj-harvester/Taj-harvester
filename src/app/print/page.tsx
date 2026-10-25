"use client";

import React, { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';

const PRINT_STORAGE_KEY = 'taj_harvester_active_print_job_v2';

export default function DedicatedPrintPage() {
  const [printHtml, setPrintHtml] = useState<string>('');
  const [docTitle, setDocTitle] = useState<string>('Invoice');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlTitle = params.get('title') || '';
      const raw = window.localStorage.getItem(PRINT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { title?: string; html?: string };
        const resolvedTitle = parsed.title || urlTitle || 'Taj Harvester — Invoice';
        setDocTitle(resolvedTitle);
        document.title = resolvedTitle;
        if (parsed.html) {
          setPrintHtml(parsed.html);
        }
      } else if (urlTitle) {
        setDocTitle(urlTitle);
        document.title = urlTitle;
      }
    } catch {
      // Ignore storage parse error
    }
  }, []);

  useEffect(() => {
    if (!printHtml) return;
    const runPrint = () => {
      window.setTimeout(() => {
        window.focus();
        window.print();
      }, 140);
    };

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(runPrint).catch(runPrint);
    } else {
      runPrint();
    }

    const handleAfterPrint = () => {
      try {
        window.localStorage.removeItem(PRINT_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [printHtml]);

  return (
    <div className="min-h-screen bg-white text-black print:bg-white">
      <div className="no-print sticky top-0 z-20 bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between text-xs">
        <span className="font-semibold">{docTitle} · A4 Portrait Print Preview</span>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          Print Now (A4)
        </button>
      </div>

      <div
        className="print-only-root block w-full max-w-[210mm] mx-auto bg-white"
        dangerouslySetInnerHTML={{ __html: printHtml }}
      />
    </div>
  );
}
