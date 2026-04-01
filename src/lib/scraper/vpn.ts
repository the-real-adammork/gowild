import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

const WG_BIN = path.join(process.cwd(), 'wg-on-demand', '.venv', 'bin', 'wg-on-demand')

/**
 * Spin up a fresh WireGuard VPN via wg-on-demand.
 * Returns the session ID on success, or null on failure.
 */
export async function vpnUp(): Promise<string | null> {
  try {
    console.log('[vpn] Starting WireGuard tunnel...')
    // wg-on-demand internally calls `sudo wg-quick up`, so run it directly (not via sudo)
    const { stdout, stderr } = await execFileAsync(WG_BIN, ['up', '--region', 'us-west-2'], {
      timeout: 180_000, // 3 min for EC2 boot + WG setup
      env: { ...process.env, TERM: 'dumb' }, // disable rich formatting for easier parsing
    })
    console.log('[vpn] up stdout:', stdout)
    if (stderr) console.log('[vpn] up stderr:', stderr)

    // Output contains "Session ID:  <hex>" (with rich formatting stripped)
    const sessionMatch = stdout.match(/Session\s+ID:\s+(\S+)/i)
    const sessionId = sessionMatch?.[1] ?? null

    if (sessionId) {
      console.log(`[vpn] Tunnel up, session: ${sessionId}`)
    } else {
      // Try to get it from the list command
      console.log('[vpn] Could not parse session ID from output, checking list...')
      try {
        const { stdout: listOut } = await execFileAsync(WG_BIN, ['list'], { timeout: 10_000 })
        console.log('[vpn] list output:', listOut)
        const listMatch = listOut.match(/([0-9a-f]{12})/i)
        return listMatch?.[1] ?? 'unknown'
      } catch {
        return 'unknown'
      }
    }

    return sessionId
  } catch (err) {
    console.error('[vpn] Failed to start tunnel:', err)
    return null
  }
}

/**
 * Tear down the WireGuard VPN and destroy the EC2 instance.
 */
export async function vpnDown(sessionId?: string | null): Promise<void> {
  try {
    console.log('[vpn] Tearing down tunnel...')
    const args = ['down']
    if (sessionId && sessionId !== 'unknown') args.push(sessionId)

    const { stdout, stderr } = await execFileAsync(WG_BIN, args, {
      timeout: 60_000,
      env: { ...process.env, TERM: 'dumb' },
    })
    console.log('[vpn] down stdout:', stdout)
    if (stderr) console.log('[vpn] down stderr:', stderr)
    console.log('[vpn] Tunnel down')
  } catch (err) {
    console.error('[vpn] Failed to tear down tunnel:', err)
  }
}
