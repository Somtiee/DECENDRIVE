# DecenDrive

Privacy-first decentralized cloud storage on Sui Mainnet with one-click Web2 UX.

## Tech Stack

- Next.js 15 + React 19 + TypeScript (strict)
- Sui Mainnet + `@mysten/dapp-kit` + `@mysten/sui`
- Walrus (decentralized blob storage)
- Seal (client-side encryption)
- Tatum RPC/Data access layer
- Cetus Aggregator (auto SUI -> WAL conversion under the hood)
- TanStack Query + Tailwind + shadcn/ui

## Local Run

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env`:

   ```env
   TATUM_API_KEY=your_tatum_key
   TREASURY_ADDRESS=0x...
   NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID=0x... # optional until contract deployed
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard)

## Build

```bash
npm run build
npm run dev
```

## One-Click Vercel Deploy

1. Push this repo to GitHub.
2. Import into Vercel.
3. Add environment variables:
   - `TATUM_API_KEY`
   - `TREASURY_ADDRESS`
   - `NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID`
4. Deploy.

## 2-Minute Hackathon Demo Script

1. **Intro (0:00-0:15)**  
   "DecenDrive is Google Drive UX with decentralized privacy and programmable access."
2. **Wallet + Upload (0:15-0:45)**  
   Connect wallet, drag file, upload with one click. Mention: "Users only hold SUI."
3. **On-chain proof (0:45-1:05)**  
   Show uploaded file instantly in My Drive. Open blob link + tx digest.
4. **Programmable sharing (1:05-1:30)**  
   Share internally to wallet with timed access, then revoke.
5. **Social sharing (1:30-1:45)**  
   Copy/share public view link to X/WhatsApp/LinkedIn/Email.
6. **Access control flow (1:45-2:00)**  
   Revoke access and show wallet-based controls are fully decentralized.

## Notes

- Files are encrypted client-side before Walrus upload.
- Mainnet-only architecture, production-oriented retries, and user-friendly errors.
- Access model is programmable via Move contract.
