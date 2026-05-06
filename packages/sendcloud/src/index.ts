import { Context } from 'cordis'
import { MailService } from '@cordisjs/mail'
import z from 'schemastery'

export interface Config extends MailService.Config {
  apiUser: string
  apiKey: string
  /** Default: https://api.sendcloud.net/apiv2/mail/send */
  endpoint?: string
}

export class SendcloudMailService extends MailService {
  static Config: z<Config> = z.object({
    from: z.string().required().description('发件人邮箱地址。'),
    fromName: z.string().description('发件人显示名称。'),
    apiUser: z.string().required().description('API User。'),
    apiKey: z.string().required().role('secret').description('API Key。'),
    endpoint: z.string().default('https://api.sendcloud.net/apiv2/mail/send').description('API 端点。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async send(to: string, subject: string, html: string) {
    const {
      apiUser,
      apiKey,
      from,
      fromName,
      endpoint = 'https://api.sendcloud.net/apiv2/mail/send',
    } = this.config

    const params: Record<string, string> = {
      apiUser,
      apiKey,
      from,
      to,
      subject,
      html,
    }
    if (fromName) params.fromName = fromName

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })

    const data = await res.json() as any
    if (!data.result) {
      throw new Error(`SendCloud Mail error: ${data.message ?? data.statusCode}`)
    }
  }
}

export default SendcloudMailService
