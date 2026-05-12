import { Context } from 'cordis'
import { MailService } from '@cordisjs/mail'
import z from 'schemastery'

declare module 'cordis' {
  interface Events {
    'mail/mock/html'(to: string, subject: string, html: string): void
    'mail/mock/template'(to: string, templateId: string, variables: Record<string, string>): void
  }
}

export interface Config extends MailService.Config {}

export class MockMailService extends MailService {
  static name = 'mail:mock'

  static Config: z<Config> = z.object({
    from: z.string().default('mock@mock.local').description('发件人邮箱地址。'),
    fromName: z.string().description('发件人显示名称。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async sendHtml(to: string, subject: string, html: string) {
    this.ctx.logger.debug('send html to %s subject %s: %s', to, subject, html)
    this.ctx.emit('mail/mock/html', to, subject, html)
  }

  async sendTemplate(to: string, templateId: string, variables: Record<string, string> = {}) {
    this.ctx.logger.debug('send template %s: %o', templateId, variables)
    this.ctx.emit('mail/mock/template', to, templateId, variables)
  }
}

export default MockMailService
