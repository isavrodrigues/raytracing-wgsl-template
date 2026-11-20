## WGSL Raytracer — Projeto 3 (Computação Gráfica)

Renderizador baseado em raios (**Ray Tracing**) escrito em **WGSL / WebGPU**, a partir do template do curso
([Gustavobb/raytracing-wgsl-template](https://github.com/Gustavobb/raytracing-wgsl-template)).

Gabarito de referência: <https://gubebra.itch.io/raytracing>

### Status da rubrica

| Nota | Cenas / requisito | Status |
|------|-------------------|--------|
| D  | `Basic`, `Metal`, `Fuzz` | ✅ |
| C  | `Specular`, `Emissive` | ✅ |
| C+ | `Dielectric`, `Spheres`, `Night` | ✅ |
| B  | `Cubes`, `Cornell`, `Mirror`, `Infinite` | ✅ |
| B+ | `Bunny`, `Suzanne` e **uma cena nova** (`Gallery`) | ✅ |
| A  | **Nova primitiva geométrica**: cilindro (`Cylinder`), cena `Cylinders` | ✅ |
| A+ | `Rotation`, `Everything` | ✅ |

### Como rodar

Faça um fork/clone e sirva a pasta com qualquer servidor estático (os `.wgsl` e `.obj` são carregados com `fetch`).
No Visual Studio Code: instale o [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer),
aperte `CTRL + Shift + P` e selecione `Live Server`. Precisa de um navegador com **WebGPU** (Chrome/Edge recentes).

> O shader usa **9 storage buffers** (framebuffer, acumulador, uniforms, esferas, quads, caixas, triângulos, malhas e
> cilindros). O limite padrão do WebGPU é 8, então `getGPU()` (em `src/util.js`) pede ao adaptador o limite
> `maxStorageBuffersPerShaderStage` (até 12). Placas/navegadores que suportam menos que 9 mostram uma mensagem de erro clara.

### Controles
Qualquer parâmetro pode ser alterado pelo GUI ao lado (clique no valor e use o scroll para mudar de forma suave).
Para mover a câmera use `W A S D Q E`; para girar use as setas e `X Z`.
Na pasta *Scene*, o menu *Scene* troca de cena e os botões reiniciam a cena/câmera, salvam a imagem e imprimem a cena atual
como código no console (`PrintScene`; esferas, quads, caixas e cilindros — as malhas `.obj` não são exportadas).

### O que foi implementado

**Materiais** (`material = [smoothness, absorption, specular, light]`):
- *Lambertiano* (`smoothness = 0`): espalhamento difuso.
- *Metal / Fuzz* (`smoothness > 0`): reflexão `reflect()` com desvio aleatório de tamanho `absorption` (fuzz). `specular` é a
  probabilidade do raio refletir de forma especular; o brilho especular é branco e vai sendo tingido pela cor do objeto
  conforme o material fica mais metálico.
- *Emissivo* (`light > 0`): soma `cor * light` à luz do caminho e termina o raio.
- *Dielétrico* (`smoothness < 0`): vidro, com lei de Snell, reflexão interna total e aproximação de Schlick.
  `specular` é o índice de refração e `absorption` o fuzz.

**Primitivas** (todas em `src/shaders/shapes.wgsl`, escolhidas por `check_ray_collision` em `raytracer.wgsl`):
- Esferas (inclusive raio negativo, para esferas "ocas"), quads (um lado só) e caixas.
- **Caixas com rotação**: o raio é levado para o espaço local da caixa (`rotate_ray_quaternion` com o quaternion inverso dos
  ângulos de Euler), intersecta-se a caixa alinhada aos eixos e a normal volta ao mundo com `rotate_vector`.
- **Malhas triangulares** (`Bunny`, `Suzanne`): cada malha tem `transform`, `scale` e `rotation`
  (`mundo = R · (escala · local) + transform`). O raio é transformado para o espaço local da malha (sem renormalizar a
  direção, então o parâmetro `t` é o mesmo nos dois espaços), faz-se um teste rápido contra a *bounding box* da malha e
  só então percorre-se o intervalo `[start, end)` do buffer de triângulos. A normal é levada ao mundo com
  `R · (n / escala)`. Várias malhas podem compartilhar o mesmo buffer de triângulos. `showBB = 1` desenha a bounding box (debug).
- **Cilindro (nova primitiva, nota A)**: finito, com tampas, em qualquer orientação (eixo = Y local, rotação por Euler).
  `hit_cylinder` resolve a quádrica lateral `x² + z² = r²` e os dois planos das tampas `y = ±h`, escolhe o menor `t` válido,
  funciona também com o raio começando dentro (vidro) e devolve a normal radial (lateral) ou `±Y` (tampas).

**Acumulação de frames**: o buffer `rtfb` guarda a soma dos frames (e a contagem no canal `w`); a tela mostra a média com
correção gama. Mover a câmera ou editar a cena reinicia a acumulação.

### Cilindro: como usar

```js
// new Cylinder(centro, cor, rotação (Euler, rad), [raio, meia-altura], material)
new Cylinder([0, -0.5, -3], [0.9, 0.7, 0.2], [0, 0, 1.5708], [0.3, 0.8], [1, 0, 1, 0])
```
No shader: `struct cylinder { center, size (x = raio, y = meia altura), rotation, color, material }`, no
`@group(2) @binding(5)`, e a quantidade fica em `uniforms[28]` (`cylinderCount`). O GUI (pasta *Objects*) também permite
adicionar e editar cilindros.

### Cenas novas
- `Cylinders`: vitrine da nova primitiva (em pé, deitado, inclinado, de frente para a câmera; difuso, metal, vidro e emissivo).
- `Gallery`: cena nova (B+) com o coelho e o Suzanne juntos (dois meshes no mesmo buffer de triângulos), esferas
  metálica/vidro/emissiva, caixa rotacionada, colunas de cilindros, espelho e céu de pôr do sol.

### Verificar sem GPU (headless)

Existe um script que renderiza todas as cenas em um Chromium *headless* usando o rasterizador em CPU (SwiftShader) e salva
PNGs, reportando erros de compilação do WGSL:

```
# uma vez (o script imprime este comando se faltar algo):
mkdir -p tools/.cache && cd tools/.cache && npm init -y && npm i lil-gui@0.17.0 gl-matrix@2.8.1 pngjs@7.0.0 playwright && npx playwright install chromium && cd ../..

node tools/render-scenes.cjs [--scenes Basic,Bunny] [--rez 256] [--frames 12] [--out tools/out]
```
A saída (`tools/out/*.png`, `montage.png`, `index.html`) não é versionada. Sai com código ≠ 0 se alguma cena der erro.
Como o render é em software, todas as cenas levam alguns minutos. Use `CHROMIUM_PATH=/caminho/do/chrome` para usar um
Chromium/Chrome já instalado.

### Estrutura
- `main.js` — inicialização WebGPU, buffers, GUI, câmera e loop de render.
- `src/scenes.js` — todas as cenas (cada `async function` vira uma entrada do menu; não coloque funções auxiliares aqui).
- `src/objects.js` — classes `Sphere`, `Quad`, `Box`, `Triangle`, `Mesh`, `Cylinder`.
- `src/util.js` — WebGPU, leitura de `.obj`, geração aleatória de esferas e lista de cenas.
- `src/shaders/` — `raytracer.wgsl` (câmera, materiais, `trace`, `render`), `shapes.wgsl` (interseções), `utils.wgsl`, `rng.wgsl`.

### Entrega
Via Blackboard, entregue o link do git.
