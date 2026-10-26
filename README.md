# Taj Harvester

Inventory, POS billing, dealer orders, pending dues, and Excel backup management
for Taj Harvester spare parts.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` with the required production variables:

   - `MONGODB_URI`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `OWNER_USER_ID`
   - `OWNER_PASSWORD`
   - `OWNER_EMAIL`
   - `OWNER_CLERK_USER_ID`

3. Start the development server:

   ```bash
   npm run dev
   ```

## Validation

```bash
npm run lint
npm test
npm run build
```
