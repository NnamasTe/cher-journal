(() => {
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };

  const hostname = window.location.hostname;
  const isLocalPreview = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname.endsWith('.app.github.dev');

  if (!isLocalPreview) {
    const script = document.createElement('script');
    script.src = '/_vercel/speed-insights/script.js';
    script.defer = true;
    document.body.appendChild(script);
  }
})();
