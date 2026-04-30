import { execFile, ExecFileOptions } from 'child_process';
import { promisify } from 'util';

/**
 * Promisified execFile that returns { stdout, stderr } as strings.
 *
 * SECURITY: This is the ONLY safe way to run subprocesses with untrusted
 * arguments (branch names, paths, commit messages, etc.). NEVER use `exec`
 * with template literals — that invokes /bin/sh and is vulnerable to shell
 * injection (RCE).
 *
 * Usage:
 *   await execFileAsync('git', ['-C', repoPath, 'checkout', '-b', branchName]);
 *
 * Each element of the args array is passed verbatim as a single argv entry,
 * so shell metacharacters (`;`, `&&`, `|`, `$()`, backticks, etc.) inside
 * untrusted strings are treated as literal characters, not parsed by a shell.
 */
const execFileAsyncRaw = promisify(execFile);

export type ExecFileResult = {
  stdout: string;
  stderr: string;
};

export async function execFileAsync(
  file: string,
  args: ReadonlyArray<string>,
  options: ExecFileOptions = {}
): Promise<ExecFileResult> {
  const { stdout, stderr } = await execFileAsyncRaw(file, args as string[], {
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });
  return {
    stdout: typeof stdout === 'string' ? stdout : stdout.toString('utf8'),
    stderr: typeof stderr === 'string' ? stderr : stderr.toString('utf8'),
  };
}
