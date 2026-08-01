# TODO: Add Swagger UI to TAMYOKIY Backend

## Steps
- [x] 1. Analyze API surface (all route files cataloged - 200+ endpoints)
- [x] 2. Create plan & get user approval
- [x] 3. Install `swagger-ui-express` dependency
- [x] 4. Rewrite `swagger.json` with comprehensive OpenAPI 3.0 spec (main endpoint groups, ~120 paths)
- [x] 5. Wire Swagger UI into `server.js` at `/api-docs` + raw spec at `/api-docs.json`
- [ ] 6. Test: start server, verify `/api-docs` loads and `/api-docs.json` is valid
- [ ] 7. Verify security schemes (JWT Bearer + API Key) work with Authorize button

## Fix: Restore truncated `server.js` (needed before testing)
- [ ] 6a. Restore missing tail in `server.js` (routes mounting, eco-options, webhooks, health check, 404/error handler, `app.listen`, `mongoose.connect`)
- [ ] 6b. Add Swagger UI log line inside `app.listen` callback
- [ ] 6c. Validate syntax with `node --check server.js`
- [ ] 6d. Start server & verify `/api-docs` returns Swagger UI HTML
- [ ] 6e. Verify `/api-docs.json` returns valid OpenAPI JSON
- [ ] 6f. Verify `/api/health` returns OK
- [ ] 6g. Stop server & update TODO.md

## Test Results
- (pending)

