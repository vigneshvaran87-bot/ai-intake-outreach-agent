export function notFound(req, res) { res.status(404).json({ error: 'Route not found', path: req.originalUrl }); }
export function errorHandler(err, req, res, next) {
  const status = err.status || (err.name === 'ZodError' ? 400 : 500);
  const message = err.name === 'ZodError' ? 'Payload validation failed' : err.message || 'Internal server error';
  console.error(JSON.stringify({ level: 'error', time: new Date().toISOString(), route: req.originalUrl, status, message, details: err.name === 'ZodError' ? err.issues : undefined }));
  res.status(status).json({ error: message, ...(err.name === 'ZodError' ? { details: err.issues } : {}) });
}
