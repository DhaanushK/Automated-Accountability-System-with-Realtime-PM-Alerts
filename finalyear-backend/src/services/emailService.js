import nodemailer from 'nodemailer';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { promisify } from 'util';

class EmailService {
  constructor() {
    this.transporter = null;
    this.imap = null;
  }

  async initializeTransport() {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });
    }
    await this.transporter.verify();
  }

  async initializeImap() {
    if (!this.imap) {
      this.imap = new Imap({
        user: process.env.EMAIL_USER,
        password: process.env.GMAIL_APP_PASSWORD,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });

      // Convert IMAP methods to promises
      this.imap.connect = promisify(this.imap.connect.bind(this.imap));
    }
  }

  async getInboxEmails(searchCriteria = ['ALL'], limit = 50) {
    await this.initializeImap();
    
    return new Promise((resolve, reject) => {
      const emails = [];
      
      this.imap.once('ready', () => {
        this.imap.openBox('INBOX', false, (err, box) => {
          if (err) reject(err);

          this.imap.search(searchCriteria, (err, results) => {
            if (err) reject(err);

            // Get the last 'limit' number of emails
            const range = results.slice(-limit).join(',');
            if (!range) {
              resolve([]);
              return;
            }

            const fetch = this.imap.fetch(range, {
              bodies: '',
              struct: true
            });

            fetch.on('message', (msg) => {
              const email = {};

              msg.on('body', async (stream) => {
                const parsed = await simpleParser(stream);
                email.messageId = parsed.messageId;
                email.from = parsed.from;
                email.to = parsed.to;
                email.cc = parsed.cc;
                email.subject = parsed.subject;
                email.text = parsed.text;
                email.html = parsed.html;
                email.date = parsed.date;
                email.attachments = parsed.attachments;
                emails.push(email);
              });
            });

            fetch.once('error', (err) => reject(err));
            
            fetch.once('end', () => {
              this.imap.end();
              resolve(emails.sort((a, b) => b.date - a.date));
            });
          });
        });
      });

      this.imap.once('error', (err) => reject(err));
      this.imap.connect();
    });
  }

  async getSentEmails(searchCriteria = ['ALL'], limit = 50) {
    await this.initializeImap();
    
    return new Promise((resolve, reject) => {
      const emails = [];
      
      this.imap.once('ready', () => {
        this.imap.openBox('[Gmail]/Sent Mail', false, (err, box) => {
          if (err) reject(err);

          this.imap.search(searchCriteria, (err, results) => {
            if (err) reject(err);

            const range = results.slice(-limit).join(',');
            if (!range) {
              resolve([]);
              return;
            }

            const fetch = this.imap.fetch(range, {
              bodies: '',
              struct: true
            });

            fetch.on('message', (msg) => {
              const email = {};

              msg.on('body', async (stream) => {
                const parsed = await simpleParser(stream);
                email.messageId = parsed.messageId;
                email.from = parsed.from;
                email.to = parsed.to;
                email.cc = parsed.cc;
                email.subject = parsed.subject;
                email.text = parsed.text;
                email.html = parsed.html;
                email.date = parsed.date;
                email.attachments = parsed.attachments;
                emails.push(email);
              });
            });

            fetch.once('error', (err) => reject(err));
            
            fetch.once('end', () => {
              this.imap.end();
              resolve(emails.sort((a, b) => b.date - a.date));
            });
          });
        });
      });

      this.imap.once('error', (err) => reject(err));
      this.imap.connect();
    });
  }

  async searchEmails(query, folder = 'INBOX') {
    const searchCriteria = [
      ['OR',
        ['SUBJECT', query],
        ['BODY', query],
        ['FROM', query],
        ['TO', query]
      ]
    ];
    
    if (folder === 'SENT') {
      return await this.getSentEmails(searchCriteria);
    }
    return await this.getInboxEmails(searchCriteria);
  }

  async sendEmail(to, subject, body, cc = []) {
    await this.initializeTransport();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: Array.isArray(to) ? to.join(', ') : to,
      cc: Array.isArray(cc) ? cc.join(', ') : cc,
      subject: subject,
      html: body
    };

    const result = await this.transporter.sendMail(mailOptions);
    return result;
  }
}

const emailService = new EmailService();
export default emailService;