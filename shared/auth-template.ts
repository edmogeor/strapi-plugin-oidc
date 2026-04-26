export const AUTH_PAGE_CSS = `
  :root {
    --bg-color: #f6f6f9;
    --card-bg: #ffffff;
    --text-color: #32324d;
    --text-muted: #666687;
    --btn-bg: #4945ff;
    --btn-hover: #271fe0;
    --btn-text: #ffffff;
    --icon-bg: #fcecea;
    --icon-color: #d02b20;
    --success-bg: #eafbe7;
    --success-color: #328048;
    --shadow: 0 1px 4 rgba(33, 33, 52, 0.1);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg-color: #181826;
      --card-bg: #212134;
      --text-color: #ffffff;
      --text-muted: #a5a5ba;
      --btn-bg: #4945ff;
      --btn-hover: #7b79ff;
      --btn-text: #ffffff;
      --icon-bg: #4a2123;
      --icon-color: #f23628;
      --success-bg: #1c3523;
      --success-color: #55ca76;
      --shadow: 0 1px 4 rgba(0, 0, 0, 0.5);
    }
  }
  body {
    margin: 0;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-color: var(--bg-color);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-color);
  }
  .card {
    background: var(--card-bg);
    padding: 32px 40px;
    border-radius: 8px;
    box-shadow: var(--shadow);
    max-width: 400px;
    width: 100%;
    text-align: center;
    box-sizing: border-box;
  }
  .icon {
    width: 48px;
    height: 48px;
    background-color: var(--icon-bg);
    color: var(--icon-color);
    border-radius: 50%;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 24px;
  }
  .icon.success {
    background-color: var(--success-bg);
    color: var(--success-color);
  }
  .icon svg {
    width: 24px;
    height: 24px;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
  }
  h1 {
    margin: 0 0 12px 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text-color);
  }
  p {
    margin: 0 0 32px 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-muted);
  }
  .btn {
    display: inline-block;
    background-color: var(--btn-bg);
    color: var(--btn-text);
    padding: 10px 16px;
    border-radius: 4px;
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: background-color 0.2s;
  }
  .btn:hover {
    background-color: var(--btn-hover);
  }
`;

export function renderHtmlTemplate(title: string, content: string, locale: string = 'en'): string {
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${AUTH_PAGE_CSS}</style>
</head>
<body>
  ${content}
</body>
</html>`;
}
