const target = process.argv[2];
const expectedCourseId = process.argv[3];

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!expectedCourseId) {
  fail("Provide the expected featured course ID or the explicit value none.");
}
if (expectedCourseId !== "none" && !/^[a-fA-F0-9]{64}$/.test(expectedCourseId)) {
  fail("The expected featured course ID must be none or a 64-character hexadecimal course ID.");
}

let origin;
try {
  origin = new URL(target);
} catch {
  fail("The featured-course verification target must be a valid HTTPS origin.");
}
if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || !["", "/"].includes(origin.pathname)) {
  fail("The featured-course verification target must be an HTTPS origin without credentials, a path, query, or fragment.");
}

const response = await fetch(new URL("/api/courses", origin), {
  cache: "no-store",
  headers: { accept: "application/json" },
});
if (!response.ok) {
  fail(`Featured-course verification failed with HTTP ${response.status}.`);
}

let payload;
try {
  payload = await response.json();
} catch {
  fail("The public course API did not return JSON.");
}
const courses = Array.isArray(payload?.courses) ? payload.courses : [];

if (expectedCourseId === "none") {
  if (payload?.featuredCourseId != null) {
    fail(`Expected no configured featured course, but production returned ${payload.featuredCourseId}.`);
  }
  console.log("Featured-course configuration is explicitly unset.");
  process.exit(0);
}

if (payload.featuredCourseId !== expectedCourseId) {
  fail(`Expected featured course ${expectedCourseId}, but production returned ${payload?.featuredCourseId ?? "none"}.`);
}
if (!courses.some((course) => course?.id === expectedCourseId)) {
  fail("The configured featured course is not present in the public course catalog.");
}

console.log(`Featured course is public and configured (${expectedCourseId}).`);
