import { Sphere, Triangle } from './objects.js';

// buffers de storage usados pelo kernel: fb, rtfb, uniforms, spheres, quads, boxes, triangles, meshes, cylinders
const REQUIRED_STORAGE_BUFFERS = 9;

function fatal(message)
{
    console.error(message);
    if (typeof alert === "function")
    {
        alert(message);
    }

    throw new Error(message);
}

async function getGPU()
{
    if (!navigator.gpu)
    {
        fatal("WebGPU nao esta disponivel neste navegador. Use um Chrome/Edge recente com WebGPU habilitado.");
    }

    var adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
    {
        fatal("Nenhum adaptador WebGPU encontrado (GPU indisponivel ou bloqueada).");
    }

    // o limite padrao e 8 buffers de storage por estagio; precisamos de 9
    var supported = adapter.limits.maxStorageBuffersPerShaderStage;
    if (supported < REQUIRED_STORAGE_BUFFERS)
    {
        fatal(`Este adaptador WebGPU suporta apenas ${supported} storage buffers por shader (precisamos de ${REQUIRED_STORAGE_BUFFERS}).`);
    }

    var gpu = await adapter.requestDevice({
        requiredLimits: { maxStorageBuffersPerShaderStage: Math.min(supported, 12) },
    });

    return {adapter, gpu};
}

async function getCanvas(rez)
{
    var canvas = document.createElement("canvas");
    var context = canvas.getContext("webgpu");
    var format = "bgra8unorm";
    canvas.style = `padding-left: 0; padding-right: 0; margin-left: auto; margin-right: auto;`;

    canvas.width = canvas.height = rez;
    document.body.appendChild(canvas);
    
    return {canvas, context, format};
}

async function getComputeBuffer(gpu, size, usage)
{
    var buffer = gpu.createBuffer({
        size: size,
        usage: usage,
    });

    return buffer;
}

async function getComputeBufferLayout(gpu, buffers)
{
    var entriesLayout = [];
    var entriesGroup = [];

    for (let i = 0; i < buffers.length; i++)
    {
        entriesLayout.push({
            visibility: GPUShaderStage.COMPUTE,
            binding: i,
            buffer: { type: buffers[i].type },
        });

        entriesGroup.push({
            binding: i,
            resource: { buffer: buffers[i].buffer },
        });
    }

    var bindGroupLayout = gpu.createBindGroupLayout({
        entries: entriesLayout,
    });

    var bindGroup = gpu.createBindGroup({
        layout: bindGroupLayout,
        entries: entriesGroup,
    });

    return { bindGroupLayout, bindGroup };
}

async function load(file)
{
    var response = await fetch(file);
    if (!response.ok)
    {
        throw new Error(`Error loading: ${file}`);
    }

    return await response.text();
}

async function getModule(gpu, paths)
{
    // os arquivos sao concatenados num unico modulo; guardamos onde cada um comeca
    // para traduzir o numero da linha do erro de volta para (arquivo, linha)
    var code = "";
    var sources = [];
    var cursor = 1;
    for (let path of paths)
    {
        let text = await load(path);
        sources.push({ path, start: cursor });
        cursor += text.split("\n").length;
        code += text + "\n";
    }

    var locate = (lineNum) => {
        let source = sources[0];
        for (let s of sources)
        {
            if (s.start <= lineNum)
            {
                source = s;
            }
        }

        return `${source.path}:${lineNum - source.start + 1}`;
    };

    var module = gpu.createShaderModule({ code });
    var info = await module.getCompilationInfo();

    var errors = 0;
    for (let message of info.messages)
    {
        let text = `[WGSL ${message.type}] ${message.message} (${locate(message.lineNum)})`;
        if (message.type === "error")
        {
            errors++;
            console.error(text);
        }
        else
        {
            console.warn(text);
        }
    }

    if (errors > 0)
    {
        throw new Error(`Could not compile shaders: ${errors} error(s), see console.`);
    }

    return module;
}

async function getRenderPipeline(gpu, rez, buffer, format)
{
    var quadShader = 
    `
        @group(0) @binding(0)  
        var<storage, read_write> pixels : array<vec4f>;

        struct VertexOutput {
        @builtin(position) Position : vec4f,
            @location(0) fragUV : vec2f,
        }
        
        @vertex
        fn vert(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
        
        const pos = array(
            vec2( 1.0,  1.0),
            vec2( 1.0, -1.0),
            vec2(-1.0, -1.0),
            vec2( 1.0,  1.0),
            vec2(-1.0, -1.0),
            vec2(-1.0,  1.0),
        );
        
        const uv = array(
            vec2(1.0, 0.0),
            vec2(1.0, 1.0),
            vec2(0.0, 1.0),
            vec2(1.0, 0.0),
            vec2(0.0, 1.0),
            vec2(0.0, 0.0),
        );

        var output : VertexOutput;
        output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
        output.fragUV = uv[VertexIndex];
        return output;
        }
        
        @fragment
        fn frag(@location(0) fragUV : vec2f) -> @location(0) vec4f {
        var color = vec4(0, 0, 0, 1.0);
        color += pixels[i32((fragUV.x * ${rez}) + floor(fragUV.y * ${rez}) * ${rez})];
        return color;
        }
    `;

    var quadShaderModule = gpu.createShaderModule({ code: quadShader });
    var renderPipeline = gpu.createRenderPipeline({
        layout: "auto",
        vertex: {
          module: quadShaderModule,
          entryPoint: "vert",
        },
        fragment: {
          module: quadShaderModule,
          entryPoint: "frag",
          targets: [
            {
              format: format,
            },
          ],
        },
        primitive: {
          topology: "triangle-list",
        },
      });

    var bindGroupLayout = gpu.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: buffer,
              offset: 0,
              size: rez * rez * 16,
            },
          },
        ],
      });

    return { renderPipeline, bindGroupLayout };
}

function RGBToInt(r, g, b)
{
    return (r << 16) | (g << 8) | b;
}

function RGBToHex(r, g, b)
{
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function IntToRGB(int)
{
    let r = ((int >> 16) & 0xFF) / 255.0;
    let g = ((int >> 8) & 0xFF) / 255.0;
    let b = (int & 0xFF) / 255.0;

    return [r, g, b];
}

async function readObj(file)
{
    let vertices = [];
    let triangles = [];
    let fileContents = await load(file);
    let lines = fileContents.split(/\r?\n/);

    for (let line of lines)
    {
        // separa por qualquer quantidade de espacos/tabs (ignora linhas vazias e comentarios)
        let parts = line.trim().split(/\s+/);

        if (parts[0] == "v")
        {
            let x = parseFloat(parts[1]);
            let y = parseFloat(parts[2]);
            let z = parseFloat(parts[3]);

            if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z))
            {
                continue;
            }

            vertices.push([x, y, z, 0.0]);
        }
        else if (parts[0] == "f")
        {
            // cada token pode ser "v", "v/vt", "v//vn" ou "v/vt/vn": so o primeiro numero importa.
            // indices negativos sao relativos ao fim da lista de vertices lida ate agora.
            let face = [];
            for (let i = 1; i < parts.length; i++)
            {
                let index = parseInt(parts[i].split("/")[0], 10);
                if (Number.isNaN(index) || index == 0)
                {
                    continue;
                }

                face.push(index < 0 ? vertices.length + index : index - 1);
            }

            // descarta faces degeneradas ou que apontam para vertices inexistentes
            if (face.length >= 3 && face.every(index => index >= 0 && index < vertices.length))
            {
                triangles.push(face);
            }
        }
    }

    return { vertices, triangles };
}

async function loadMesh(file)
{
    let { vertices: verticesMesh, triangles: trianglesMesh } = await readObj(file);
    let triangles = [];

    // triangulacao em leque: uma face (v0, v1, ..., vn) vira (v0, vi, vi+1)
    for (let face of trianglesMesh)
    {
        for (let i = 1; i < face.length - 1; i++)
        {
            triangles.push(new Triangle(verticesMesh[face[0]], verticesMesh[face[i]], verticesMesh[face[i + 1]]));
        }
    }

    return { verticesMesh, trianglesMesh, triangles };
}

// Carrega varios .obj para UM unico array de triangulos (o buffer de triangulos e compartilhado).
// ranges[i] = { start, end (exclusivo), min, max } com a bounding box do proprio arquivo,
// prontos para montar `new Mesh(..., 0, ranges[i].start, ranges[i].end)` + setBoundingBox.
async function loadMeshes(files)
{
    let triangles = [];
    let ranges = [];

    for (let file of files)
    {
        let { verticesMesh, triangles: meshTriangles } = await loadMesh(file);
        let { min, max } = getObjBoundingBox(verticesMesh);

        ranges.push({ start: triangles.length, end: triangles.length + meshTriangles.length, min, max });
        triangles = triangles.concat(meshTriangles);
    }

    return { triangles, ranges };
}

function getObjBoundingBox(vertices)
{
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];

    for (let vertex of vertices)
    {
        for (let i = 0; i < 3; i++)
        {
            min[i] = Math.min(min[i], vertex[i]);
            max[i] = Math.max(max[i], vertex[i]);
        }
    }

    return { min, max };
}

function timer(ms, callback)
{
    return new Promise(resolve => setTimeout(() => { resolve(callback()); }, ms));
}

function getSpheresRandom(numSpheres, offset)
{
    let spheres = [];
    for (let i = -numSpheres; i < numSpheres; i++)
    {
        for (let j = -numSpheres; j < numSpheres; j++)
        {
            let chooseMat = Math.random();
            let center = [i + 0.9 * Math.random() + offset[0], 0.2 + offset[1], j + 0.9 * Math.random() + offset[2]];

            if (Math.sqrt((center[0] - 4) ** 2 + (center[1] - 0.2) ** 2 + (center[2] - 0) ** 2) > 0.9)
            {
                let sphereMaterial = [];
                let albedo = [Math.random(), Math.random(), Math.random()];
                let fuzz = Math.random();
                let absorption = Math.random();
                let light = Math.random() * 5.0 + 1.0;

                if (chooseMat < 0.25)
                {
                    sphereMaterial = [0.0, 0.0, 0.0, 0.0];
                }
                else if (chooseMat < .5)
                {
                    sphereMaterial = [1.0, absorption, fuzz, 0.0];
                }
                else if (chooseMat < .75)
                {
                    sphereMaterial = [0.0, 0.0, 0.0, light];
                }
                else
                {
                    sphereMaterial = [-1.0, absorption, fuzz, 0.0];
                }

                spheres.push(new Sphere(center, albedo, Math.random() * 0.2 + 0.1, sphereMaterial));
            }
        }
    }

    return spheres;
}

async function getFunctionsInFile(filepath) {

    let fileContent = await load(filepath);

    const functionRegex = /function\s+([\w$]+)\s*\(|([\w$]+)\s*=\s*\(.*?\)\s*=>|([\w$]+)\s*:\s*function\s*\(/g;

    let match;
    const functionNames = [];

    while ((match = functionRegex.exec(fileContent)) !== null) {
        const functionName = match[1] || match[2] || match[3];
        if (functionName) {
            functionNames.push(functionName);
        }
    }

    if (functionNames.length === 0)
    {
        console.logWarning("No functions found in file: " + filepath);
    }

    return functionNames;
}

async function crateAllScenesList()
{
    let functions = await getFunctionsInFile('./src/scenes.js');

    // return { Spheres: 1, CornellBox: 2, Mirror: 3, 
    //         Infinite: 4, Night: 5, Bunny: 6, Basic: 7, 
    //         Metallic: 8, Light: 9, Cubes: 10, Dielectric: 11, 
    //         Suzanne: 12, Rotation: 13 };
    let sceneList = {};
    let funcCount = 0;
    for (let i = 0; i < functions.length; i++)
    {
        if (functions[i] == "getAvailableScene")
        {
            continue;
        }

        sceneList[functions[i]] = funcCount;
        funcCount++;
    }

    return sceneList;
}

export { getGPU, getCanvas, getComputeBuffer, getComputeBufferLayout, load, getModule, getRenderPipeline, readObj, timer, getObjBoundingBox, RGBToInt, IntToRGB, RGBToHex, loadMesh, loadMeshes, crateAllScenesList, getSpheresRandom };