import pg from "pg";

const pool = new pg.Pool();

// Scanned as data only; never imported or executed. The scanner must exit 1.
export async function syntheticVulnerability(request: Request) {
  const title = await request.text();
  return pool.query(`SELECT * FROM courses WHERE title = '${title}'`);
}
