fn hit_sphere(center: vec3f, radius: f32, r: ray, record: ptr<function, hit_record>, max: f32)
{
  let oc = r.origin - center;
  let a = dot(r.direction, r.direction);
  let half_b = dot(oc, r.direction);
  let c = dot(oc, oc) - radius * radius;
  let discriminant = half_b * half_b - a * c;

  if (discriminant < 0.0)
  {
    record.hit_anything = false;
    return;
  }

  let sqrt_discriminant = sqrt(discriminant);
  var root = (-half_b - sqrt_discriminant) / a;
  if (root < RAY_TMIN || root > max)
  {
    root = (-half_b + sqrt_discriminant) / a;
    if (root < RAY_TMIN || root > max)
    {
      record.hit_anything = false;
      return;
    }
  }

  record.t = root;
  record.p = ray_at(r, root);
  // a normal sempre aponta contra o raio; frontface diz se o raio veio de fora
  let outward_normal = (record.p - center) / radius;
  record.frontface = dot(r.direction, outward_normal) < 0.0;
  record.normal = select(-outward_normal, outward_normal, record.frontface);
  record.hit_anything = true;
}

fn hit_quad(r: ray, Q: vec4f, u: vec4f, v: vec4f, record: ptr<function, hit_record>, max: f32)
{
  var n = cross(u.xyz, v.xyz);
  var normal = normalize(n);
  var D = dot(normal, Q.xyz);
  var w = n / dot(n.xyz, n.xyz);

  var denom = dot(normal, r.direction);
  if (abs(denom) < 0.0001)
  {
    record.hit_anything = false;
    return;
  }

  var t = (D - dot(normal, r.origin)) / denom;
  if (t < RAY_TMIN || t > max)
  {
    record.hit_anything = false;
    return;
  }

  var intersection = ray_at(r, t);
  var planar_hitpt_vector = intersection - Q.xyz;
  var alpha = dot(w, cross(planar_hitpt_vector, v.xyz));
  var beta = dot(w, cross(u.xyz, planar_hitpt_vector));

  if (alpha < 0.0 || alpha > 1.0 || beta < 0.0 || beta > 1.0)
  {
    record.hit_anything = false;
    return;
  }

  if (dot(normal, r.direction) > 0.0)
  {
    record.hit_anything = false;
    return;
  }

  record.t = t;
  record.p = intersection;
  record.normal = normal;
  // o quad e de uma face so: o raio sempre vem do lado da normal
  record.frontface = true;
  record.hit_anything = true;
}

// Triangulo (Moller-Trumbore). A malha e de dois lados: a normal devolvida sempre
// aponta contra o raio e frontface diz se o raio veio do lado da normal "geometrica"
// (regra da mao direita sobre v0 -> v1 -> v2).
fn hit_triangle(r: ray, v0: vec3f, v1: vec3f, v2: vec3f, record: ptr<function, hit_record>, t_max: f32)
{
  let v1v0 = v1 - v0;
  let v2v0 = v2 - v0;
  let rov0 = r.origin - v0;

  let n = cross(v1v0, v2v0);
  let q = cross(rov0, r.direction);
  let denom = dot(r.direction, n);

  // raio paralelo ao plano do triangulo (ou triangulo degenerado): 1/denom seria infinito
  if (abs(denom) < 1.0e-12)
  {
    record.hit_anything = false;
    return;
  }

  let d = 1.0 / denom;

  let u = d * dot(-q, v2v0);
  let v = d * dot(q, v1v0);
  let t = d * dot(-n, rov0);

  if (u < 0.0 || u > 1.0 || v < 0.0 || (u + v) > 1.0)
  {
    record.hit_anything = false;
    return;
  }

  if (t < RAY_TMIN || t > t_max)
  {
    record.hit_anything = false;
    return;
  }

  let unit_normal = normalize(n);
  let front = denom < 0.0;

  record.t = t;
  record.p = ray_at(r, t);
  record.frontface = front;
  record.normal = select(-unit_normal, unit_normal, front);
  record.hit_anything = true;
}

// Caixa alinhada aos eixos (slab method). Para girar a caixa, o chamador gira o raio
// para o referencial local da caixa (veja check_ray_collision).
// Funciona tambem com o raio comecando dentro da caixa (ex.: vidro): nesse caso
// devolve a face de saida com frontface = false. A normal sempre aponta contra o raio.
fn hit_box(r: ray, center: vec3f, rad: vec3f, record: ptr<function, hit_record>, t_max: f32)
{
  // componentes ~0 da direcao viram um valor minusculo (evita 0 * infinito = NaN)
  let dir = select(r.direction, vec3f(1.0e-8), abs(r.direction) < vec3f(1.0e-8));

  let m = 1.0 / dir;
  let n = m * (r.origin - center);
  let k = abs(m) * rad;

  let t1 = -n - k;
  let t2 = -n + k;

  // tN = onde o raio entra na caixa, tF = onde ele sai
  let tN = max(max(t1.x, t1.y), t1.z);
  let tF = min(min(t2.x, t2.y), t2.z);

  if (tN > tF || tF < RAY_TMIN)
  {
    record.hit_anything = false;
    return;
  }

  // se a entrada esta atras da origem, o raio comeca dentro da caixa: usa a saida
  let entering = tN > RAY_TMIN;
  let t = select(tF, tN, entering);
  if (t > t_max)
  {
    record.hit_anything = false;
    return;
  }

  // eixo da face atingida: o maior t1 (entrada) ou o menor t2 (saida)
  var face = step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
  if (!entering)
  {
    face = step(t2.xyz, t2.yzx) * step(t2.xyz, t2.zxy);
  }

  record.t = t;
  record.p = ray_at(r, t);
  record.normal = normalize(-sign(dir) * face);
  record.frontface = entering;
  record.hit_anything = true;
}

// NOVA PRIMITIVA: cilindro finito com tampas, eixo local = Y, centrado em `center`.
// Calculamos o intervalo [t_enter, t_exit] em que o raio esta dentro do solido como a
// intersecao de dois intervalos:
//   - superficie lateral: (ox + t dx)^2 + (oz + t dz)^2 = radius^2  (equacao do 2o grau)
//   - "fatia" entre as tampas: -half_height <= oy + t dy <= half_height
// Quem limita o intervalo (lado ou tampa) define a normal. Se o raio comeca dentro
// do cilindro (vidro), usamos t_exit com a normal invertida e frontface = false.
fn hit_cylinder(r: ray, center: vec3f, radius: f32, half_height: f32, record: ptr<function, hit_record>, t_max: f32)
{
  let oc = r.origin - center;
  let d = r.direction;
  let BIG = 1.0e30;

  // 1) lateral
  let a = d.x * d.x + d.z * d.z;
  let half_b = oc.x * d.x + oc.z * d.z;
  let c = oc.x * oc.x + oc.z * oc.z - radius * radius;

  var side_in = -BIG;
  var side_out = BIG;
  if (a < 1.0e-10)
  {
    // raio paralelo ao eixo: ou esta sempre dentro do raio do cilindro, ou nunca
    if (c > 0.0)
    {
      record.hit_anything = false;
      return;
    }
  }
  else
  {
    let discriminant = half_b * half_b - a * c;
    if (discriminant < 0.0)
    {
      record.hit_anything = false;
      return;
    }

    let sqrt_discriminant = sqrt(discriminant);
    side_in = (-half_b - sqrt_discriminant) / a;
    side_out = (-half_b + sqrt_discriminant) / a;
  }

  // 2) tampas (planos y = -h e y = +h)
  var cap_in = -BIG;
  var cap_out = BIG;
  if (abs(d.y) < 1.0e-8)
  {
    // raio paralelo as tampas: so acerta se estiver entre elas
    if (abs(oc.y) > half_height)
    {
      record.hit_anything = false;
      return;
    }
  }
  else
  {
    let ta = (-half_height - oc.y) / d.y;
    let tb = (half_height - oc.y) / d.y;
    cap_in = min(ta, tb);
    cap_out = max(ta, tb);
  }

  // 3) intersecao dos dois intervalos
  let enter_by_side = side_in >= cap_in;
  let t_enter = select(cap_in, side_in, enter_by_side);
  let exit_by_side = side_out <= cap_out;
  let t_exit = select(cap_out, side_out, exit_by_side);

  if (t_enter > t_exit || t_exit < RAY_TMIN)
  {
    record.hit_anything = false;
    return;
  }

  let entering = t_enter > RAY_TMIN;
  let t = select(t_exit, t_enter, entering);
  if (t > t_max)
  {
    record.hit_anything = false;
    return;
  }

  // normal "para fora" do cilindro no ponto atingido
  let p_local = oc + t * d;
  let hit_side = select(exit_by_side, enter_by_side, entering);
  var outward = vec3f(0.0, sign(d.y), 0.0);       // saindo por uma tampa
  if (entering)
  {
    outward = vec3f(0.0, -sign(d.y), 0.0);        // entrando por uma tampa
  }
  if (hit_side)
  {
    outward = normalize(vec3f(p_local.x, 0.0, p_local.z));
  }

  record.t = t;
  record.p = ray_at(r, t);
  record.frontface = entering;
  // a normal sempre aponta contra o raio (para dentro se o raio saiu do cilindro)
  record.normal = select(-outward, outward, entering);
  record.hit_anything = true;
}
