interface CourseArtworkProps {
  seed: string;
  className?: string;
}

export function hashCourseIdentity(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function OrbitArtwork() {
  return (
    <>
      <circle className="course-artwork-field" cx="690" cy="328" r="168" />
      <path className="course-artwork-cream-fill" d="M602 348a144 144 0 0 0 174 138v-80a72 72 0 0 1-88-68Z" />
      <circle className="course-artwork-teal-fill" cx="618" cy="250" r="82" />
      <circle className="course-artwork-orbit is-wide" cx="690" cy="328" r="256" />
      <circle className="course-artwork-orbit is-dashed" cx="690" cy="328" r="208" />
      <path className="course-artwork-axis" d="M690 72v520M408 328h560" />
      <path className="course-artwork-coral" d="M472 524A282 282 0 0 1 818 72" />
      <circle className="course-artwork-coral-ring" cx="807" cy="328" r="20" />
      <circle className="course-artwork-cream-fill" cx="922" cy="328" r="15" />
      <circle className="course-artwork-teal-fill" cx="494" cy="436" r="11" />
      <circle className="course-artwork-coral-fill" cx="520" cy="120" r="9" />
      <path className="course-artwork-fine" d="M338 202h84m-84 32h54m-54 32h112M822 204h118M430 400h82" />
    </>
  );
}

function FlowArtwork() {
  return (
    <>
      <circle className="course-artwork-cream-fill" cx="782" cy="214" r="86" />
      <circle className="course-artwork-field" cx="438" cy="432" r="168" />
      <path className="course-artwork-teal-fill" d="M296 490a164 164 0 0 0 280-116H460a68 68 0 0 1-116 48Z" />
      <path className="course-artwork-orbit" d="M122 478C262 188 470 598 666 298S974 260 1098 92" />
      <path className="course-artwork-orbit is-soft" d="M100 540C256 258 442 632 680 354s300-108 424-220" />
      <path className="course-artwork-coral" d="M158 420C318 248 466 490 640 266S930 190 1064 126" />
      <path className="course-artwork-axis" d="M782 78v520M120 432h960" />
      <circle className="course-artwork-coral-ring" cx="640" cy="266" r="19" />
      <circle className="course-artwork-teal-fill" cx="986" cy="172" r="12" />
      <circle className="course-artwork-cream-fill" cx="222" cy="342" r="13" />
      <path className="course-artwork-fine" d="M836 310h162m-162 32h110m-764-178h164m-164 32h88" />
    </>
  );
}

function FrameArtwork() {
  return (
    <>
      <path className="course-artwork-cream-fill" d="M764 116h202v202H764z" />
      <path className="course-artwork-teal-fill" d="M284 350h216v216H284z" />
      <circle className="course-artwork-field" cx="596" cy="300" r="146" />
      <circle className="course-artwork-orbit is-wide" cx="596" cy="300" r="244" />
      <path className="course-artwork-axis" d="M596 54v548M112 300h976" />
      <path className="course-artwork-coral" d="M294 534 596 300 886 124" />
      <circle className="course-artwork-coral-ring" cx="596" cy="300" r="21" />
      <circle className="course-artwork-coral-fill" cx="886" cy="124" r="12" />
      <circle className="course-artwork-cream-fill" cx="294" cy="534" r="14" />
      <path className="course-artwork-fine" d="M138 146h194m-194 34h126m662 306h126m-126 34h176" />
    </>
  );
}

function ThresholdArtwork() {
  return (
    <>
      <circle className="course-artwork-field" cx="772" cy="350" r="188" />
      <path className="course-artwork-cream-fill" d="M772 162a188 188 0 0 1 0 376Z" />
      <path className="course-artwork-teal-fill" d="M312 162h162v162H312z" />
      <path className="course-artwork-coral-fill" d="M384 410h188v188H384z" />
      <circle className="course-artwork-orbit is-wide" cx="772" cy="350" r="258" />
      <circle className="course-artwork-orbit is-dashed" cx="772" cy="350" r="224" />
      <path className="course-artwork-axis" d="M772 70v560M110 350h982" />
      <path className="course-artwork-coral" d="M196 556C360 438 470 484 596 350s238-178 414-146" />
      <circle className="course-artwork-coral-ring" cx="596" cy="350" r="22" />
      <circle className="course-artwork-teal-fill" cx="1010" cy="204" r="11" />
      <path className="course-artwork-fine" d="M144 134h96m-96 32h142m620 340h142m-142 32h88" />
    </>
  );
}

export default function CourseArtwork({ seed, className = "" }: CourseArtworkProps) {
  const pattern = hashCourseIdentity(seed) % 4;
  return (
    <svg
      className={`course-artwork ${className}`.trim()}
      viewBox="0 0 1200 720"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="course-artwork-ground" width="1200" height="720" />
      {pattern === 0 ? <OrbitArtwork /> : pattern === 1 ? <FlowArtwork /> : pattern === 2 ? <FrameArtwork /> : <ThresholdArtwork />}
    </svg>
  );
}
