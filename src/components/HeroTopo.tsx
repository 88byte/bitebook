// Hand-drawn topographic contour lines for the dark hero — meant to read
// like a fragment of a real USGS 7.5-minute quad map sitting behind the
// skull. Asymmetric peak roughly centered behind the logo with a secondary
// ridge to the southwest. Index lines (every ~5th) are slightly thicker and
// more opaque, with tiny elevation labels — the small details that sell it
// as a real map rather than a decorative ring pattern.
//
// Color is calibrated USGS contour brown adapted for the dark hero — warm
// sepia at low opacity so the lines feel printed onto the surface rather
// than glowing on top of it. Static SVG, no animations.

const TOPO_COLOR = '#B5825A'

// Regular (intermediate) contour lines — innermost to outermost, intentionally
// asymmetric so they don't read as ovals.
const REGULAR_CONTOURS = [
  // Innermost ring near peak (~4520 ft)
  'M395,205 C415,202 425,215 422,232 C418,247 400,250 388,245 C376,239 374,222 380,212 C385,206 390,205 395,205 Z',
  // ~4500 ft
  'M385,185 C418,182 442,196 446,222 C447,245 428,257 405,258 C380,258 360,247 358,225 C357,205 370,188 385,185 Z',
  // ~4480 ft
  'M375,165 C420,160 458,178 466,210 C470,238 448,262 412,266 C378,266 343,256 336,228 C330,200 354,170 375,165 Z',
  // ~4440 ft
  'M348,120 C432,115 502,140 520,200 C530,255 498,288 445,298 C392,302 332,295 298,270 C270,240 268,185 295,150 C315,128 332,122 348,120 Z',
  // ~4420 ft — starting to show the southwestern ridge bulge
  'M330,95 C440,90 530,125 552,195 C568,260 528,305 470,318 C405,328 332,322 285,295 C245,265 230,215 252,170 C277,128 310,100 330,95 Z',
  // ~4380 ft — secondary ridge clearly visible
  'M285,45 C455,38 600,85 645,185 C670,270 612,345 530,365 C440,380 305,392 232,355 C175,320 152,265 170,215 C195,155 245,75 285,45 Z',
]

// Index contour lines — every ~5th line in real USGS maps. Thicker stroke,
// slightly higher opacity, paired with elevation labels.
const INDEX_CONTOURS = [
  // 4400 ft
  'M362,143 C422,140 478,162 488,205 C493,245 470,275 425,280 C378,280 332,268 318,232 C310,205 335,150 362,143 Z',
  // 4350 ft
  'M310,68 C450,60 565,100 595,190 C615,265 568,318 500,335 C420,348 320,348 258,318 C205,288 188,235 210,185 C235,135 275,82 310,68 Z',
  // 4250 ft — outermost, partially cut off by viewport edges
  'M230,18 C440,10 645,55 715,180 C745,265 685,355 580,395 C480,420 285,432 195,395 C125,360 92,290 105,225 C130,140 195,40 230,18 Z',
]

// Secondary ridge — tiny mountain feature southwest of the main peak.
// Two small concentric rings imply a satellite ridge, the kind of detail
// real topo maps show without making a fuss.
const SECONDARY_RIDGE = [
  'M235,375 C250,373 258,382 254,392 C248,400 235,398 228,390 C225,382 230,376 235,375 Z',
  'M222,360 C252,358 270,372 270,390 C268,402 248,408 230,406 C212,402 205,388 210,375 C214,365 218,361 222,360 Z',
]

// Elevation labels — placed inside the line area, near the index curves.
// Tiny monospace font + low opacity so they read as map ephemera.
const LABELS: { x: number; y: number; text: string }[] = [
  { x: 410, y: 280, text: '4400' },
  { x: 397, y: 335, text: '4350' },
  { x: 382, y: 395, text: '4250' },
]

export default function HeroTopo() {
  return (
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full pointer-events-none"
      aria-hidden="true"
    >
      {/* Regular contour lines */}
      <g
        fill="none"
        stroke={TOPO_COLOR}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.32"
      >
        {REGULAR_CONTOURS.map((d) => (
          <path key={d} d={d} />
        ))}
        {SECONDARY_RIDGE.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      {/* Index contour lines — heavier weight, more opaque */}
      <g
        fill="none"
        stroke={TOPO_COLOR}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.50"
      >
        {INDEX_CONTOURS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      {/* Elevation labels */}
      <g
        fill={TOPO_COLOR}
        stroke="none"
        opacity="0.45"
        fontSize="9"
        fontFamily="ui-monospace, SFMono-Regular, Monaco, Consolas, monospace"
      >
        {LABELS.map(({ x, y, text }) => (
          <text key={text} x={x} y={y}>
            {text}
          </text>
        ))}
      </g>
    </svg>
  )
}
