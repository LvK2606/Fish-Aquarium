import { HttpError } from './security.js';

export function createEmailSender({ apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, fetcher = fetch } = {}) {
  return {
    configured: Boolean(apiKey && from),
    async send({ email, token, kind, origin }) {
      if (!apiKey || !from) throw new HttpError(503, 'internal', { message: 'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.' });
      const url = new URL('/', origin);
      url.searchParams.set(kind === 'verify' ? 'verify' : 'reset', token);
      const subject = kind === 'verify' ? 'Xác minh email Fish Aquarium' : 'Đặt lại mật khẩu Fish Aquarium';
      const text = `${subject}\n\n${url.href}\n\nLiên kết có hiệu lực trong ${kind === 'verify' ? '24 giờ' : '30 phút'}. Nếu bạn không yêu cầu, hãy bỏ qua email này.`;
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email], subject, text }),
      });
      if (!response.ok) throw new HttpError(503, 'internal', { message: 'Email could not be sent. Please retry later.' });
    },
  };
}
