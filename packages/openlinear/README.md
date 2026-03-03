<div align="center">

# ⚡ OpenLinear

**The official CLI, launcher, and validation utility for OpenLinear.**

[![npm version](https://img.shields.io/npm/v/openlinear.svg?style=flat-square)](https://www.npmjs.com/package/openlinear)
[![npm downloads](https://img.shields.io/npm/dm/openlinear.svg?style=flat-square)](https://www.npmjs.com/package/openlinear)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-blue.svg?style=flat-square)](https://www.typescriptlang.org/)

[Website](https://openlinear.com) • [Documentation](https://github.com/kaizen403/openlinear) • [Twitter](https://twitter.com/openlinear)

</div>

---

## 📖 What is OpenLinear?

[OpenLinear](https://github.com/kaizen403/openlinear) is an AI-powered project management platform that actually writes the code. You manage tasks on a kanban board, and when ready, an AI coding agent clones your repository, creates a branch, implements the feature, and opens a pull request.

**This package (`openlinear`)** is the core NPM library and CLI tool that powers the local integration. It provides:
1. **The CLI Launcher** for managing local AI agent executions.
2. **Programmatic APIs** for safely validating and sanitizing execution metadata.
3. **Security Boundaries** to ensure sensitive credentials or code never leak to the cloud dashboard.

## ✨ Features

- 🚀 **Zero-config CLI** to start your OpenLinear environment.
- 🛡️ **Strict Payload Validation** powered by Zod to enforce trust boundaries between local execution and cloud sync.
- 🧩 **Modular Exports** for types, validation logic, and configuration.
- 🔒 **Privacy-First Design** ensuring local-only data stays local.
- 💻 **First-class TypeScript Support** with comprehensive type definitions.

---

## 📦 Installation

You can install the package globally to use the CLI, or locally in your project to use the API.

### Global (CLI)
```bash
npm install -g openlinear
# or
pnpm add -g openlinear
# or
yarn global add openlinear
```

### Local (API)
```bash
npm install openlinear
```

---

## 🚀 Usage

### CLI Launcher

Once installed globally, you can spin up the OpenLinear worker directly from your terminal:

```bash
openlinear [options]
```
*(Run `openlinear --help` for available commands and options)*

### Programmatic API

The package provides a robust API for managing execution metadata, validating payloads, and handling feature flags.

```typescript
import { 
  validateExecutionMetadataSync,
  safeValidateExecutionMetadataSync,
  isLocalExecutionEnabled,
  parseFeatureFlags 
} from 'openlinear';

// 1. Safely validate execution metadata before syncing to the cloud
const result = safeValidateExecutionMetadataSync({
  taskId: 'tsk_123',
  runId: 'run_456',
  status: 'completed',
  durationMs: 45000,
  branch: 'feature/add-login'
});

if (result.success) {
  console.log('Valid metadata ready for sync:', result.data);
} else {
  console.error('Validation failed:', result.error);
}

// 2. Check current configuration flags
const flags = parseFeatureFlags();
const isLocal = isLocalExecutionEnabled('user-123', flags);
console.log(`Local execution enabled: ${isLocal}`);
```

---

## 🧰 API Reference

We provide deep imports to keep your bundles small and your dependencies clean:

### Main (`openlinear`)
Core validation and configuration utilities.
- `validateExecutionMetadataSync(payload)` - Validates and returns the payload, throws if invalid.
- `safeValidateExecutionMetadataSync(payload)` - Safe validation that returns `{ success, data, error }`.
- `sanitizePayload(payload)` - Strips all forbidden fields from the payload.
- `parseFeatureFlags()` - Parses feature flags from the environment.
- `isLocalExecutionEnabled(userId, flags)` - Checks if local execution is enabled for a given user.

### Types (`openlinear/types`)
Complete TypeScript definitions.
- `ExecutionMetadataSync` - Standardized type for synced metadata.
- `ExecutionStatus` - Enum for execution states (`pending`, `in_progress`, `completed`, `failed`).
- `ErrorCategory` - Enum for standardized error categorization.

### Validation (`openlinear/validation`)
Direct access to validation utilities.
- `checkExecutionMetadataSync(payload)`
- `isForbiddenField(fieldName)`
- `FORBIDDEN_SYNC_FIELDS` - Array of fields blocked from cloud sync (e.g., `accessToken`, `prompt`, `logs`).

### Configuration (`openlinear/config`)
Direct access to configuration utilities.
- `getFeatureFlags()`
- `validateFlagConfiguration(config)`
- `getMigrationPhase()`

---

## 🔒 Security & Trust Boundaries

Security is built into the core of this package. We enforce a strict **trust-boundary policy** to guarantee that sensitive data never leaves your local machine.

- ✅ **Cloud-Allowed**: Safe metadata like `taskId`, `status`, `durationMs`, `progress`, `branch`, `prUrl`.
- ⚠️ **Local-Only**: Credentials and paths like `accessToken`, `apiKey`, `repoPath`.
- ❌ **Forbidden**: Raw inputs and outputs like `prompt`, `logs`, `toolLogs`, `executionLogs`.

When using `sanitizePayload` or `safeValidateExecutionMetadataSync`, any forbidden fields are automatically stripped or flagged.

---

## 🤝 Contributing

We welcome contributions! If you'd like to help improve the OpenLinear CLI or core utilities:

1. Fork the [main repository](https://github.com/kaizen403/openlinear).
2. Navigate to `packages/openlinear`.
3. Make your changes and run `pnpm build` and `pnpm test`.
4. Submit a Pull Request!

## 📄 License

This project is licensed under the [MIT License](LICENSE).
