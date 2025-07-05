const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      pathRewrite: {
        '^/api': '/api', // no rewrite needed
      },
      onError: (err, req, res) => {
        console.log('Proxy error:', err.message);
        // Don't fail the request, just log the error
      },
    })
  );
}; 