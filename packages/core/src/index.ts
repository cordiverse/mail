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
  static name = 'mail'

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
  async sendTemplate(to: string, templateId: string, variables: Record<string, string> = {}): Promise<void> {
    this.ctx.logger.debug('send template %s: %o', templateId, variables)
    if (!this.sendHtml) {
      throw new Error(
        `${this.constructor.name} does not implement sendTemplate or sendHtml — override one of them.`,
      )
    }
    const templates = (this.config as any).templates as Record<string, { subject: string; html: string }>
    const template = templates?.[templateId]
    if (!template || typeof template.subject !== 'string' || typeof template.html !== 'string') {
      throw new Error(`Unknown mail template: ${templateId}`)
    }
    await this.sendHtml(
      to,
      renderTemplate(template.subject, variables),
      renderTemplate(template.html, variables),
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
