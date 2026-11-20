
fn linear_to_gamma_channel(channel: f32) -> f32
{
  return pow(channel, 0.4545);
}

fn linear_to_gamma(color: vec3f) -> vec3f
{
  return vec3f(linear_to_gamma_channel(color.x), linear_to_gamma_channel(color.y), linear_to_gamma_channel(color.z));
}

fn degrees_to_radians(degrees: f32) -> f32
{
  return degrees * PI / 180.0;
}

fn mapfb(p: vec2u, rez: f32) -> i32
{
  return i32(p.x) + i32(p.y) * i32(rez);
}

fn int_to_rgb(c: i32) -> vec3f
{
  var r = f32((c >> 16) & 0xff) / 255.0;
  var g = f32((c >> 8) & 0xff) / 255.0;
  var b = f32(c & 0xff) / 255.0;

  return vec3f(r, g, b);
}

fn rgb_to_int(c: vec4f) -> i32
{
  var r = i32(c.x * 255.0) << 16;
  var g = i32(c.y * 255.0) << 8;
  var b = i32(c.z * 255.0);

  return r | g | b;
}

// Teste raio x AABB (slab method). Serve como "early-out" das malhas: se o raio
// nao atinge a caixa que envolve a malha, nenhum triangulo precisa ser testado.
// t_max descarta caixas que estao mais longe que o objeto ja encontrado.
fn AABB_intersect_max(r: ray, boxMin: vec3f, boxMax: vec3f, t_max: f32) -> bool
{
  // componentes ~0 da direcao viram um valor minusculo (evita 0 * infinito = NaN)
  let dir = select(r.direction, vec3f(1.0e-8), abs(r.direction) < vec3f(1.0e-8));
  let inv = 1.0 / dir;

  // pequena folga para nao perder raios que raspam na caixa por erro de ponto flutuante
  let pad = vec3f(1.0e-4);
  let tMin = ((boxMin - pad) - r.origin) * inv;
  let tMax = ((boxMax + pad) - r.origin) * inv;

  let t1 = min(tMin, tMax);
  let t2 = max(tMin, tMax);

  let tNear = max(max(t1.x, t1.y), t1.z);
  let tFar = min(min(t2.x, t2.y), t2.z);

  return tFar >= tNear && tFar > 0.0 && tNear <= t_max;
}

fn AABB_intersect(r: ray, boxMin: vec3f, boxMax: vec3f) -> bool
{
  return AABB_intersect_max(r, boxMin, boxMax, 1.0e30);
}

fn quaternion_from_euler(euler: vec3f) -> vec4f
{
  var c1 = cos(euler.x / 2.0);
  var c2 = cos(euler.y / 2.0);
  var c3 = cos(euler.z / 2.0);
  var s1 = sin(euler.x / 2.0);
  var s2 = sin(euler.y / 2.0);
  var s3 = sin(euler.z / 2.0);

  var q = vec4f(0.0);
  q.x = s1 * c2 * c3 + c1 * s2 * s3;
  q.y = c1 * s2 * c3 - s1 * c2 * s3;
  q.z = c1 * c2 * s3 + s1 * s2 * c3;
  q.w = c1 * c2 * c3 - s1 * s2 * s3;

  return q;
}

fn qmul(q1: vec4f, q2: vec4f) -> vec4f
{
  return vec4f(
    q2.xyz * q1.w + q1.xyz * q2.w + cross(q1.xyz, q2.xyz),
    q1.w * q2.w - dot(q1.xyz, q2.xyz)
  );
}

fn q_conjugate(q: vec4f) -> vec4f
{
  return vec4f(-q.xyz, q.w);
}

fn q_inverse(q: vec4f) -> vec4f
{
  return q_conjugate(q) / dot(q, q);
}

fn rotate_vector(v: vec3f, r: vec4f) -> vec3f
{
  var r_c = r * vec4f(-1.0, -1.0, -1.0, 1.0);
  return qmul(r, qmul(vec4f(v, 0.0), r_c)).xyz;
}

fn rotate_ray_quaternion(r: ray, center: vec3f, q: vec4f) -> ray
{
  var origin = rotate_vector(r.origin - center, q) + center;
  var direction = rotate_vector(r.direction, q);
  return ray(origin, direction);
}