# Canvas Engine

Read README.md and docs/README.md first. This repository contains only the reusable engine, examples, synthetic fixtures, tests, and documentation.

- Keep core independent of DOM, React, Electron, model services, credentials, and filesystem APIs.
- Read the affected module README; preserve the documented public API and scene compatibility.
- Validate with npm run check:boundaries, npm run build, npm test, and npm run test:e2e when behavior changes.
- Update CHANGELOG.md and integration/API/platform documentation when relevant.
- Never claim a platform or performance level without corresponding evidence.
- Do not commit secrets, personal projects, user profiles, signed apps, or private assets.
- Do not commit, push, publish, or change the license without explicit user authorization.
