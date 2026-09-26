const nodemailer = require('nodemailer');

// Two modes, picked from .env:
// - SMTP_HOST set: real delivery through that SMTP server (e.g. Gmail with
//   an app password). Credentials only ever live in .env, never in git.
// - SMTP_HOST not set: a throwaway Ethereal test inbox. The email is really
//   sent, but lands in Ethereal instead of the recipient's inbox, and
//   sendEmail returns a preview URL to open it. Lets the whole team (and
//   the demo) send invites with zero setup.
let transportPromise = null;

function getTransport() {
    if (!transportPromise) {
        transportPromise = createTransport().catch((error) => {
            // Don't cache a failed setup (e.g. no internet for Ethereal) —
            // let the next send try again.
            transportPromise = null;
            throw error;
        });
    }

    return transportPromise;
}

async function createTransport() {
    if (process.env.SMTP_HOST) {
        return {
            isTestInbox: false,
            transporter: nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: process.env.SMTP_USER
                    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                    : undefined,
            }),
        };
    }

    const account = await nodemailer.createTestAccount();

    return {
        isTestInbox: true,
        transporter: nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: { user: account.user, pass: account.pass },
        }),
    };
}

async function sendEmail({ to, subject, text, html }) {
    const { transporter, isTestInbox } = await getTransport();

    const info = await transporter.sendMail({
        from: process.env.MAIL_FROM || '"RosterUp" <no-reply@rosterup.test>',
        to,
        subject,
        text,
        html,
    });

    return {
        messageId: info.messageId,
        previewUrl: isTestInbox ? nodemailer.getTestMessageUrl(info) || null : null,
    };
}

module.exports = {
    sendEmail,
};
