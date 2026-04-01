import { execFile } from 'child_process'
import { promisify } from 'util'
import dns from 'dns'
import path from 'path'

const execFileAsync = promisify(execFile)
const dnsResolve = promisify(dns.resolve4)

const WG_BIN = path.join(process.cwd(), 'wg-on-demand', '.venv', 'bin', 'wg-on-demand')
const AWS_PROFILE = process.env.WG_AWS_PROFILE ?? 'wg-on-demand'

// Hostnames whose traffic should route through the VPN
const TUNNEL_HOSTS = ['booking.flyfrontier.com']

/**
 * Resolve hostnames to IPs and return as WireGuard AllowedIPs string.
 * Each IP gets a /32 mask for precise split tunneling.
 */
async function resolveAllowedIPs(): Promise<string> {
  const ips: string[] = []
  for (const host of TUNNEL_HOSTS) {
    try {
      const resolved = await dnsResolve(host)
      ips.push(...resolved)
    } catch (err) {
      console.warn(`[vpn] Could not resolve ${host}:`, err)
    }
  }
  if (ips.length === 0) {
    console.warn('[vpn] No IPs resolved — falling back to full tunnel')
    return '0.0.0.0/0, ::/0'
  }
  const cidrs = ips.map((ip) => `${ip}/32`).join(', ')
  console.log(`[vpn] Split tunnel AllowedIPs: ${cidrs}`)
  return cidrs
}

/**
 * Spin up a fresh WireGuard VPN via wg-on-demand.
 * Only routes traffic to Frontier booking servers through the tunnel.
 * Returns the session ID on success, or null on failure.
 */
export async function vpnUp(): Promise<string | null> {
  try {
    console.log('[vpn] Starting WireGuard tunnel...')

    const allowedIPs = await resolveAllowedIPs()

    const { stdout, stderr } = await execFileAsync(
      WG_BIN,
      ['up', '--region', 'us-west-2', '--allowed-ips', allowedIPs],
      {
        timeout: 180_000,
        env: { ...process.env, TERM: 'dumb', AWS_PROFILE },
      },
    )
    console.log('[vpn] up stdout:', stdout)
    if (stderr) console.log('[vpn] up stderr:', stderr)

    const sessionMatch = stdout.match(/Session\s+ID:\s+(\S+)/i)
    const sessionId = sessionMatch?.[1] ?? null

    if (sessionId) {
      console.log(`[vpn] Tunnel up, session: ${sessionId}`)
    } else {
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
      env: { ...process.env, TERM: 'dumb', AWS_PROFILE },
    })
    console.log('[vpn] down stdout:', stdout)
    if (stderr) console.log('[vpn] down stderr:', stderr)
    console.log('[vpn] Tunnel down')
  } catch (err) {
    console.error('[vpn] Failed to tear down tunnel:', err)
  }
}
