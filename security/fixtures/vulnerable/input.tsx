// Scanner input only: this file is never executed.
export function handle(req: { query: { expression: string } }, res: { send: (value: unknown) => void }) {
  res.send(eval(req.query.expression));
}
