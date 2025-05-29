# Zipcode API

A Cloudflare Worker-based API for ZIP code lookup, reverse geocoding, and bulk ZIP code data management.

## Features

- Lookup ZIP code details by code
- Reverse geocode latitude/longitude to nearest ZIP code
- Populate KV storage from CSV
- List all ZIP codes or fetch all keys
- Bulk export ZIP code data

## Endpoints

### `GET /zipcode/:zip`

Returns details for a given 5-digit ZIP code.

### `GET /reverse/:lat/:long`

Returns the nearest ZIP code and city for given latitude and longitude.

### `POST /populate`

Populates the KV store with ZIP code data from `public/zip_code_database.csv`.

### `GET /bulk`

Returns all ZIP code records in a bulk format.

### `GET /list`

Returns a list of all ZIP codes with latitude and longitude.

### `GET /all`

Returns all ZIP code keys in the KV store (excluding master/list).

### `GET /master`

Returns the full master list of ZIP code data.

## Setup

1. **Install dependencies:**

   ```sh
   pnpm install
   ```

2. **Development:**

   ```sh
   pnpm run dev
   ```

3. **Deploy:**

   ```sh
   pnpm run deploy
   ```

4. **Environment:**
   - Ensure `public/zip_code_database.csv` exists.
   - Configure Cloudflare KV and assets in `wrangler.jsonc`.

## Environment Variables

- `ZIPCODE`: KV namespace for ZIP code data
- `ASSETS`: Binding for static assets (CSV file)
- `RADIUS`: Search radius for reverse geocoding (in meters)

## License

MIT
