// Scanner input only: treat the expression as data, never executable code.
export function handle(req, res) {
  res.send(JSON.parse(req.query.expression));
}
