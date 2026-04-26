// Faint topographic-contour SVG drawn behind the hero.
// Lines draw on once via stroke-dashoffset, then sit static.
// Hidden entirely under prefers-reduced-motion (it's purely decorative).
export default function TopoBackground() {
  return (
    <div
      aria-hidden="true"
      className="bb-topo pointer-events-none absolute inset-0 -z-0 overflow-hidden"
    >
      <svg
        viewBox="0 0 800 800"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full opacity-[0.18] mix-blend-multiply"
      >
        <defs>
          <radialGradient id="bb-topo-fade" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="bb-topo-mask">
            <rect width="800" height="800" fill="url(#bb-topo-fade)" />
          </mask>
        </defs>
        <g
          mask="url(#bb-topo-mask)"
          fill="none"
          stroke="#1F2419"
          strokeWidth="1"
          strokeLinecap="round"
        >
          {/* Concentric, slightly hand-drawn topo rings centered behind the logo */}
          <path className="bb-topo-line" style={{ animationDelay: '0.05s' }} d="M400,300 C470,300 520,330 540,400 C560,470 510,520 400,520 C300,520 240,470 260,400 C280,330 330,300 400,300 Z" />
          <path className="bb-topo-line" style={{ animationDelay: '0.15s' }} d="M400,260 C500,260 580,300 590,400 C600,500 510,560 400,560 C290,560 200,500 210,400 C220,300 300,260 400,260 Z" />
          <path className="bb-topo-line" style={{ animationDelay: '0.25s' }} d="M400,220 C530,220 630,280 640,400 C650,520 530,600 400,600 C270,600 150,520 160,400 C170,280 270,220 400,220 Z" />
          <path className="bb-topo-line" style={{ animationDelay: '0.35s' }} d="M400,180 C560,180 680,260 690,400 C700,540 560,640 400,640 C240,640 100,540 110,400 C120,260 240,180 400,180 Z" />
          <path className="bb-topo-line" style={{ animationDelay: '0.45s' }} d="M400,140 C590,140 730,240 740,400 C750,560 590,680 400,680 C210,680 50,560 60,400 C70,240 210,140 400,140 Z" />
          <path className="bb-topo-line" style={{ animationDelay: '0.55s' }} d="M400,100 C620,100 770,220 780,400 C790,580 620,720 400,720 C180,720 10,580 20,400 C30,220 180,100 400,100 Z" />
          <path className="bb-topo-line" style={{ animationDelay: '0.65s' }} d="M400,60 C640,60 800,200 810,400 C820,600 640,760 400,760 C160,760 -20,600 -10,400 C0,200 160,60 400,60 Z" />
        </g>
      </svg>
      {/* Paper grain — low-opacity SVG noise via inline data URI */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 0.12  0 0 0 0 0.14  0 0 0 0 0.10  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          backgroundSize: '180px 180px',
        }}
      />
    </div>
  )
}
