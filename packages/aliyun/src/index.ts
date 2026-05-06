import { Context } from 'cordis'
import { createHmac, randomUUID } from 'node:crypto'
import { MailService } from '@cordisjs/mail'
import z from 'schemastery'

export interface Config extends MailService.Config {
  accessKeyId: string
  accessKeySecret: string
  /** 0: random address; 1: configured sender (default) */
  addressType?: 0 | 1
  /** Whether replies go to `from` */
  replyToAddress?: boolean
  /** Optional tag for the DirectMail console */
  tagName?: string
  /** Default: https://dm.aliyuncs.com */
  endpoint?: string
}

export class AliyunMailService extends MailService {
  static Config: z<Config> = z.object({
    from: z.string().required().description('发件人邮箱地址。'),
    fromName: z.string().description('发件人显示名称。'),
    accessKeyId: z.string().required().description('AccessKey ID。'),
    accessKeySecret: z.string().required().role('secret').description('AccessKey Secret。'),
    addressType: z.union([
      z.const(0).required(),
      z.const(1).required(),
    ]).default(1).description('发信地址类型: 0 随机地址, 1 发信地址。'),
    replyToAddress: z.boolean().default(false).description('是否使用回信地址。'),
    tagName: z.string().description('邮件标签 (控制台查询用)。'),
    endpoint: z.string().default('https://dm.aliyuncs.com').description('API 端点。'),
  })

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
  }

  async send(to: string, subject: string, html: string) {
    const {
      accessKeyId,
      accessKeySecret,
      from,
      fromName,
      addressType = 1,
      replyToAddress = false,
      tagName,
      endpoint = 'https://dm.aliyuncs.com',
    } = this.config

    const params: Record<string, string> = {
      Action: 'SingleSendMail',
      Version: '2015-11-23',
      Format: 'JSON',
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: randomUUID(),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z/, 'Z'),
      AccessKeyId: accessKeyId,
      AccountName: from,
      AddressType: String(addressType),
      ReplyToAddress: String(replyToAddress),
      ToAddress: to,
      Subject: subject,
      HtmlBody: html,
    }
    if (fromName) params.FromAlias = fromName
    if (tagName) params.TagName = tagName

    const sorted = Object.keys(params).sort()
    const canonicalized = sorted.map((k) =>
      `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`,
    ).join('&')
    const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonicalized)}`
    const signature = createHmac('sha1', accessKeySecret + '&')
      .update(stringToSign)
      .digest('base64')

    params.Signature = signature
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    const res = await fetch(`${endpoint}/?${query}`)
    const data = await res.json() as any
    if (!res.ok || data.Code) {
      throw new Error(`Aliyun Mail error: ${data.Message ?? data.Code ?? res.statusText}`)
    }
  }
}

export default AliyunMailService
