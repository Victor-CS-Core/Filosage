// Scanner input only: this file is never executed.
export function handle(req, res) {
  res.send(eval(req.query.expression));
}
