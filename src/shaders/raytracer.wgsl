const THREAD_COUNT = 16;
const RAY_TMIN = 0.0001;
const RAY_TMAX = 100.0;
const PI = 3.1415927f;
const FRAC_1_PI = 0.31830987f;
const FRAC_2_PI = 1.5707964f;

@group(0) @binding(0)  
  var<storage, read_write> fb : array<vec4f>;

@group(0) @binding(1)
  var<storage, read_write> rtfb : array<vec4f>;

@group(1) @binding(0)
  var<storage, read_write> uniforms : array<f32>;

@group(2) @binding(0)
  var<storage, read_write> spheresb : array<sphere>;

@group(2) @binding(1)
  var<storage, read_write> quadsb : array<quad>;

@group(2) @binding(2)
  var<storage, read_write> boxesb : array<box>;

@group(2) @binding(3)
  var<storage, read_write> trianglesb : array<triangle>;

@group(2) @binding(4)
  var<storage, read_write> meshb : array<mesh>;

@group(2) @binding(5)
  var<storage, read_write> cylindersb : array<cylinder>;

struct ray {
  origin : vec3f,
  direction : vec3f,
};

struct sphere {
  transform : vec4f,
  color : vec4f,
  material : vec4f,
};

struct quad {
  Q : vec4f,
  u : vec4f,
  v : vec4f,
  color : vec4f,
  material : vec4f,
};

struct box {
  center : vec4f,
  radius : vec4f,
  rotation: vec4f,
  color : vec4f,
  material : vec4f,
};

struct triangle {
  v0 : vec4f,
  v1 : vec4f,
  v2 : vec4f,
};

struct mesh {
  transform : vec4f,
  scale : vec4f,
  rotation : vec4f,
  color : vec4f,
  material : vec4f,
  min : vec4f,
  max : vec4f,
  show_bb : f32,
  start : f32,
  end : f32,
};

// cilindro: center.xyz = centro, size.x = raio, size.y = metade da altura (eixo Y local),
// rotation.xyz = angulos de Euler (mesma convencao das caixas)
struct cylinder {
  center : vec4f,
  size : vec4f,
  rotation : vec4f,
  color : vec4f,
  material : vec4f,
};

struct material_behaviour {
  scatter : bool,
  direction : vec3f,
};

struct camera {
  origin : vec3f,
  lower_left_corner : vec3f,
  horizontal : vec3f,
  vertical : vec3f,
  u : vec3f,
  v : vec3f,
  w : vec3f,
  lens_radius : f32,
};

struct hit_record {
  t : f32,
  p : vec3f,
  normal : vec3f,
  object_color : vec4f,
  object_material : vec4f,
  frontface : bool,
  hit_anything : bool,
};

fn ray_at(r: ray, t: f32) -> vec3f
{
  return r.origin + t * r.direction;
}

fn get_ray(cam: camera, uv: vec2f, rng_state: ptr<function, u32>) -> ray
{
  var rd = cam.lens_radius * rng_next_vec3_in_unit_disk(rng_state);
  var offset = cam.u * rd.x + cam.v * rd.y;
  return ray(cam.origin + offset, normalize(cam.lower_left_corner + uv.x * cam.horizontal + uv.y * cam.vertical - cam.origin - offset));
}

fn get_camera(lookfrom: vec3f, lookat: vec3f, vup: vec3f, vfov: f32, aspect_ratio: f32, aperture: f32, focus_dist: f32) -> camera
{
  var camera = camera();
  camera.lens_radius = aperture / 2.0;

  var theta = degrees_to_radians(vfov);
  var h = tan(theta / 2.0);
  var w = aspect_ratio * h;

  camera.origin = lookfrom;
  camera.w = normalize(lookfrom - lookat);
  camera.u = normalize(cross(vup, camera.w));
  camera.v = cross(camera.u, camera.w);

  camera.lower_left_corner = camera.origin - w * focus_dist * camera.u - h * focus_dist * camera.v - focus_dist * camera.w;
  camera.horizontal = 2.0 * w * focus_dist * camera.u;
  camera.vertical = 2.0 * h * focus_dist * camera.v;

  return camera;
}

fn envoriment_color(direction: vec3f, color1: vec3f, color2: vec3f) -> vec3f
{
  var unit_direction = normalize(direction);
  var t = 0.5 * (unit_direction.y + 1.0);
  var col = (1.0 - t) * color1 + t * color2;

  var sun_direction = normalize(vec3(uniforms[13], uniforms[14], uniforms[15]));
  var sun_color = int_to_rgb(i32(uniforms[17]));
  var sun_intensity = uniforms[16];
  var sun_size = uniforms[18];

  var sun = clamp(dot(sun_direction, unit_direction), 0.0, 1.0);
  col += sun_color * max(0, (pow(sun, sun_size) * sun_intensity));

  return col;
}

// Procura o objeto mais proximo atingido pelo raio (entre RAY_TMIN e t_max).
// Caixas, cilindros e malhas podem estar rotacionados: em vez de girar o objeto,
// giramos o RAIO para o referencial local do objeto, fazemos o teste la, e depois
// trazemos a normal de volta para o mundo. O ponto de impacto e sempre calculado
// com o raio original (ray_at(r, t)), ja que t e o mesmo nos dois referenciais.
fn check_ray_collision(r: ray, t_max: f32) -> hit_record
{
  var spheresCount = i32(uniforms[19]);
  var quadsCount = i32(uniforms[20]);
  var boxesCount = i32(uniforms[21]);
  var trianglesCount = i32(uniforms[22]);
  var meshCount = i32(uniforms[27]);
  var cylindersCount = i32(uniforms[28]);

  var record = hit_record(RAY_TMAX, vec3f(0.0), vec3f(0.0), vec4f(0.0), vec4f(0.0), false, false);
  var closest = record;

  for (var i = 0; i < spheresCount; i = i + 1)
  {
    var candidate = record;
    hit_sphere(spheresb[i].transform.xyz, spheresb[i].transform.w, r, &candidate, min(t_max, closest.t));
    if (candidate.hit_anything)
    {
      candidate.object_color = spheresb[i].color;
      candidate.object_material = spheresb[i].material;
      closest = candidate;
    }
  }

  for (var i = 0; i < quadsCount; i = i + 1)
  {
    var candidate = record;
    hit_quad(r, quadsb[i].Q, quadsb[i].u, quadsb[i].v, &candidate, min(t_max, closest.t));
    if (candidate.hit_anything)
    {
      candidate.object_color = quadsb[i].color;
      candidate.object_material = quadsb[i].material;
      closest = candidate;
    }
  }

  // caixas (com rotacao)
  for (var i = 0; i < boxesCount; i = i + 1)
  {
    let center = boxesb[i].center.xyz;
    let q = quaternion_from_euler(boxesb[i].rotation.xyz);
    let local_ray = rotate_ray_quaternion(r, center, q_conjugate(q));

    var candidate = record;
    hit_box(local_ray, center, boxesb[i].radius.xyz, &candidate, min(t_max, closest.t));
    if (candidate.hit_anything)
    {
      candidate.p = ray_at(r, candidate.t);
      candidate.normal = normalize(rotate_vector(candidate.normal, q));
      candidate.object_color = boxesb[i].color;
      candidate.object_material = boxesb[i].material;
      closest = candidate;
    }
  }

  // cilindros (com rotacao)
  for (var i = 0; i < cylindersCount; i = i + 1)
  {
    let center = cylindersb[i].center.xyz;
    let q = quaternion_from_euler(cylindersb[i].rotation.xyz);
    let local_ray = rotate_ray_quaternion(r, center, q_conjugate(q));

    var candidate = record;
    hit_cylinder(local_ray, center, cylindersb[i].size.x, cylindersb[i].size.y, &candidate, min(t_max, closest.t));
    if (candidate.hit_anything)
    {
      candidate.p = ray_at(r, candidate.t);
      candidate.normal = normalize(rotate_vector(candidate.normal, q));
      candidate.object_color = cylindersb[i].color;
      candidate.object_material = cylindersb[i].material;
      closest = candidate;
    }
  }

  // malhas de triangulos: mundo = R * (escala * local) + transform
  for (var i = 0; i < meshCount; i = i + 1)
  {
    // evita divisao por zero se alguma escala for 0
    let scale = select(meshb[i].scale.xyz, vec3f(1.0e-6), abs(meshb[i].scale.xyz) < vec3f(1.0e-6));
    let q = quaternion_from_euler(meshb[i].rotation.xyz);
    let inv_q = q_conjugate(q);

    // raio no referencial da malha: translada, gira de volta e desfaz a escala.
    // A direcao nao e renormalizada, entao t e o mesmo no mundo e no referencial local.
    let local_ray = ray(
      rotate_vector(r.origin - meshb[i].transform.xyz, inv_q) / scale,
      rotate_vector(r.direction, inv_q) / scale
    );

    var best_t = min(t_max, closest.t);

    // early-out: se o raio nao toca a bounding box, nao testa nenhum triangulo
    if (!AABB_intersect_max(local_ray, meshb[i].min.xyz, meshb[i].max.xyz, best_t))
    {
      continue;
    }

    var mesh_hit = record;

    let first = i32(meshb[i].start);
    let last = min(i32(meshb[i].end), trianglesCount);
    for (var k = first; k < last; k = k + 1)
    {
      var candidate = record;
      hit_triangle(local_ray, trianglesb[k].v0.xyz, trianglesb[k].v1.xyz, trianglesb[k].v2.xyz, &candidate, best_t);
      if (candidate.hit_anything)
      {
        mesh_hit = candidate;
        best_t = candidate.t;
      }
    }

    // debug: desenha a bounding box da malha (show_bb > 0)
    if (meshb[i].show_bb > 0.5)
    {
      let bb_min = meshb[i].min.xyz;
      let bb_max = meshb[i].max.xyz;
      var candidate = record;
      hit_box(local_ray, 0.5 * (bb_min + bb_max), 0.5 * (bb_max - bb_min), &candidate, best_t);
      if (candidate.hit_anything)
      {
        mesh_hit = candidate;
        best_t = candidate.t;
      }
    }

    if (mesh_hit.hit_anything)
    {
      // normal local -> mundo: R * (n / escala) (a normal nao se transforma como um ponto)
      var world_normal = normalize(rotate_vector(mesh_hit.normal / scale, q));
      if (dot(world_normal, r.direction) > 0.0)
      {
        world_normal = -world_normal;
      }

      mesh_hit.p = ray_at(r, mesh_hit.t);
      mesh_hit.normal = world_normal;
      mesh_hit.object_color = meshb[i].color;
      mesh_hit.object_material = meshb[i].material;
      closest = mesh_hit;
    }
  }

  return closest;
}

fn lambertian(normal : vec3f, absorption: f32, random_sphere: vec3f, rng_state: ptr<function, u32>) -> material_behaviour
{
  var direction = normal + random_sphere;
  if (length(direction) < RAY_TMIN)
  {
    direction = normal;
  }
  return material_behaviour(true, normalize(direction));
}

fn metal(normal : vec3f, direction: vec3f, fuzz: f32, random_sphere: vec3f) -> material_behaviour
{
  // R = v - 2(v.n)n  (reflect do WGSL), com um deslocamento aleatório de tamanho `fuzz`
  let reflected = reflect(normalize(direction), normal);
  let scattered = normalize(reflected + fuzz * random_sphere);

  // se o raio ficou para dentro da superfície (por causa do fuzz), ele é absorvido
  return material_behaviour(dot(scattered, normal) > 0.0, scattered);
}

fn dielectric(normal : vec3f, r_direction: vec3f, refraction_index: f32, frontface: bool, random_sphere: vec3f, fuzz: f32, rng_state: ptr<function, u32>) -> material_behaviour
{
  // razão entre os índices: entrando (frontface) = 1/n, saindo = n
  let n = max(refraction_index, 0.01);
  let ratio = select(n, 1.0 / n, frontface);

  let unit_direction = normalize(r_direction);
  let cos_theta = min(dot(-unit_direction, normal), 1.0);
  let sin_theta = sqrt(max(1.0 - cos_theta * cos_theta, 0.0));

  // Snell: se ratio * sin(theta) > 1 não existe raio refratado (reflexão interna total)
  let cannot_refract = ratio * sin_theta > 1.0;

  // aproximação de Schlick: probabilidade de refletir em vez de refratar
  var r0 = (1.0 - ratio) / (1.0 + ratio);
  r0 = r0 * r0;
  let reflectance = r0 + (1.0 - r0) * pow(1.0 - cos_theta, 5.0);

  var direction = vec3f(0.0);
  if (cannot_refract || reflectance > rng_next_float(rng_state))
  {
    direction = reflect(unit_direction, normal);
  }
  else
  {
    direction = refract(unit_direction, normal, ratio);
  }

  return material_behaviour(true, normalize(direction + fuzz * random_sphere));
}

fn emmisive(color: vec3f, light: f32) -> material_behaviour
{
  // não espalha o raio (scatter = false); usamos o campo direction para devolver
  // a luz emitida: cor do material multiplicada pela intensidade
  return material_behaviour(false, color * light);
}

fn trace(r: ray, rng_state: ptr<function, u32>) -> vec3f
{
  var maxbounces = i32(uniforms[2]);
  var light = vec3f(0.0);
  var color = vec3f(1.0);
  var r_ = r;
  
  var backgroundcolor1 = int_to_rgb(i32(uniforms[11]));
  var backgroundcolor2 = int_to_rgb(i32(uniforms[12]));
  var behaviour = material_behaviour(true, vec3f(0.0));

  for (var j = 0; j < maxbounces; j = j + 1)
  {
    var record = check_ray_collision(r_, RAY_TMAX);
    if (!record.hit_anything)
    {
      light += color * envoriment_color(r_.direction, backgroundcolor1, backgroundcolor2);
      break;
    }

    // material emissivo (w = light): soma a luz emitida e termina o caminho do raio
    let emission = record.object_material.w;
    if (emission > 0.0)
    {
      let emitted = emmisive(record.object_color.xyz, emission);
      light += color * emitted.direction;
      break;
    }

    let random_sphere = rng_next_vec3_in_unit_sphere(rng_state);
    let smoothness = record.object_material.x;

    // smoothness 0 = difuso, 1 = metálico: interpola a direção do novo raio
    let specular = record.object_material.z;
    var surface_color = record.object_color.xyz;

    behaviour = lambertian(record.normal, record.object_material.y, random_sphere, rng_state);

    // specular = probabilidade deste raio refletir de forma especular (metal_reflect)
    // em vez de espalhar de forma difusa (lambertiano)
    if (smoothness < 0.0)
    {
      // smoothness < 0 = dielétrico (vidro). specular = índice de refração, absorption = fuzz
      behaviour = dielectric(record.normal, r_.direction, specular, record.frontface, random_sphere, record.object_material.y, rng_state);
    }
    else if (smoothness > 0.0 && rng_next_float(rng_state) < specular)
    {
      // absorption controla o fuzz: 0 = espelho perfeito, maior = mais fosco
      let metallic = metal(record.normal, r_.direction, record.object_material.y, random_sphere);
      let metal_reflect = normalize(mix(behaviour.direction, metallic.direction, smoothness));
      behaviour = material_behaviour(dot(metal_reflect, record.normal) > 0.0, metal_reflect);

      // reflexo especular de material pouco liso é branco (como o brilho do tomate);
      // quanto mais metálico, mais ele é tingido pela cor do objeto
      surface_color = mix(vec3f(1.0), surface_color, smoothness);
    }

    if (!behaviour.scatter)
    {
      break;
    }

    color *= surface_color;
    r_ = ray(record.p, behaviour.direction);
  }

  return light;
}

@compute @workgroup_size(THREAD_COUNT, THREAD_COUNT, 1)
fn render(@builtin(global_invocation_id) id : vec3u)
{
    var rez = uniforms[1];
    var time = u32(uniforms[0]);

    if (id.x >= u32(rez) || id.y >= u32(rez))
    {
        return;
    }

    // init_rng (random number generator) we pass the pixel position, resolution and frame
    var rng_state = init_rng(vec2(id.x, id.y), vec2(u32(rez)), time);

    // Get uv
    var fragCoord = vec2f(f32(id.x), f32(id.y));

    // Camera
    var lookfrom = vec3(uniforms[7], uniforms[8], uniforms[9]);
    var lookat = vec3(uniforms[23], uniforms[24], uniforms[25]);

    // Get camera
    var cam = get_camera(lookfrom, lookat, vec3(0.0, 1.0, 0.0), uniforms[10], 1.0, uniforms[6], uniforms[5]);
    var samples_per_pixel = i32(uniforms[4]);

    var color = vec3f(0.0);

    // Steps:
    for (var sample = 0; sample < samples_per_pixel; sample = sample + 1)
    {
        var uv = (fragCoord + sample_square(&rng_state)) / vec2f(rez);
        var ray_ = get_ray(cam, uv, &rng_state);
        color += trace(ray_, &rng_state);
    }
    color /= f32(samples_per_pixel);

    var map_fb = mapfb(id.xy, rez);

    // 5. Accumulate the color
    // rtfb guarda a SOMA dos frames (em espaço linear) e, no canal w, quantos frames somamos.
    // should_accumulate = 0 (câmera/cena mudou) zera a soma e recomeça a contagem.
    var should_accumulate = uniforms[3];
    var previous = rtfb[map_fb];
    var accumulated_color = previous.xyz * should_accumulate + color;
    var weight = previous.w * should_accumulate + 1.0;

    rtfb[map_fb] = vec4(accumulated_color, weight);

    // Na tela: média dos frames, e só então a correção gama
    fb[map_fb] = vec4(linear_to_gamma(accumulated_color / weight), 1.0);
}
