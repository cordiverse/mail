import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    mail: MailService
  }
}

export abstract class MailService extends Service {
  constructor(ctx: Context, public config: MailService.Config) {
    super(ctx, 'mail')
  }

  /** Send an HTML email to the given address */
  abstract send(to: string, subject: string, html: string): Promise<void>
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
