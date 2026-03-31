import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })
  }
  return transporter
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const transport = getTransporter()
  await transport.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject,
    text: body,
  })
}
