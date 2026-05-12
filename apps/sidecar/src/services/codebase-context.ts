import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, existsSync } from 'fs';
import { promises as fsp } from 'fs';

const execFileAsync = promisify(execFile);

export interface CodebaseContext {
  files: { path: string; snippet: string }[];
  totalTokenEstimate: number;
}

const STOPWORDS = new Set([
  'a', 'the', 'to', 'and', 'or', 'is', 'are', 'in', 'on', 'for', 'with',
  'this', 'that', 'it', 'of', 'an', 'as', 'at', 'by', 'be', 'do', 'from',
  'has', 'have', 'was', 'we', 'will', 'can', 'not', 'but', 'all', 'our',
  'your', 'my', 'get', 'set', 'use', 'add', 'new', 'should', 'would',
  'could', 'make', 'want', 'need', 'like', 'also', 'just',
]);

const INCLUDE_FLAGS = [
  '--include=*.ts',
  '--include=*.tsx',
  '--include=*.js',
  '--include=*.jsx',
  '--include=*.py',
  '--include=*.go',
  '--include=*.rs',
  '--include=*.prisma',
  '--include=*.graphql',
  '--include=*.sql',
];

const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
const EXCLUDE_FLAGS = EXCLUDE_DIRS.map((d) => `--exclude-dir=${d}`);

function extractKeywords(goal: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const tokens = goal.toLowerCase().split(/[^a-zA-Z0-9_]+/);
  for (const tok of tokens) {
    if (tok.length < 3) continue;
    if (STOPWORDS.has(tok)) continue;
    if (seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

async function grepKeyword(keyword: string, repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'grep',
      ['-ril', ...EXCLUDE_FLAGS, ...INCLUDE_FLAGS, keyword, repoPath],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    // grep returns exit code 1 when no matches found
    return [];
  }
}

function readSnippet(filePath: string, maxLines: number): string | null {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n').slice(0, maxLines);
    return lines.join('\n');
  } catch {
    return null;
  }
}

export async function gatherCodebaseContext(
  repoPath: string,
  goal: string,
  opts: { maxFiles: number; maxLinesPerFile: number },
): Promise<CodebaseContext> {
  if (!repoPath) {
    return { files: [], totalTokenEstimate: 0 };
  }

  try {
    if (!existsSync(repoPath)) {
      return { files: [], totalTokenEstimate: 0 };
    }
    const stat = await fsp.stat(repoPath);
    if (!stat.isDirectory()) {
      return { files: [], totalTokenEstimate: 0 };
    }
  } catch {
    return { files: [], totalTokenEstimate: 0 };
  }

  const keywords = extractKeywords(goal);
  if (keywords.length === 0) {
    return { files: [], totalTokenEstimate: 0 };
  }

  const hits = new Map<string, number>();
  for (const kw of keywords) {
    const matches = await grepKeyword(kw, repoPath);
    for (const m of matches) {
      hits.set(m, (hits.get(m) || 0) + 1);
    }
  }

  const ranked = Array.from(hits.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.maxFiles)
    .map(([path]) => path);

  const files: { path: string; snippet: string }[] = [];
  let totalChars = 0;
  for (const filePath of ranked) {
    const snippet = readSnippet(filePath, opts.maxLinesPerFile);
    if (snippet == null) continue;
    const relPath = filePath.startsWith(repoPath)
      ? filePath.slice(repoPath.length).replace(/^\/+/, '')
      : filePath;
    files.push({ path: relPath, snippet });
    totalChars += snippet.length + relPath.length;
  }

  return { files, totalTokenEstimate: Math.ceil(totalChars / 4) };
}
