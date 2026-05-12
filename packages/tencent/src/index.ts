import { Context } from 'cordis'
import { createHash, createHmac } from 'node:crypto'
import { MailService, renderTemplate } from '@cordisjs/mail'
import z from 'schemastery'

export interface Template {
  /** Tencent SES TemplateID (numeric). */
  id: number
  /**
   * Mail subject, rendered locally with `{name}` placeholders.
   *
   * Tencent SES requires `Subject` on every request even in template mode —
   * the subject registered in the console is for audit only and does not carry
   * over to sent mail.
   */
  subject: string
}

export interface Config extends MailService.Config {
  secretId: string
  secretKey: string
  /** Logical template name → {Tencent SES TemplateID, subject template} */
  templates: Record<string, Template>
  /** Region, default: ap-guangzhou. International accounts typically use ap-hongkong. */
  region?: string
}

export class TencentMailService extends MailService {
  static name = 'mail:tencent'

  static Config: z<Config> = z.object({
    from: z.string().required().description('发件人邮箱地址。'),
    fromName: z.string().description('发件人显示名称。'),
    secretId: z.string().required().description('Secret ID。'),
    secretKey: z.string().required().role('secret').description('Secret Key。'),
    templates: z.dict(z.object({
      id: z.number().required().description('腾讯云 SES TemplateID。'),
      subject: z.string().required().description('邮件标题模板 (使用 {变量名} 占位)。'),
    })).default({}).description('模板映射。'),
    region: z.string().default('ap-guangzhou').description('地域 (国际站常用 ap-hongkong)。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async sendTemplate(to: string, templateId: string, variables: Record<string, string> = {}) {
    this.ctx.logger.debug('send template %s: %o', templateId, variables)
    const template = this.config.templates[templateId]
    if (!template) throw new Error(`Unknown mail template: ${templateId}`)

    const {
      secretId,
      secretKey,
      from,
      fromName,
      region = 'ap-guangzhou',
    } = this.config

    const fromField = fromName ? `${fromName} <${from}>` : from
    const payload = JSON.stringify({
      FromEmailAddress: fromField,
      Destination: [to],
      Subject: renderTemplate(template.subject, variables),
      Template: {
        TemplateID: template.id,
        TemplateData: JSON.stringify(variables),
      },
    })

    const service = 'ses'
    const host = 'ses.tencentcloudapi.com'
    const now = Math.floor(Date.now() / 1000)
    const date = new Date(now * 1000).toISOString().slice(0, 10)

    const payloadHash = createHash('sha256').update(payload).digest('hex')
    const canonicalRequest = [
      'POST',
      '/',
      '',
      `content-type:application/json; charset=utf-8\nhost:${host}\n`,
      'content-type;host',
      payloadHash,
    ].join('\n')

    const credentialScope = `${date}/${service}/tc3_request`
    const stringToSign = [
      'TC3-HMAC-SHA256',
      String(now),
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n')

    const secretDate = createHmac('sha256', `TC3${secretKey}`).update(date).digest()
    const secretService = createHmac('sha256', secretDate).update(service).digest()
    const secretSigning = createHmac('sha256', secretService).update('tc3_request').digest()
    const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

    const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`

    const res = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': host,
        'X-TC-Action': 'SendEmail',
        'X-TC-Version': '2020-10-02',
        'X-TC-Timestamp': String(now),
        'X-TC-Region': region,
        'Authorization': authorization,
      },
      body: payload,
    })

    const data = await res.json() as any
    const response = data.Response
    if (response?.Error) {
      throw new Error(`Tencent Mail error: ${response.Error.Message}`)
    }
  }
}

export default TencentMailService
