import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    mail: MailService
  }
}

/** Substitute `{name}` occurrences in `template` with `variables[name]`. */
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? '')
}

export abstract class MailService extends Service {
  constructor(ctx: Context, public config: MailService.Config) {
    super(ctx, 'mail')
  }

  /**
   * Send a registered template to the given recipient.
   *
   * The default implementation assumes a `templates: Record<string, {subject, html}>`
   * config and a `sendHtml` method — it renders both subject and html locally and
   * forwards to `sendHtml`. Drivers backed by a native cloud template system
   * (e.g. tencent SES) override this.
   */
  async sendTemplate(to: string, name: string, variables: Record<string, string> = {}): Promise<void> {
    if (!this.sendHtml) {
      throw new Error(
        `${this.constructor.name} does not implement sendTemplate or sendHtml — override one of them.`,
      )
    }
    const templates = (this.config as { templates?: Record<string, { subject: string; html: string }> }).templates
    const tmpl = templates?.[name]
    if (!tmpl || typeof tmpl.subject !== 'string' || typeof tmpl.html !== 'string') {
      throw new Error(`Unknown mail template: ${name}`)
    }
    await this.sendHtml(
      to,
      renderTemplate(tmpl.subject, variables),
      renderTemplate(tmpl.html, variables),
    )
  }

  /** Send a raw HTML email. Optional; implemented by drivers whose backend accepts arbitrary HTML bodies. */
  sendHtml?(to: string, subject: string, html: string): Promise<void>
}

export namespace MailService {
  export interface Config {
    /** Default sender email address */
    from: string
    /** Default sender display name */
    fromName?: string
  }
}

export default MailService
