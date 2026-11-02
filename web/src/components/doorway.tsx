import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

// The brand's arched doorway at night, drawn in 3D by a fragment shader (raymarched distance
// fields) and ordered-dithered into the brand colors. The beam on the floor is the light from
// the room behind, shadowed by the wall and the door leaf. No images, no 3D library.

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform float uZoom;

const vec3 INK = vec3(0.090, 0.094, 0.110);
const vec3 EMBER = vec3(0.30, 0.19, 0.06);
const vec3 AMBER = vec3(0.961, 0.647, 0.141);
const vec3 GLOW = vec3(1.0, 0.851, 0.471);
const vec3 STONE = vec3(0.26, 0.255, 0.245);
const vec3 BONE = vec3(0.925, 0.918, 0.894);
const vec3 LIGHT = vec3(0.45, 1.05, 1.6);
const vec3 MOUTH = vec3(0.0, 0.9, -0.3);

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Arch outline in the xy plane: a rectangle from y = 0 to h with a half circle on top.
float sdArch(vec2 p, float w, float h) {
  vec2 d = abs(p - vec2(0.0, h * 0.5)) - vec2(w, h * 0.5);
  float rect = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return min(rect, length(p - vec2(0.0, h)) - w);
}

float slab(vec3 p, float d2, float t) {
  vec2 q = vec2(d2, abs(p.z) - t);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0));
}

// x: distance, y: material (1 floor, 2 wall, 3 room behind, 4 door leaf).
vec2 map(vec3 p) {
  vec2 r = vec2(p.y, 1.0);
  float wall = sdBox(p - vec3(0.0, 3.0, 0.0), vec3(8.0, 3.0, 0.15));
  wall = max(wall, -slab(p, sdArch(p.xy, 0.5, 1.2), 1.0));
  if (wall < r.x) r = vec2(wall, 2.0);
  float room = max(min(2.6 - p.z, 1.4 - abs(p.x)), 0.15 - p.z);
  if (room < r.x) r = vec2(room, 3.0);
  vec3 q = p - vec3(0.5, 0.0, -0.16);
  q.xz = rot(-1.75 - 0.05 * sin(uTime * 0.35)) * q.xz;
  q -= vec3(-0.5, 0.0, -0.03);
  float leaf = slab(q, sdArch(q.xy, 0.49, 1.21), 0.03);
  if (leaf < r.x) r = vec2(leaf, 4.0);
  return r;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  return normalize(vec3(
    map(p + e.xyy).x - map(p - e.xyy).x,
    map(p + e.yxy).x - map(p - e.yxy).x,
    map(p + e.yyx).x - map(p - e.yyx).x));
}

float shadow(vec3 ro, vec3 rd, float far) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 48; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.01, 0.25);
    if (res < 0.001 || t > far) break;
  }
  return clamp(res, 0.0, 1.0);
}

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

vec3 warm(float v, float th) {
  float x = clamp(v, 0.0, 1.0) * 3.0;
  float i = floor(x) + step(th, fract(x));
  return i < 0.5 ? INK : i < 1.5 ? EMBER : i < 2.5 ? AMBER : GLOW;
}
vec3 pale(float v, float th) {
  float x = clamp(v, 0.0, 1.0) * 2.0;
  float i = floor(x) + step(th, fract(x));
  return i < 0.5 ? INK : i < 1.5 ? STONE : BONE;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = vec3(0.0, 1.5 + uPointer.y * 0.1, -6.8);
  ro.xz = rot(0.4 + 0.1 * sin(uTime * 0.12) + uPointer.x * 0.08) * ro.xz;
  vec3 fw = normalize(vec3(0.1, 0.95, 0.0) - ro);
  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
  vec3 rd = normalize(fw * uZoom + uv.x * rt + uv.y * cross(fw, rt));

  float t = 0.0;
  vec2 hit = vec2(0.0);
  for (int i = 0; i < 110; i++) {
    hit = map(ro + rd * t);
    if (hit.x < 0.001 || t > 30.0) break;
    t += hit.x;
  }
  float th = bayer8(gl_FragCoord.xy);
  // Light scattered in the air at the doorway.
  vec3 near = ro + rd * max(dot(MOUTH - ro, rd), 0.0);
  float haze = 0.012 / (0.12 + dot(near - MOUTH, near - MOUTH));
  if (t > 30.0) { gl_FragColor = vec4(warm(haze, th), 1.0); return; }

  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 l = LIGHT - p;
  float dist = length(l);
  l /= dist;
  float lit = max(dot(n, l), 0.0) * shadow(p + n * 0.01, l, dist) / (1.0 + 0.35 * dist * dist);

  vec3 col;
  if (hit.y == 3.0) col = warm(0.75 + 1.2 * lit + 0.25 * smoothstep(2.6, 0.2, dist), th);
  else if (hit.y == 4.0) col = pale(sqrt(0.16 + 3.4 * lit), th);
  else col = warm(sqrt(2.8 * lit + haze + (hit.y == 1.0 ? 0.004 : 0.0)) * 0.95, th);
  gl_FragColor = vec4(col, 1.0);
}
`

const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}"
// Size of one dither dot in CSS pixels: finer in a short band, where the doorway is small.
const dot = (height: number) => (height < 480 ? 2 : 3)
const FPS = 30

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
  const res = gl.getUniformLocation(program, "uRes")
  const time = gl.getUniformLocation(program, "uTime")
  const pointer = gl.getUniformLocation(program, "uPointer")
  const zoom = gl.getUniformLocation(program, "uZoom")

  return (seconds: number, x: number, y: number) => {
    const size = dot(canvas.clientHeight)
    const width = Math.max(1, Math.round(canvas.clientWidth / size))
    const height = Math.max(1, Math.round(canvas.clientHeight / size))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    }
    gl.uniform2f(res, width, height)
    gl.uniform1f(time, seconds)
    gl.uniform2f(pointer, x, y)
    // A wide, short band frames the doorway closer.
    gl.uniform1f(zoom, width / height > 1.2 ? 2.4 : 1.7)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
}

export function Doorway({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const draw = canvas && start(canvas)
    if (!canvas || !draw) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // The camera leans a little toward the pointer, eased so it never jumps.
    const aim = { x: 0, y: 0 }
    const lean = { x: 0, y: 0 }
    const onPointer = (e: PointerEvent) => {
      aim.x = (e.clientX / window.innerWidth) * 2 - 1
      aim.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    let visible = true
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    observer.observe(canvas)
    let frame = 0
    let last = 0
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (!visible || document.hidden || now - last < 1000 / FPS) return
      last = now
      lean.x += (aim.x - lean.x) * 0.05
      lean.y += (aim.y - lean.y) * 0.05
      draw(now / 1000, lean.x, lean.y)
    }
    const onResize = () => draw(0, 0, 0)
    if (still) {
      draw(0, 0, 0)
      window.addEventListener("resize", onResize)
    } else {
      window.addEventListener("pointermove", onPointer)
      frame = requestAnimationFrame(loop)
    }
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener("pointermove", onPointer)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn(
        "block bg-[#17181c] [image-rendering:pixelated]",
        className
      )}
    />
  )
}
