import { readFile } from 'node:fs/promises'
import path from 'node:path'

export async function GET() {
  const installScript = await readFile(
    path.join(process.cwd(), 'public', 'install.sh'),
    'utf8',
  )

  return new Response(installScript, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
