# @hrms/contracts

Generated TypeScript types from the API's OpenAPI schema.

## Regenerate

From the repo root:

```bash
make contracts
```

This runs `drf-spectacular` against the Django app to dump `openapi.yaml`, then runs `openapi-typescript` to produce `generated.ts`.

Both files are committed to this repo. CI fails if regenerating produces a diff (use `make contracts` and commit the result).
