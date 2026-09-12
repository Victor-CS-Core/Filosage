// Scanner input only: treat the expression as data, never executable code.
export function handle(req: { query: { expression: string } }, res: { send: (value: unknown) => void }) {
  res.send(JSON.parse(req.query.expression));
}
