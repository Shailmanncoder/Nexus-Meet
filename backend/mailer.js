const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASS || ''
  }
});

function sendReminderEmail(emailsStr, meetingId, meetingTime) {
  if (!emailsStr || !process.env.EMAIL_USER) {
    console.log(`[Mailer] Skipping email — no recipients or EMAIL_USER not configured.`);
    console.log(`[Mailer] Would have sent reminder for meeting ${meetingId} at ${meetingTime}`);
    return;
  }

  const emails = emailsStr.split(',').map(e => e.trim()).filter(e => e);
  if (emails.length === 0) return;

  const timeStr = new Date(meetingTime).toLocaleString();
  
  const mailOptions = {
    from: `NexusMeet <${process.env.EMAIL_USER}>`,
    to: emails.join(', '),
    subject: `Reminder: NexusMeet Meeting in 15 minutes`,
    html: `
      <div style="font-family: 'Google Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #1a73e8; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">NexusMeet</h1>
          <p style="margin: 5px 0 0; opacity: 0.9;">Meeting Reminder</p>
        </div>
        <div style="background: #fff; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="color: #333; font-size: 16px;">Your meeting starts in <strong>15 minutes</strong>!</p>
          <p style="color: #666;">Scheduled for: <strong>${timeStr}</strong></p>
          <div style="margin: 24px 0; text-align: center;">
            <a href="${process.env.APP_URL || 'https://nexusmeet.live'}?code=${meetingId}" 
               style="background: #1a73e8; color: white; padding: 12px 32px; border-radius: 24px; text-decoration: none; font-size: 16px; font-weight: 500;">
              Join Meeting
            </a>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 24px;">Meeting ID: ${meetingId}</p>
        </div>
      </div>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('[Mailer] Error sending email:', error.message);
    } else {
      console.log(`[Mailer] Reminder sent to ${emails.join(', ')}`);
    }
  });
}

module.exports = { sendReminderEmail };
