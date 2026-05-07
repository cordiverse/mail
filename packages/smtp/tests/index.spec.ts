import { Context } from 'cordis'
import { simpleParser } from 'mailparser'
import { SMTPServer } from 'smtp-server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SmtpMailService from '../src'

function sleep(ms = 0) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

interface ReceivedMail {
  from: string
  to: string
  subject: string
  html: string
}

async function startMockSmtp(opts: { requireAuth?: boolean } = {}) {
  const state = { authSeen: null as null | { user: string; pass: string } }
  let resolveReceived!: (v: ReceivedMail) => void
  let rejectReceived!: (e: unknown) => void
  const received = new Promise<ReceivedMail>((res, rej) => {
    resolveReceived = res
    rejectReceived = rej
  })

  const server = new SMTPServer({
    authOptional: !opts.requireAuth,
    disabledCommands: ['STARTTLS'],
    logger: false,
    onAuth(auth, _session, cb) {
      state.authSeen = { user: auth.username!, pass: auth.password! }
      cb(null, { user: 'ok' })
    },
    onData(stream, _session, cb) {
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', async () => {
        try {
          const parsed = await simpleParser(Buffer.concat(chunks))
          resolveReceived({
            from: (parsed.from as any)?.text ?? '',
            to: Array.isArray(parsed.to)
              ? (parsed.to[0] as any)?.text ?? ''
              : (parsed.to as any)?.text ?? '',
            subject: parsed.subject ?? '',
            html: typeof parsed.html === 'string' ? parsed.html : '',
          })
          cb()
        } catch (e) {
          rejectReceived(e)
          cb(e as Error)
        }
      })
      stream.on('error', rejectReceived)
    },
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.server.address() as { port: number }).port

  return {
    port,
    received,
    get authSeen() { return state.authSeen },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe('@cordisjs/plugin-mail-smtp', () => {
  let mock: Awaited<ReturnType<typeof startMockSmtp>> | undefined

  afterEach(async () => {
    await mock?.close()
    mock = undefined
  })

  it('sends an HTML mail through the configured server', async () => {
    mock = await startMockSmtp()
    const ctx = new Context()
    await ctx.plugin(SmtpMailService, {
      host: '127.0.0.1',
      port: mock.port,
      secure: false,
      from: 'noreply@test.local',
    })

    await ctx.mail.sendHtml!('alice@example.com', 'Hello', '<p>hi</p>')
    const msg = await mock.received
    expect(msg.from).toContain('noreply@test.local')
    expect(msg.to).toContain('alice@example.com')
    expect(msg.subject).toBe('Hello')
    expect(msg.html).toContain('<p>hi</p>')
  })

  it('formats fromName as an RFC 5322 display name', async () => {
    mock = await startMockSmtp()
    const ctx = new Context()
    await ctx.plugin(SmtpMailService, {
      host: '127.0.0.1',
      port: mock.port,
      secure: false,
      from: 'noreply@test.local',
      fromName: 'Test Bot',
    })

    await ctx.mail.sendHtml!('alice@example.com', 'Hi', '<p>hi</p>')
    const msg = await mock.received
    expect(msg.from).toMatch(/Test Bot.*<noreply@test\.local>/)
  })

  it('authenticates when auth is configured', async () => {
    mock = await startMockSmtp({ requireAuth: true })
    const ctx = new Context()
    await ctx.plugin(SmtpMailService, {
      host: '127.0.0.1',
      port: mock.port,
      secure: false,
      from: 'noreply@test.local',
      auth: { user: 'u', pass: 'p' },
    })

    await ctx.mail.sendHtml!('alice@example.com', 'Hi', '<p>hi</p>')
    await mock.received
    expect(mock.authSeen).toEqual({ user: 'u', pass: 'p' })
  })

  it('renders a registered template and sends it', async () => {
    mock = await startMockSmtp()
    const ctx = new Context()
    await ctx.plugin(SmtpMailService, {
      host: '127.0.0.1',
      port: mock.port,
      secure: false,
      from: 'noreply@test.local',
      templates: {
        welcome: {
          subject: 'Hi {name}',
          html: '<p>Welcome, {name}! Your code is {code}.</p>',
        },
      },
    })

    await ctx.mail.sendTemplate('alice@example.com', 'welcome', { name: 'Alice', code: '1234' })
    const msg = await mock.received
    expect(msg.subject).toBe('Hi Alice')
    expect(msg.html).toContain('Welcome, Alice!')
    expect(msg.html).toContain('Your code is 1234.')
  })

  it('throws on an unknown template name', async () => {
    mock = await startMockSmtp()
    const ctx = new Context()
    await ctx.plugin(SmtpMailService, {
      host: '127.0.0.1',
      port: mock.port,
      secure: false,
      from: 'noreply@test.local',
    })

    await expect(
      ctx.mail.sendTemplate('alice@example.com', 'nope', {}),
    ).rejects.toThrow(/Unknown mail template: nope/)
  })

  it('closes the transporter when the plugin disposes', async () => {
    mock = await startMockSmtp()
    const ctx = new Context()
    await ctx.plugin(SmtpMailService, {
      host: '127.0.0.1',
      port: mock.port,
      secure: false,
      from: 'noreply@test.local',
    })

    const closeSpy = vi.spyOn((ctx.mail as any).transporter, 'close')
    ctx.registry.delete(SmtpMailService)
    await sleep()
    expect(closeSpy).toHaveBeenCalledTimes(1)
  })
})
