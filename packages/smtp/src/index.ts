import { Context } from 'cordis'
import nodemailer, { type Transporter } from 'nodemailer'
import { MailService } from '@cordisjs/mail'
import z from 'schemastery'

export interface Config extends MailService.Config {
  host: string
  port?: number
  /** true for port 465; false for STARTTLS on 587 */
  secure?: boolean
  auth?: {
    user: string
    pass: string
  }
}

export class SmtpMailService extends MailService {
  static Config: z<Config> = z.object({
    from: z.string().required().description('发件人邮箱地址。'),
    fromName: z.string().description('发件人显示名称。'),
    host: z.string().required().description('SMTP 主机。'),
    port: z.natural().description('SMTP 端口 (默认 secure=true 时 465, 否则 587)。'),
    secure: z.boolean().description('是否使用隐式 TLS (465 端口)。'),
    auth: z.object({
      user: z.string().description('登录用户名。'),
      pass: z.string().role('secret').description('登录密码或授权码。'),
    }).description('登录凭据。'),
  })

  transporter: Transporter

  constructor(ctx: Context, public config: Config) {
    super(ctx, config)
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    })
    ctx.effect(() => () => this.transporter.close())
  }

  async send(to: string, subject: string, html: string) {
    const { from, fromName } = this.config
    const fromField = fromName ? `"${fromName}" <${from}>` : from
    await this.transporter.sendMail({ from: fromField, to, subject, html })
  }
}

export default SmtpMailService
