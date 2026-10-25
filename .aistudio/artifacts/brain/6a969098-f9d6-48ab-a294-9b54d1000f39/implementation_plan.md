# Customer Ledger Sheet, Sales & Dues CSV Exports, and Backup Cleanup

This update introduces an Excel-style **Customer Transaction Ledger** modal (matching your existing Excel workbook layout) when clicking a customer name or action button on the **Pending Customer Dues** page—complete with a per-customer `.csv` download—adds **Sales CSV** and **Dues CSV** exports for disaster recovery, and removes the **Database Collections & Local Setup** instruction box from the Backup page.

### User Review & Critical Decisions

> [!IMPORTANT]
> Please review the confirmed layout and export structure below and click **Proceed** to apply these changes.

- **Confirmed Decision 1 (Excel-Style Customer Ledger Modal & Single-Customer CSV)**: Clicking a customer's name or a **View Transactions** button on the **Pending Customer Dues** page opens a spreadsheet-style ledger matching your Excel layout (`BILL NO | DATE | DUE AMOUNT` on the left, `DATE | RECEIPT VOUCHER NO | PAID AMOUNT` with a `TOTAL` footer in the middle, and the highlighted green balance summary box on the right), plus a **Download Customer Transactions (.csv)** button for that customer.
- **Confirmed Decision 2 (Sales CSV & All Dues CSV Exports)**:
  - On **Sales & Void Log**, the top-right header button will be changed from *Export All Parts CSV* to **Export Sales Data (.csv)**.
  - On **Pending Customer Dues**, a **Download Dues (.csv)** button will be added to the page header.
  - On **5-Set CSV Backup**, quick-export buttons for **Sales Data (.csv)** and **Customer Dues (.csv)** will also be available alongside your Parts CSV backups so all critical shop records (Parts, Sales, and Dues) can be saved if the app goes down.
- **Confirmed Decision 3 (Remove Local Setup Instructions Card)**: The bottom *Database Collections & Local Setup* card (`div:nth-of-type(4)`) on the **5-Set CSV Backup** page will be removed.

---

### 1. Overview & Core Concept

- **What It Does**: Gives the shop owner an exact digital replica of their familiar Excel customer credit ledger for every customer on the Pending Dues page, with instant `.csv` export for individual customers as well as full shop exports for Sales, Pending Dues, and Spare Parts.
- **Target Audience / Persona**: Shop Owner managing farmer/harvester credit accounts, tracking partial payments over time, and keeping offline Excel/CSV backups of all critical business records.
- **Key Value**: Eliminates manual double-entry in Excel while guaranteeing that every customer's bill-by-bill due history, receipt voucher payments, all sales invoices, and all inventory sets can be downloaded as `.csv` files opened directly in Microsoft Excel.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Inspecting a Customer's Excel-Style Transaction Ledger**:
     - On **Pending Customer Dues**, each customer row features a clickable customer name and a **View Transactions** button next to **Record Payment**.
     - Clicking either opens the **Customer Transaction Sheet** modal displaying the customer's name, phone number, and village in the title bar alongside a **Download Customer CSV** button.
     - Inside the modal, a multi-column spreadsheet grid mirrors your existing Excel sheet:
       - **Left Columns (`BILL NO`, `DATE`, `DUE AMOUNT`)**: Every credit bill for this customer with formatted `DD.MM.YYYY` dates, original bill due amount, and a bottom `TOTAL` row.
       - **Middle Columns (`DATE`, `RECEIPT VOUCHER NO`, `PAID AMOUNT`)**: Every subsequent payment received against the customer's due balance, showing the date, receipt voucher number / payment mode (`CASH` or `UPI`), amount paid, and a bottom `TOTAL` row.
       - **Right Green Summary Box**: High-contrast green summary box displaying the customer's net balance / total amount summary at a glance.
  2. **Downloading Individual or Full Shop CSV Backups**:
     - Clicking **Download Customer CSV** inside the customer ledger modal downloads `{CustomerName}-{Phone}-Transactions.csv` formatted in the exact side-by-side Excel column layout (`BILL NO,DATE,DUE AMOUNT,,DATE,RECEIPT VOUCHER NO,PAID AMOUNT,,TOTAL AMOUNT PAID`).
     - Clicking **Download Dues CSV** in the **Pending Customer Dues** header downloads all customer credit accounts and payment histories.
     - Clicking **Export Sales Data CSV** in the **Sales & Void Log** header downloads all invoices, customer details, discounts, paid amounts, due balances, and statuses.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Utilitarian ERP & spreadsheet precision—crisp borders, high-contrast tabular numerals, and familiar Excel-grid structure inside the customer ledger modal.
  - *Color Palette & Mood*: Clean white (`#FFFFFF`) and slate (`#F8FAFC`) surfaces, dark slate (`#0F172A`) headers, amber (`#D97706`) action highlights, and the signature emerald-green (`#16A34A`) summary block from your Excel workbook.
  - *Typography & Hierarchy*: `Plus Jakarta Sans` for headers, `Public Sans` for labels, and `JetBrains Mono` (`tabular-nums`) for all invoice numbers, dates, and rupee amounts.
- **Interactive Feedback & Motion**: Instant modal transitions, immediate `.csv` file downloads with UTF-8 BOM support so rupee symbols and columns open cleanly in Microsoft Excel.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Side-by-Side Excel Grid Layout in Modal & CSV Export**
  - *Chosen Approach*: Format both the on-screen Customer Transaction modal and its `.csv` export using the exact 3-zone spreadsheet structure shown in your photo (`BILL NO | DATE | DUE AMOUNT` + spacer column + `DATE | RECEIPT VOUCHER NO | PAID AMOUNT` + summary block).
  - *Why*: Matches your existing Microsoft Excel workflow so downloaded `.csv` files look identical when opened in Excel.
- **Decision 2: Dedicated Sales & Dues CSV Generators**
  - *Chosen Approach*: Replace the redundant Parts export button on the Sales page with a dedicated Sales CSV export, add a Dues CSV export on the Pending Dues page, and surface both on the Backup page while removing the Local Setup Instructions card.
  - *Why*: Ensures every module exports its own domain data and provides complete offline disaster recovery for Parts, Sales, and Customer Dues.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Taj Harvester Application State                      │
│          (Parts [5 Sets]  ·  Bills [Sales]  ·  Pending Dues)             │
└───────────────┬──────────────────────────────────────────┬───────────────┘
                │                                          │
                ▼                                          ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────┐
│      Pending Customer Dues View       │  │   Sales & CSV Backup Views    │
│  ┌─────────────────────────────────┐  │  │  ┌─────────────────────────┐  │
│  │ Header: Download Dues CSV       │  │  │  │ Sales Header:           │  │
│  └─────────────────────────────────┘  │  │  │ Export Sales Data CSV   │  │
│  ┌─────────────────────────────────┐  │  │  └─────────────────────────┘  │
│  │ Customer Card:                  │  │  │  ┌─────────────────────────┐  │
│  │ - Click Name / View Transactions│──┼─┐│  │ Backup View:            │  │
│  │ - Record Payment (Cash / UPI)   │  │ ││  │ - 5 Parts Set CSVs      │  │
│  └─────────────────────────────────┘  │ ││  │ - Sales & Dues CSVs     │  │
└───────────────────────────────────────┘ ││  │ - (Local Setup Removed) │  │
                                          ││  └─────────────────────────┘  │
                                          │└───────────────────────────────┘
                                          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│           Excel-Style Customer Transaction Ledger Modal                  │
│  ┌────────────────────────┬───────────────────────────┬───────────────┐  │
│  │ BILL NO | DATE | DUE   │ DATE | RECEIPT NO | PAID  │ GREEN SUMMARY │  │
│  │ T-1001  | ...  | ₹780  │ ...  | RV-01/CASH | ₹300  │      780      │  │
│  │ TOTAL          | ₹780  │ TOTAL             | ₹300  │ (Net Balance) │  │
│  └────────────────────────┴───────────────────────────┴───────────────┘  │
│  [ Download This Customer's Transactions (.csv) ]                        │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - Cross-references each `PendingDue` record (`invoiceNumbers`, `payments`, `totalBilled`, `totalPaid`, `balanceDue`) with matching `Bill` records in `state.bills` so each invoice's exact bill date and initial due amount are populated in the left `BILL NO | DATE | DUE AMOUNT` table.
- **Interactive Component & State Mapping**:
  - Clicking a customer name or **View Transactions** sets `inspectedCustomerDue`, opening the Excel-style ledger dialog.
  - Clicking **Download Customer CSV** generates and downloads a UTF-8 BOM `.csv` file with side-by-side columns matching the Excel sheet.
  - Clicking **Export Sales Data CSV** or **Download Dues CSV** generates and downloads complete `.csv` snapshots of `state.bills` and `state.dues`.
