# IKEAFY

A tiny IKEA-style flat-pack furniture store, built as a full-stack
[Next.js](https://nextjs.org) (App Router) demo with TypeScript, Tailwind CSS,
and a SQLite database.

## Features

- Browse a catalog of furniture products (`/`)
- Add items to a cart and check out
- Orders are persisted to a local SQLite database (`data/ikeafy.db`)
- View placed orders (`/orders`)

## Tech stack

- **Next.js 15** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **better-sqlite3** for persistence
- **ESLint** (`next/core-web-vitals`)

## Getting started

Requirements: Node.js 22+.

```bash
npm ci            # install dependencies
npm run dev       # start the dev server on http://localhost:3000
```

Then open [http://localhost:3000](http://localhost:3000).

## Available scripts

| Command            | Description                                  |
| ------------------ | -------------------------------------------- |
| `npm run dev`      | Start the development server (port 3000)     |
| `npm run build`    | Create a production build                    |
| `npm run start`    | Serve the production build                   |
| `npm run lint`     | Run ESLint                                   |
| `npm run typecheck`| Type-check with the TypeScript compiler      |

## API

| Method | Route           | Description                          |
| ------ | --------------- | ------------------------------------ |
| `GET`  | `/api/products` | List available products             |
| `GET`  | `/api/orders`   | List placed orders                  |
| `POST` | `/api/orders`   | Create an order from cart items     |

Example checkout request:

```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Ada","items":[{"id":"bjorko-table","quantity":2}]}'
```

## Project layout

```
src/
  app/
    layout.tsx           # shared header/nav layout
    page.tsx             # shop + cart + checkout (client component)
    orders/page.tsx      # orders list (server component)
    api/
      products/route.ts  # GET products
      orders/route.ts    # GET/POST orders
  lib/
    products.ts          # product catalog
    db.ts                # SQLite access layer
```

## Cloud Agent environment

`.cursor/environment.json` configures the Cursor Cloud Agent environment:
`npm ci` installs dependencies and a `dev` terminal runs `npm run dev`.
