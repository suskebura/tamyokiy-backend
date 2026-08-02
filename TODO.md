# TODO: Add Swagger UI to TAMYOKIY Backend

## Steps
- [x] 1. Analyze API surface (all route files cataloged - 200+ endpoints)
- [x] 2. Create plan & get user approval
- [x] 3. Install `swagger-ui-express` dependency
- [x] 4. Rewrite `swagger.json` with comprehensive OpenAPI 3.0 spec (main endpoint groups, ~120 paths)
- [x] 5. Wire Swagger UI into `server.js` at `/api-docs` + raw spec at `/api-docs.json`
- [x] 6. Test: start server, verify `/api-docs` loads and `/api-docs.json` is valid
- [x] 7. Verify security schemes (JWT Bearer + API Key) work with Authorize button

## Fix: Restore truncated `server.js` (needed before testing)
- [x] 6a. Add missing `swaggerUi` and `swaggerDocument` requires in `server.js`
- [x] 6b. Add Swagger UI log line inside `app.listen` callback
- [x] 6c. Remove duplicate `/api/insurance` route mount
- [x] 6d. Validate syntax with `node --check server.js`
- [x] 6e. Validate `swagger.json` parses & count paths/schemas
- [x] 6f. Start server & verify `/api-docs` returns Swagger UI HTML
- [x] 6g. Verify `/api-docs.json` returns valid OpenAPI JSON
- [x] 6h. Verify `/api/health` returns OK
- [x] 6i. Stop server & update TODO.md

## Test Results

### Server startup
- ✅ Server starts without crashing (Swagger requires now present)
- ✅ Models loaded: 31
- ✅ `RefundRequest` model created dynamically
- ⚠️ Pre-existing: `/api/tracking` route failed to load due to `canvas` native module missing (`../build/Release/canvas.node`) - unrelated to Swagger work

### Endpoint verification
| Endpoint | HTTP Status | Content-Type | Size |
|---|---|---|---|
| `/api/health` | 200 | application/json | 146 bytes |
| `/api-docs.json` | 200 | application/json | 187,350 bytes |
| `/api-docs/` | 200 | text/html | 3,073 bytes (Swagger UI) |

### Swagger spec
- ✅ `openapi: 3.0.0`
- ✅ 301 paths documented
- ✅ 23 component schemas
- ✅ Security schemes: `bearerAuth` (JWT Bearer), `ApiKeyAuth` (x-api-key header)
- ✅ Swagger UI custom title: "TAMYOKIY Logistics API Documentation"
- ✅ Raw spec served at `/api-docs.json`

### Generated via script
- `generate-swagger.js` programmatically builds the spec (301 paths) → `swagger.json` (391 KB)

### Notes
- `/api/tracking` canvas error is pre-existing and unrelated to Swagger (native `canvas` build missing). If tracking endpoints are needed, reinstall `canvas` (`npm rebuild canvas`) or ensure native build tooling is present.

