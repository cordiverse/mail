import { Context } from 'cordis'
import { MailService } from '@cordisjs/mail'
import z from 'schemastery'

export interface Template {
  subject: string
  html: string
}

export interface Config extends MailService.Config {
  apiKey: string
  /** Logical template name → {subject, html} with `{name}` placeholders */
  templates?: Record<string, Template>
  /** Default: https://api.resend.com/emails */
  endpoint?: string
}

export class ResendMailService extends MailService {
  static Config: z<Config> = z.object({
    from: z.string().required().description('发件人邮箱地址。'),
    fromName: z.string().description('发件人显示名称。'),
    apiKey: z.string().required().role('secret').description('Resend API Key。'),
    templates: z.dict(z.object({
      subject: z.string().required().description('邮件标题模板。'),
      html: z.string().required().description('邮件正文 HTML 模板。'),
    })).default({}).description('模板映射（逻辑名 → subject + html, 使用 {变量名} 占位）。'),
    endpoint: z.string().default('https://api.resend.com/emails').description('API 端点。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async sendHtml(to: string, subject: string, html: string) {
    const {
      apiKey,
      from,
      fromName,
      endpoint = 'https://api.resend.com/emails',
    } = this.config

    const fromField = fromName ? `${fromName} <${from}>` : from

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromField,
        to: [to],
        subject,
        html,
      }),
    })

    const data = await res.json() as any
    if (!res.ok || data.error) {
      const message = data.error?.message ?? data.message ?? res.statusText
      throw new Error(`Resend Mail error: ${message}`)
    }
  }
}

export default ResendMailService
