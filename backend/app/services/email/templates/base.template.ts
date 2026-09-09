import { appConfig } from '../../../config/app.config.js';

export const baseTemplate = (content: string, footerText: { doNotReply: string; copyright: string }) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .card {
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      padding: 40px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #2563eb;
    }
    h1 {
      color: #1f2937;
      font-size: 24px;
      margin-bottom: 20px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #2563eb;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 500;
      margin: 20px 0;
    }
    .warning {
      background-color: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      padding: 16px;
      margin: 20px 0;
    }
    .warning strong {
      color: #d97706;
    }
    .code {
      font-size: 32px;
      font-weight: bold;
      text-align: center;
      padding: 20px;
      background-color: #f3f4f6;
      border-radius: 8px;
      letter-spacing: 4px;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">${appConfig.name}</div>
      </div>
      ${content}
      <div class="footer">
        <p>${footerText.copyright}</p>
        <p>${footerText.doNotReply}</p>
      </div>
    </div>
  </div>
</body>
</html>
`;



