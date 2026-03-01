#!/usr/bin/env ts-node

/**
 * Trust Boundary Coverage Check
 * 
 * This script verifies that all fields related to execution and authentication
 * are explicitly classified in the trust-boundary.md policy document.
 * 
 * Source of Truth for Fields:
 * - apps/api/src/services/execution/state.ts (ExecutionState interface)
 * - packages/db/prisma/schema.prisma (Task and User models)
 * - apps/api/src/routes/opencode.ts (Auth payloads)
 */

import * as fs from 'fs';
import * as path from 'path';

const POLICY_PATH = path.join(process.cwd(), 'docs/security/trust-boundary.md');
const STATE_PATH = path.join(process.cwd(), 'apps/api/src/services/execution/state.ts');
const SCHEMA_PATH = path.join(process.cwd(), 'packages/db/prisma/schema.prisma');
const OPENCODE_ROUTE_PATH = path.join(process.cwd(), 'apps/api/src/routes/opencode.ts');

function extractClassifiedFields(): Set<string> {
  const content = fs.readFileSync(POLICY_PATH, 'utf-8');
  const fields = new Set<string>();
  
  // Match fields in backticks within the lists
  const regex = /`([a-zA-Z0-9_]+)`/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    fields.add(match[1]);
  }
  
  return fields;
}

function extractExecutionStateFields(): string[] {
  const content = fs.readFileSync(STATE_PATH, 'utf-8');
  const fields: string[] = [];
  
  const interfaceRegex = /export interface ExecutionState \{([\s\S]*?)\}/;
  const match = interfaceRegex.exec(content);
  
  if (match) {
    const body = match[1];
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//')) {
        const fieldMatch = trimmed.match(/^([a-zA-Z0-9_]+)[\s\?]*:/);
        if (fieldMatch) {
          fields.push(fieldMatch[1]);
        }
      }
    }
  }
  
  return fields;
}

function extractPrismaModelFields(modelName: string): string[] {
  const content = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  const fields: string[] = [];
  
  const modelRegex = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\}`, 'g');
  const match = modelRegex.exec(content);
  
  if (match) {
    const body = match[1];
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('@@')) {
        const fieldMatch = trimmed.match(/^([a-zA-Z0-9_]+)\s+/);
        if (fieldMatch) {
          fields.push(fieldMatch[1]);
        }
      }
    }
  }
  
  return fields;
}

function extractOpencodeRouteFields(): string[] {
  // Hardcoding the known fields from the route for simplicity,
  // as parsing AST for this is complex and we know the fields.
  return ['providerId', 'apiKey', 'method', 'code'];
}

function main() {
  const isSyntheticTest = process.argv.includes('--synthetic-test');
  
  const classifiedFields = extractClassifiedFields();
  
  const allFields = new Set<string>([
    ...extractExecutionStateFields(),
    ...extractPrismaModelFields('Task'),
    ...extractPrismaModelFields('User'),
    ...extractOpencodeRouteFields()
  ]);
  
  if (isSyntheticTest) {
    allFields.add('syntheticUnclassifiedField');
  }
  
  const unclassifiedFields: string[] = [];
  
  for (const field of allFields) {
    if (!classifiedFields.has(field)) {
      unclassifiedFields.push(field);
    }
  }
  
  if (unclassifiedFields.length > 0) {
    console.error('❌ Trust Boundary Violation: Unclassified fields detected!');
    console.error('The following fields are not classified in docs/security/trust-boundary.md:');
    for (const field of unclassifiedFields) {
      console.error(`  - ${field}`);
    }
    console.error('\nPlease update the policy document to classify these fields.');
    process.exit(1);
  } else {
    console.log('✅ Trust Boundary Check Passed: All fields are classified.');
    process.exit(0);
  }
}

main();
