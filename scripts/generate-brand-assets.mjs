import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outputRoot = path.join(root, "public", "brand");
const sourceDarkLogoPath = path.join(root, "art_src", "brand", "filosage-dark-theme-original.png");
const sourceLightLogoPath = path.join(root, "art_src", "brand", "filosage-light-theme-original.png");
const { data: darkLogo, info: darkLogoInfo } = await sharp(sourceDarkLogoPath)
  .extract({ left: 508, top: 235, width: 520, height: 520 })
  .resize(600, 600, { fit: "fill" })
  .png({ compressionLevel: 9 })
  .toBuffer({ resolveWithObject: true });
const { data: lightLogo, info: lightLogoInfo } = await sharp(sourceLightLogoPath)
  .extract({ left: 468, top: 187, width: 600, height: 600 })
  .resize(600, 600, { fit: "fill" })
  .png({ compressionLevel: 9 })
  .toBuffer({ resolveWithObject: true });
const logoDataUri = `data:image/png;base64,${lightLogo.toString("base64")}`;
const darkLogoDataUri = `data:image/png;base64,${darkLogo.toString("base64")}`;

const palette = {
  navy: "#0D1B3D",
  teal: "#14B8A6",
  blue: "#4DA6FF",
  coral: "#FF8A65",
  offWhite: "#FAFAF7",
  white: "#FFFFFF",
  raised: "#F4F6F8",
  subtle: "#EEF2F5",
  secondary: "#43506B",
  darkCanvas: "#071127",
  darkRaised: "#12254D",
  darkSubtle: "#182C52",
  darkBorder: "#2B3B60",
  darkSecondary: "#C5CEDE",
};

const assets = [];

function documentSvg({ width, height, title, description, body, viewBox = `0 0 ${width} ${height}` }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">${description}</desc>
  ${body}
</svg>\n`;
}

function logoImage(x, y, size, variant = "light") {
  return `<image href="${variant === "dark" ? darkLogoDataUri : logoDataUri}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

function wordmark(x, y, color = palette.navy, size = 46, anchor = "start") {
  const sageColor = color === palette.offWhite ? "#2DD4BF" : palette.teal;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="700" letter-spacing="-1"><tspan fill="${color}">Filo</tspan><tspan fill="${sageColor}">sage</tspan></text>`;
}

function tagline(x, y, color, size = 20, anchor = "start") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-family="Inter, Arial, sans-serif" font-size="${size}" font-weight="500">Turn curiosity into understanding<tspan fill="${palette.coral}">.</tspan></text>`;
}

function nodeNetwork(width, height, opacity = 0.34) {
  return `<g fill="none" stroke-linecap="round" opacity="${opacity}">
    <path d="M${width * 0.08} ${height * 0.74}C${width * 0.26} ${height * 0.58} ${width * 0.30} ${height * 0.30} ${width * 0.48} ${height * 0.44}S${width * 0.76} ${height * 0.76} ${width * 0.92} ${height * 0.22}" stroke="${palette.blue}" stroke-width="2"/>
    <path d="M${width * 0.18} ${height * 0.22}C${width * 0.36} ${height * 0.34} ${width * 0.50} ${height * 0.16} ${width * 0.70} ${height * 0.34}" stroke="${palette.teal}" stroke-width="2"/>
    <g fill="${palette.teal}" stroke="none"><circle cx="${width * 0.08}" cy="${height * 0.74}" r="7"/><circle cx="${width * 0.48}" cy="${height * 0.44}" r="8"/><circle cx="${width * 0.70}" cy="${height * 0.34}" r="7"/></g>
    <g fill="${palette.blue}" stroke="none"><circle cx="${width * 0.18}" cy="${height * 0.22}" r="6"/><circle cx="${width * 0.92}" cy="${height * 0.22}" r="9"/></g>
    <circle cx="${width * 0.76}" cy="${height * 0.69}" r="6" fill="${palette.coral}" stroke="none"/>
  </g>`;
}

async function save(relativePath, content, width, height, usage, format = "svg") {
  const destination = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
  assets.push({ path: `/brand/${relativePath.replaceAll("\\", "/")}`, width, height, format, usage });
}

async function saveSvg(relativePath, svg, width, height, usage) {
  await save(relativePath, svg, width, height, usage, "svg");
}

function featureIllustration(title, description, accent, motif) {
  return documentSvg({
    width: 640,
    height: 480,
    title,
    description,
    body: `<rect width="640" height="480" rx="16" fill="${palette.raised}"/>
      <path d="M0 360C150 300 235 392 374 322S548 234 640 282V480H0Z" fill="${accent}" opacity=".09"/>
      <rect x="108" y="78" width="424" height="324" rx="14" fill="${palette.white}" stroke="#DCE2E9"/>
      ${motif}
      <circle cx="494" cy="110" r="7" fill="${palette.coral}"/>
      <circle cx="515" cy="110" r="7" fill="${palette.teal}"/>
      <circle cx="536" cy="110" r="7" fill="${palette.blue}"/>`,
  });
}

await save("logo/filosage-theme-light.png", lightLogo, lightLogoInfo.width, lightLogoInfo.height, "Light-theme Filosage tile cropped directly from the supplied light-theme PNG.", "png");
await save("logo/filosage-theme-dark.png", darkLogo, darkLogoInfo.width, darkLogoInfo.height, "Dark-theme Filosage tile cropped directly from the supplied dark-theme PNG.", "png");
await save("logo/filosage-icon.png", darkLogo, darkLogoInfo.width, darkLogoInfo.height, "Authoritative Filosage application icon cropped directly from the supplied dark-theme PNG.", "png");

await saveSvg("logo/filosage-horizontal.svg", documentSvg({
  width: 620,
  height: 160,
  title: "Filosage horizontal logo",
  description: "The original Filosage icon beside the Filosage wordmark and tagline on a transparent background.",
  body: `${logoImage(12, 16, 128)}${wordmark(166, 79)}${tagline(166, 112, palette.secondary, 19)}`,
}), 620, 160, "Horizontal lockup on transparent or light neutral surfaces.");

await saveSvg("logo/filosage-light-placement.svg", documentSvg({
  width: 720,
  height: 260,
  title: "Filosage logo on a light surface",
  description: "A safe off-white placement around the unmodified Filosage icon.",
  body: `<rect width="720" height="260" rx="16" fill="${palette.offWhite}"/>${logoImage(64, 54, 152)}${wordmark(244, 126)}${tagline(244, 158, palette.secondary, 18)}`,
}), 720, 260, "Approved logo placement for off-white and light surfaces.");

await saveSvg("logo/filosage-dark-placement.svg", documentSvg({
  width: 720,
  height: 260,
  title: "Filosage logo on a dark surface",
  description: "A safe navy placement around the unmodified Filosage icon.",
  body: `<rect width="720" height="260" rx="16" fill="${palette.darkCanvas}"/>${logoImage(64, 54, 152, "dark")}${wordmark(244, 126, palette.offWhite)}${tagline(244, 158, palette.darkSecondary, 18)}`,
}), 720, 260, "Approved logo placement for navy and dark surfaces.");

await saveSvg("logo/filosage-social-avatar.svg", documentSvg({
  width: 1200,
  height: 1200,
  title: "Filosage social avatar",
  description: "A square navy social avatar with generous clear space around the original Filosage icon.",
  body: `<rect width="1200" height="1200" rx="240" fill="${palette.darkCanvas}"/><circle cx="600" cy="600" r="410" fill="${palette.navy}" stroke="${palette.darkBorder}" stroke-width="6"/>${logoImage(300, 300, 600)}`,
}), 1200, 1200, "Square avatar for social and organization profiles.");

await save("logo/browser-icon.png", darkLogo, darkLogoInfo.width, darkLogoInfo.height, "Raster browser icon export retained for external brand packages.", "png");

const heroBackground = (dark, mobile = false) => documentSvg({
  width: mobile ? 900 : 1600,
  height: mobile ? 1200 : 900,
  title: `${dark ? "Dark" : "Light"} Filosage hero background${mobile ? " for narrow layouts" : ""}`,
  description: "A restrained text-free gradient and knowledge-node field with clear negative space.",
  body: `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark ? palette.darkCanvas : palette.offWhite}"/><stop offset=".58" stop-color="${dark ? palette.navy : palette.raised}"/><stop offset="1" stop-color="${dark ? palette.darkRaised : palette.white}"/></linearGradient><radialGradient id="a"><stop stop-color="${palette.teal}" stop-opacity=".18"/><stop offset="1" stop-color="${palette.teal}" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><ellipse cx="${mobile ? 720 : 1320}" cy="${mobile ? 260 : 210}" rx="${mobile ? 360 : 470}" ry="${mobile ? 390 : 360}" fill="url(#a)"/>${nodeNetwork(mobile ? 900 : 1600, mobile ? 1200 : 900, dark ? 0.24 : 0.18)}`,
});

await saveSvg("backgrounds/hero-light.svg", heroBackground(false), 1600, 900, "Large light hero background with left-side text space.");
await saveSvg("backgrounds/hero-dark.svg", heroBackground(true), 1600, 900, "Large dark hero background with left-side text space.");
await saveSvg("backgrounds/hero-light-mobile.svg", heroBackground(false, true), 900, 1200, "Narrow light hero background.");
await saveSvg("backgrounds/hero-dark-mobile.svg", heroBackground(true, true), 900, 1200, "Narrow dark hero background.");

await saveSvg("illustrations/abstract-learning.svg", documentSvg({
  width: 960,
  height: 720,
  title: "Understanding takes shape",
  description: "Connected concepts converge into a clear learning path.",
  body: `<rect width="960" height="720" rx="16" fill="${palette.offWhite}"/><g transform="translate(80 70)">${nodeNetwork(800, 580, 0.7)}</g><circle cx="480" cy="350" r="86" fill="${palette.navy}"/><path d="M438 352h84M480 310v84" stroke="${palette.offWhite}" stroke-width="10" stroke-linecap="round" opacity=".9"/><circle cx="480" cy="350" r="118" fill="none" stroke="${palette.teal}" stroke-width="8" stroke-dasharray="160 60"/>`,
}), 960, 720, "General learning, knowledge, and comprehension illustration.");

await saveSvg("illustrations/ai-explanations.svg", featureIllustration("Clear explanations", "A complex idea is reorganized into a clear hierarchy.", palette.blue, `<g fill="none" stroke="${palette.navy}" stroke-width="7" stroke-linecap="round"><path d="M168 170h208"/><path d="M168 218h286"/><path d="M168 266h184"/><path d="M168 314h248"/></g><circle cx="450" cy="170" r="27" fill="${palette.blue}" opacity=".18"/><path d="M438 170l9 9 18-22" fill="none" stroke="${palette.blue}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`), 640, 480, "Feature illustration for clear AI-supported explanations.");

await saveSvg("illustrations/personalized-practice.svg", featureIllustration("Personalized practice", "Practice branches from a shared concept toward an individual next step.", palette.teal, `<g fill="none" stroke-width="7" stroke-linecap="round"><path d="M184 236h96c52 0 50-78 104-78h78" stroke="${palette.teal}"/><path d="M280 236c52 0 50 82 104 82h78" stroke="${palette.blue}"/><path d="M184 236h-24" stroke="${palette.navy}"/></g><g fill="${palette.navy}"><circle cx="160" cy="236" r="17"/><circle cx="464" cy="158" r="17"/><circle cx="464" cy="318" r="17"/></g>`), 640, 480, "Feature illustration for adaptive personalized practice.");

await saveSvg("illustrations/progress-tracking.svg", featureIllustration("Progress tracking", "A progress ring and evidence markers show movement toward mastery.", palette.coral, `<circle cx="286" cy="246" r="92" fill="none" stroke="#EEF2F5" stroke-width="22"/><circle cx="286" cy="246" r="92" fill="none" stroke="${palette.teal}" stroke-width="22" stroke-linecap="round" stroke-dasharray="405 578" transform="rotate(-90 286 246)"/><path d="M412 310h66M412 270h42M412 230h88M412 190h54" stroke="${palette.navy}" stroke-width="9" stroke-linecap="round"/>`), 640, 480, "Feature illustration for progress tracking and evidence.");

await saveSvg("illustrations/learning-paths.svg", featureIllustration("Learning paths", "A guided route connects a starting point to a clear outcome.", palette.blue, `<path d="M166 326C210 268 230 290 276 234S366 182 430 160S468 210 472 300" fill="none" stroke="${palette.blue}" stroke-width="8" stroke-linecap="round" stroke-dasharray="12 15"/><g fill="${palette.navy}"><circle cx="166" cy="326" r="19"/><circle cx="276" cy="234" r="19"/><circle cx="430" cy="160" r="19"/></g><circle cx="472" cy="300" r="27" fill="${palette.teal}"/><path d="M460 300l9 9 18-22" fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`), 640, 480, "Feature illustration for guided learning paths.");

await saveSvg("illustrations/topic-exploration.svg", featureIllustration("Topic exploration", "Related topics orbit a central question without losing focus.", palette.coral, `<g fill="none" stroke="#B9C3D0" stroke-width="4"><path d="M320 238L188 168M320 238l134-72M320 238L190 326M320 238l146 92"/></g><circle cx="320" cy="238" r="58" fill="${palette.navy}"/><g fill="${palette.blue}"><circle cx="188" cy="168" r="28"/><circle cx="454" cy="166" r="28"/></g><g fill="${palette.teal}"><circle cx="190" cy="326" r="28"/><circle cx="466" cy="330" r="28"/></g>`), 640, 480, "Feature illustration for exploring connected topics.");

await saveSvg("illustrations/concept-mastery.svg", featureIllustration("Concept mastery", "Evidence builds in layers until a concept is independently demonstrated.", palette.teal, `<path d="M174 326h292" stroke="${palette.navy}" stroke-width="7" stroke-linecap="round"/><rect x="194" y="262" width="58" height="64" rx="7" fill="${palette.blue}"/><rect x="277" y="214" width="58" height="112" rx="7" fill="${palette.teal}"/><rect x="360" y="154" width="58" height="172" rx="7" fill="${palette.navy}"/><path d="M205 184l44-38 48 28 76-62 48 20" fill="none" stroke="${palette.coral}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`), 640, 480, "Feature illustration for concept mastery and demonstrated capability.");

await saveSvg("illustrations/desktop-product-frame.svg", documentSvg({
  width: 1440,
  height: 980,
  title: "Filosage desktop learning workspace",
  description: "A browser-based Filosage interface showing a focused learning path, review prompt, and evidence progress.",
  body: `<rect width="1440" height="980" rx="16" fill="${palette.darkCanvas}"/><rect x="64" y="54" width="1312" height="872" rx="14" fill="${palette.offWhite}"/><path d="M64 120h1312" stroke="#DCE2E9"/><circle cx="104" cy="87" r="8" fill="${palette.coral}"/><circle cx="130" cy="87" r="8" fill="${palette.teal}"/><circle cx="156" cy="87" r="8" fill="${palette.blue}"/><rect x="208" y="72" width="750" height="30" rx="7" fill="${palette.subtle}"/><rect x="98" y="154" width="246" height="738" rx="11" fill="${palette.white}" stroke="#DCE2E9"/>${logoImage(122, 178, 58)}${wordmark(196, 214, palette.navy, 26)}<g fill="${palette.secondary}" font-family="Inter,Arial,sans-serif" font-size="20" font-weight="600"><text x="126" y="300">Today</text><text x="126" y="354">Explore</text><text x="126" y="408">Review</text><text x="126" y="462">Progress</text></g><rect x="384" y="154" width="958" height="738" rx="11" fill="${palette.white}"/><text x="430" y="224" fill="${palette.secondary}" font-family="Inter,Arial,sans-serif" font-size="18">Focused session · about 18 min</text><text x="430" y="286" fill="${palette.navy}" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="700" letter-spacing="-1">Make the idea usable.</text><text x="430" y="330" fill="${palette.secondary}" font-family="Inter,Arial,sans-serif" font-size="20">Explain it, practice it, then apply it to a real decision.</text><rect x="430" y="382" width="566" height="220" rx="12" fill="${palette.navy}"/><text x="468" y="430" fill="${palette.darkSecondary}" font-family="Inter,Arial,sans-serif" font-size="16">TODAY'S NEXT STEP</text><text x="468" y="478" fill="${palette.offWhite}" font-family="Inter,Arial,sans-serif" font-size="27" font-weight="700">Test the concept from memory</text><text x="468" y="520" fill="${palette.darkSecondary}" font-family="Inter,Arial,sans-serif" font-size="18">One retrieval prompt, then one transfer task.</text><rect x="468" y="552" width="176" height="42" rx="7" fill="${palette.offWhite}"/><text x="556" y="579" text-anchor="middle" fill="${palette.navy}" font-family="Inter,Arial,sans-serif" font-size="17" font-weight="700">Start practice</text><text x="430" y="672" fill="${palette.navy}" font-family="Inter,Arial,sans-serif" font-size="24" font-weight="700">Evidence of understanding</text><path d="M430 734h796" stroke="#DCE2E9" stroke-width="12" stroke-linecap="round"/><path d="M430 734h532" stroke="${palette.teal}" stroke-width="12" stroke-linecap="round"/><g fill="${palette.secondary}" font-family="Inter,Arial,sans-serif" font-size="16"><text x="430" y="786">Recall</text><text x="700" y="786">Guided practice</text><text x="1000" y="786">Transfer</text></g>`,
}), 1440, 980, "Desktop/browser product-interface frame for marketing compositions.");

await saveSvg("patterns/dot-grid.svg", documentSvg({ width: 320, height: 320, title: "Dot grid pattern", description: "A subtle repeating dot grid.", body: `<defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.7" fill="${palette.navy}" opacity=".16"/></pattern></defs><rect width="320" height="320" fill="url(#p)"/>` }), 320, 320, "Subtle repeating background behind large text.");
await saveSvg("patterns/knowledge-nodes.svg", documentSvg({ width: 800, height: 600, title: "Knowledge node pattern", description: "A subtle network of connected ideas.", body: nodeNetwork(800, 600, 0.28) }), 800, 600, "Knowledge and connection background motif.");
await saveSvg("patterns/learning-path.svg", documentSvg({ width: 1200, height: 400, title: "Learning path pattern", description: "A gentle route line with milestones.", body: `<path d="M24 318C224 310 232 96 438 112S704 334 906 250 1036 72 1176 86" fill="none" stroke="${palette.blue}" stroke-width="4" opacity=".32"/><g fill="${palette.teal}" opacity=".54"><circle cx="24" cy="318" r="8"/><circle cx="438" cy="112" r="8"/><circle cx="906" cy="250" r="8"/><circle cx="1176" cy="86" r="8"/></g>` }), 1200, 400, "Wide learning journey background.");
await saveSvg("patterns/page-motif.svg", documentSvg({ width: 640, height: 480, title: "Book and page motif", description: "Abstract overlapping pages rendered as subtle geometric shapes.", body: `<g fill="none" stroke="${palette.navy}" opacity=".16"><path d="M122 94h236c54 0 98 44 98 98v202H220c-54 0-98-44-98-98V94Z" stroke-width="4"/><path d="M220 394V192c0-54 44-98 98-98h200v202c0 54-44 98-98 98H220Z" stroke-width="4"/><path d="M170 158h208M170 208h118M330 158h140M330 208h92" stroke-width="3"/></g>` }), 640, 480, "Quiet book/page background motif.");
await saveSvg("patterns/progress-rings.svg", documentSvg({ width: 640, height: 640, title: "Progress ring motif", description: "Concentric progress arcs in the Filosage palette.", body: `<g fill="none" stroke-linecap="round" transform="rotate(-90 320 320)"><circle cx="320" cy="320" r="230" stroke="${palette.subtle}" stroke-width="26"/><circle cx="320" cy="320" r="230" stroke="${palette.teal}" stroke-width="26" stroke-dasharray="980 1445"/><circle cx="320" cy="320" r="170" stroke="${palette.blue}" stroke-width="18" stroke-dasharray="620 1068"/><circle cx="320" cy="320" r="112" stroke="${palette.coral}" stroke-width="12" stroke-dasharray="360 704"/></g>` }), 640, 640, "Progress and mastery background motif.");
await saveSvg("patterns/gradient-mesh.svg", documentSvg({ width: 1600, height: 900, title: "Teal blue coral gradient mesh", description: "A restrained low-opacity gradient mesh.", body: `<defs><radialGradient id="t"><stop stop-color="${palette.teal}" stop-opacity=".28"/><stop offset="1" stop-color="${palette.teal}" stop-opacity="0"/></radialGradient><radialGradient id="b"><stop stop-color="${palette.blue}" stop-opacity=".24"/><stop offset="1" stop-color="${palette.blue}" stop-opacity="0"/></radialGradient><radialGradient id="c"><stop stop-color="${palette.coral}" stop-opacity=".2"/><stop offset="1" stop-color="${palette.coral}" stop-opacity="0"/></radialGradient></defs><rect width="1600" height="900" fill="${palette.offWhite}"/><ellipse cx="280" cy="220" rx="520" ry="420" fill="url(#t)"/><ellipse cx="1280" cy="200" rx="560" ry="440" fill="url(#b)"/><ellipse cx="920" cy="760" rx="600" ry="400" fill="url(#c)"/>` }), 1600, 900, "Low-contrast gradient mesh behind readable HTML content.");

function campaign({ width, height, title, description, dark = false, eyebrow = "FILOSAGE", headline, supporting, motif = true }) {
  const background = dark ? palette.darkCanvas : palette.offWhite;
  const heading = dark ? palette.offWhite : palette.navy;
  const copy = dark ? palette.darkSecondary : palette.secondary;
  const logoSize = Math.round(Math.min(width, height) * 0.17);
  const left = Math.round(width * 0.08);
  const logoTop = Math.round(height * 0.12);
  const textTop = Math.round(height * 0.47);
  const headlineSize = Math.max(42, Math.min(Math.round(height * 0.12), Math.floor((width * 0.84) / (headline.length * 0.56))));
  return documentSvg({
    width,
    height,
    title,
    description,
    body: `<rect width="${width}" height="${height}" fill="${background}"/>${motif ? nodeNetwork(width, height, dark ? 0.18 : 0.13) : ""}${logoImage(left, logoTop, logoSize, dark ? "dark" : "light")}${wordmark(left + logoSize + 32, logoTop + logoSize * 0.48, heading, Math.max(26, Math.round(height * 0.065)))}<text x="${left + logoSize + 32}" y="${logoTop + logoSize * 0.73}" fill="${copy}" font-family="Inter,Arial,sans-serif" font-size="${Math.max(15, Math.round(height * 0.032))}">${eyebrow}</text><text x="${left}" y="${textTop}" fill="${heading}" font-family="Inter,Arial,sans-serif" font-size="${headlineSize}" font-weight="700" letter-spacing="-2">${headline}</text><text x="${left}" y="${textTop + Math.round(height * 0.13)}" fill="${copy}" font-family="Inter,Arial,sans-serif" font-size="${Math.max(20, Math.round(height * 0.04))}">${supporting}</text>`,
  });
}

const campaigns = [
  ["banners/main-website-banner.svg", 1920, 600, "Filosage website banner", "Turn curiosity into understanding.", "Focused learning paths, source-aware lessons, and evidence of progress.", false, "WEBSITE"],
  ["banners/call-to-action-banner.svg", 1600, 500, "Filosage call to action banner", "Make the next idea click.", "Explore a focused learning path at filosage.com", true, "START LEARNING"],
  ["banners/about-page-banner.svg", 1600, 700, "Filosage about page banner", "Understanding changes what you can do.", "Learning designed for clarity, practice, and transfer.", false, "ABOUT"],
  ["banners/blog-header.svg", 1600, 600, "Filosage blog header", "Ideas worth understanding.", "Notes on learning, reasoning, and useful knowledge.", true, "FILOSAGE NOTES"],
  ["banners/open-graph.svg", 1200, 630, "Filosage Open Graph image", "Turn curiosity into understanding.", "AI-assisted learning paths for complex professional skills.", true, "LEARNING PATHS"],
  ["banners/social-sharing-fallback.svg", 1200, 630, "Filosage social sharing image", "Turn curiosity into understanding.", "Build real understanding at filosage.com", false, "FILOSAGE"],
  ["social/linkedin-company-banner.svg", 1128, 191, "Filosage LinkedIn company banner", "Turn curiosity into understanding.", "Clear explanations · Personalized practice · Real progress", true, "FILOSAGE"],
  ["social/x-profile-header.svg", 1500, 500, "Filosage X profile header", "Turn curiosity into understanding.", "AI-assisted learning paths for complex professional skills.", true, "FILOSAGE"],
  ["social/github-social-preview.svg", 1280, 640, "Filosage GitHub social preview", "Learning built for understanding.", "The web learning experience at filosage.com", false, "GITHUB"],
  ["social/product-announcement.svg", 1200, 630, "Filosage product announcement", "Turn a question into a learning path.", "Explain. Practice. Apply. Track progress.", false, "PRODUCT UPDATE"],
  ["social/launch-announcement.svg", 1200, 630, "Filosage launch announcement", "Filosage is ready to explore.", "Turn curiosity into understanding.", true, "NOW ON THE WEB"],
  ["social/newsletter-header.svg", 1200, 400, "Filosage newsletter header", "A clearer way into complex ideas.", "Turn curiosity into understanding.", false, "FILOSAGE NOTES"],
  ["social/press-kit-cover.svg", 1600, 2000, "Filosage press kit cover", "Filosage brand and product resources", "Web application · filosage.com", true, "PRESS KIT"],
];

for (const [relativePath, width, height, title, headline, supporting, dark, eyebrow] of campaigns) {
  await saveSvg(relativePath, campaign({ width, height, title, description: `${title} using the original Filosage logo and brand palette.`, dark, eyebrow, headline, supporting }), width, height, `${title} for web and external brand use.`);
}

const sparkIconBody = `<path d="M24 4c2.4 9.6 6.8 14 16.4 16.4C30.8 22.8 26.4 27.2 24 36.8 21.6 27.2 17.2 22.8 7.6 20.4 17.2 18 21.6 13.6 24 4Z" fill="${palette.coral}"/>`;
const sparkIconSvg = documentSvg({
  width: 48,
  height: 48,
  title: "Spark",
  description: "Spark interface symbol in the Filosage visual system.",
  body: sparkIconBody,
});

for (const [file, title, body] of [
  ["icons/arrow-right.svg", "Arrow right", `<path d="M10 24h28m-9-10 10 10-10 10" fill="none" stroke="${palette.navy}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`],
  ["icons/check.svg", "Check", `<circle cx="24" cy="24" r="19" fill="${palette.teal}"/><path d="m15 24 6 6 13-15" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`],
  ["icons/spark.svg", "Spark", sparkIconBody],
]) {
  await saveSvg(file, documentSvg({ width: 48, height: 48, title, description: `${title} interface symbol in the Filosage visual system.`, body }), 48, 48, `${title} icon for external brand compositions; product UI continues to use Lucide.`);
}
await writeFile(path.join(root, "src", "app", "icon.svg"), sparkIconSvg);

const ogSvgPath = path.join(outputRoot, "banners", "open-graph.svg");
const fallbackSvgPath = path.join(outputRoot, "banners", "social-sharing-fallback.svg");
await sharp(ogSvgPath).png({ compressionLevel: 9, palette: true }).toFile(path.join(outputRoot, "social", "open-graph.png"));
assets.push({ path: "/brand/social/open-graph.png", width: 1200, height: 630, format: "png", usage: "Raster Open Graph and X card used by application metadata." });
await sharp(fallbackSvgPath).png({ compressionLevel: 9, palette: true }).toFile(path.join(outputRoot, "social", "social-sharing-fallback.png"));
assets.push({ path: "/brand/social/social-sharing-fallback.png", width: 1200, height: 630, format: "png", usage: "Raster fallback for social platforms that do not accept SVG." });

await save("photography/README.md", `# Photography guidance\n\nFilosage does not ship stock photography by default. Use editorial, realistic learning photography only when it communicates context the product interface cannot. Avoid staged smiles, device mockups, phones, AI robots, classrooms that imply unsupported institutional use, and oversized source files. Crop for the intended placement and provide AVIF/WebP responsive variants.\n`, null, null, "Photography sourcing and optimization guidance.", "md");

const manifestPath = path.join(outputRoot, "asset-manifest.json");
await writeFile(manifestPath, `${JSON.stringify({ generatedFrom: ["art_src/brand/filosage-light-theme-original.png", "art_src/brand/filosage-dark-theme-original.png"], generatedBy: "scripts/generate-brand-assets.mjs", assets }, null, 2)}\n`);

console.log(`Generated ${assets.length} Filosage brand assets from the two supplied source images.`);
