import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP2GO_HOST,
  port: process.env.SMTP2GO_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP2GO_USERNAME,
    pass: process.env.SMTP2GO_PASSWORD
  }
});

export async function sendActivationEmail(userEmail, activationToken) {
  const activationLink = `https://friendchat.space/verify-account/?e=${encodeURIComponent(userEmail)}&c=${encodeURIComponent(activationToken)}`;

  const mailOptions = {
    from: '"FriendChat.Space" <no-reply@friendchat.space>',
    to: userEmail,
    subject: 'Activate your account',
    text: `Hello! Click the link below to activate your account: ${activationLink}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
        <h2>Thank you for registering!</h2>
        <p>To use your account, you need to activate it first.</p>
        <p style="margin: 30px 0;">
          <a href="${activationLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Activate Account
          </a>
        </p>
        <p style="font-size: 12px; color: #666;">If the button doesn't work, copy this link into your browser: <br> ${activationLink}</p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Activation email sent successfully! ID:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('Error sending activation email:', error);
    return { success: false, error };
  }
}
