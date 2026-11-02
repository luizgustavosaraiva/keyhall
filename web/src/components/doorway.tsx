import { type RefObject, useEffect, useRef } from "react"

// The brand's arched doorway, cut into the page itself: light from the room behind fills the
// arch and leaks onto the page around it and onto the floor. The page color stays flat far from
// the door, a faint warm gradient comes closer, and only the light near the arch is
// ordered-dithered into the brand ambers. The sign-in form drives the light through `door`.

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform vec4 uArch;
uniform vec3 uBg;
uniform float uLight;
uniform float uSpread;
uniform float uAim;
uniform float uBeam;

const vec3 DEEP = vec3(0.86, 0.52, 0.10);
const vec3 AMBER = vec3(0.961, 0.647, 0.141);
const vec3 GLOW = vec3(1.0, 0.851, 0.471);

// Arch outline: a rectangle from y = 0 to h with a half circle of radius w on top.
float sdArch(vec2 p, float w, float h) {
  vec2 d = abs(p - vec2(0.0, h * 0.5)) - vec2(w, h * 0.5);
  float rect = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return min(rect, length(p - vec2(0.0, h)) - w);
}

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void main() {
  float w = uArch.z;
  // Origin at the middle of the threshold; distances in arch half-widths.
  vec2 p = (gl_FragCoord.xy - uArch.xy) / w;
  float d = sdArch(p, 1.0, uArch.w / w);
  // Thresholds centered in their cells, so no light means no dot.
  float th = bayer8(gl_FragCoord.xy) + 0.5 / 64.0;
  vec3 col;
  if (d < 0.0) {
    // The lit room: pale at the heart, amber toward the jambs, brighter low and where the beam
    // leans.
    float lean = 0.12 * (1.0 - abs(p.x - uAim * 0.5));
    float v = (0.5 + 2.2 * min(-d, 0.3) + lean - 0.04 * p.y) * uLight;
    float x = clamp(v, 0.0, 1.0) * 2.0;
    float i = floor(x) + step(th, fract(x));
    col = i < 0.5 ? DEEP : i < 1.5 ? AMBER : GLOW;
  } else {
    float halo = exp(-d * 2.4 / uSpread);
    // Light on the floor, from the threshold toward the viewer, leaning to uAim.
    float beam = 0.0;
    if (p.y < 0.0) {
      float dy = -p.y;
      // As wide as the doorway at the threshold, opening out toward the viewer.
      float edge = 1.0 + dy * 0.75;
      float x = p.x - uAim * dy * 0.8;
      beam = uBeam * smoothstep(edge + 0.12, edge - 0.12, abs(x)) * (1.0 - 0.3 * abs(x) / edge) *
        exp(-dy * 0.6 / uSpread);
    }
    float light = uLight * max(halo * 0.62, beam * 0.85);
    // Far from the door there is no dither at all, only the page and its warm gradient.
    light = max(light - 0.05, 0.0) / 0.95;
    float wide = uLight * exp(-d * 0.3 / uSpread);
    // The 1/255 nudge breaks the 8-bit bands a gradient this dark would show.
    vec3 base = mix(uBg, AMBER, wide * 0.09) + (th - 0.5) / 255.0;
    float x = clamp(light, 0.0, 1.0) * 3.0;
    float i = floor(x) + step(th, fract(x));
    col = i < 0.5 ? base : i < 1.5 ? mix(uBg, AMBER, 0.3) : i < 2.5 ? AMBER : GLOW;
  }
  gl_FragColor = vec4(col, 1.0);
}
`

const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"
// One dither dot, in CSS pixels.
const DOT = 2
const FPS = 30

// What the form tells the light. Each value eases toward its target in the frame loop.
const target = { focus: 0, open: 0 }
const state = { focus: 0, open: 0, pulse: 0, dim: 0 }
export const door = {
  // A field has focus: the light grows a little.
  focus(on: boolean) {
    target.focus = on ? 1 : 0
  },
  // A key press: a short flare.
  key() {
    state.pulse = Math.min(1, state.pulse + 0.3)
  },
  // Signing in: the light floods the page; on failure it falters and comes back.
  open() {
    target.open = 1
  },
  fail() {
    target.open = 0
    state.dim = 1
  },
}

function start(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false })
  if (!gl) return
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) return
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook
  gl.useProgram(program)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  // One triangle that covers the screen.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const u = (name: string) => gl.getUniformLocation(program, name)
  const res = u("uRes")
  const arch = u("uArch")
  const bg = u("uBg")
  const light = u("uLight")
  const spread = u("uSpread")
  const aim = u("uAim")
  const beam = u("uBeam")

  return (
    slot: DOMRect,
    color: [number, number, number],
    v: { light: number; spread: number; aim: number }
  ) => {
    const width = Math.max(1, Math.round(canvas.clientWidth / DOT))
    const height = Math.max(1, Math.round(canvas.clientHeight / DOT))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    }
    const half = slot.width / 2 / DOT
    gl.uniform2f(res, width, height)
    gl.uniform4f(
      arch,
      (slot.left + slot.width / 2) / DOT,
      (canvas.clientHeight - slot.bottom) / DOT,
      half,
      slot.height / DOT - half
    )
    gl.uniform3f(bg, ...color)
    gl.uniform1f(light, v.light)
    gl.uniform1f(spread, v.spread)
    gl.uniform1f(aim, v.aim)
    // A doorway at the top of a phone screen casts no floor light over the form below it.
    gl.uniform1f(beam, slot.bottom < canvas.clientHeight * 0.45 ? 0 : 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

// The page background as RGB in 0–1, whatever color syntax the theme uses.
function pageColor(): [number, number, number] {
  const probe = document.createElement("canvas").getContext("2d")
  if (!probe) return [0.09, 0.094, 0.11]
  probe.fillStyle = getComputedStyle(document.body).backgroundColor
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

// Fills the screen behind the page; the arch is drawn where `slot` sits in the layout.
export function Doorway({ slot }: { slot: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const draw = canvas && start(canvas)
    if (!canvas || !draw) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let color = pageColor()
    const theme = new MutationObserver(() => {
      color = pageColor()
    })
    theme.observe(document.documentElement, { attributes: true })

    // The floor light falls to the left, as in the logo, and leans toward the pointer, slowly.
    const REST = -0.5
    let aimAt = REST
    let aim = REST
    const onPointer = (e: PointerEvent) => {
      const box = slot.current?.getBoundingClientRect()
      if (!box) return
      const center = box.left + box.width / 2
      const toward = (e.clientX - center) / (window.innerWidth / 2)
      aimAt = Math.max(-1, Math.min(1, REST + 0.7 * toward))
    }

    const render = (now: number, dt: number) => {
      const box = slot.current?.getBoundingClientRect()
      if (!box) return
      const ease = (from: number, to: number, rate: number) =>
        from + (to - from) * Math.min(1, dt * rate)
      state.focus = ease(state.focus, target.focus, 4)
      state.open = ease(state.open, target.open, target.open ? 1.6 : 3)
      state.pulse *= Math.exp(-dt * 5)
      state.dim *= Math.exp(-dt * 1.4)
      aim = ease(aim, aimAt, 1.5)
      const t = now / 1000
      // A slow, uneven breath, like a lamp in another room.
      const breath = 0.04 * Math.sin(t * 0.9) + 0.025 * Math.sin(t * 2.3 + 1.7)
      const falter = state.dim * (0.55 + 0.45 * Math.sin(t * 38))
      draw(box, color, {
        light:
          (0.86 + breath) *
          (1 + 0.12 * state.focus + 0.22 * state.pulse + 0.3 * state.open) *
          (1 - 0.6 * falter),
        spread: 1 + 0.15 * state.focus + 9 * state.open * state.open,
        aim,
      })
    }

    let frame = 0
    let last = 0
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (document.hidden || now - last < 1000 / FPS) return
      render(now, last ? (now - last) / 1000 : 0)
      last = now
    }
    const once = () => render(0, 1)
    if (still) {
      once()
      window.addEventListener("resize", once)
    } else {
      window.addEventListener("pointermove", onPointer)
      frame = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(frame)
      theme.disconnect()
      window.removeEventListener("pointermove", onPointer)
      window.removeEventListener("resize", once)
      target.focus = 0
      target.open = 0
    }
  }, [slot])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 size-full bg-background [image-rendering:pixelated]"
    />
  )
}
