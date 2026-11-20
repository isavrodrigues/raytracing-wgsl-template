import { Sphere, Quad, Box, Cylinder, Mesh } from './objects.js';
import { loadMesh, loadMeshes, getObjBoundingBox, getSpheresRandom } from './util.js';

// ATENCAO: a lista de cenas do GUI e montada lendo este arquivo como texto (crateAllScenesList em util.js),
// entao aqui so podem existir as cenas (async + nome da cena) e getAvailableScene. Helpers vao em util.js.

const groundDefault = new Sphere([0, -1001, 0], [0.7, 0.7, 0.7], 1000, [0.9, 0.0, 0.6, 0.0]);

async function getAvailableScene(index, scenesList)
{
    let sceneName = Object.keys(scenesList)[index];
    let sceneFunction = eval(sceneName);
    return await sceneFunction();
}

async function Spheres(numSpheres = 4)
{
    let offset = [0, -1, -5];
    let spheres = [groundDefault];
    spheres = spheres.concat(getSpheresRandom(numSpheres, offset));

    spheres.push(new Sphere([offset[0], 1.3 + offset[1], offset[2]], [1.0, 1.0, 1.0], 1.3, [-1.0, 0.001, 0.9, 0.0]));
    spheres.push(new Sphere([-3.3 + offset[0], 1.3 + offset[1], offset[2]], [1.0, 0.1, 0.1], 1.3, [0.0, 0.0, 0.0, 0.0]));
    spheres.push(new Sphere([3.3 + offset[0], 1.3 + offset[1], offset[2]], [0.7, 0.7, 0.7], 1.3, [1.0, 0.0, 1.0, 0.0]));

    return {
        spheres, 
        quads: [], 
        boxes: [], 
        cylinders: [],
        triangles: [], 
        meshes: [], 
        backgroundColor1: [0.0, 0.5, 1.0], 
        backgroundColor2: [1.0, 1.0, 1.0], 
        focusDistance: 5.0, 
        focusAngle: 0.2,
        sunIntensity: 1.0,
        samplesPerPixel: 1.0,
        maxBounces: 10.0
    };
}

async function Night()
{
    let { spheres, quads, boxes, triangles, meshes, backgroundColor1, backgroundColor2 } = await Spheres();

    return {
        spheres,
        quads,
        boxes,
        cylinders: [],
        triangles,
        meshes,
        backgroundColor1: [0.0, 0.0, 0.0],
        backgroundColor2: [0.0, 0.0, 0.0],
        focusDistance: 5.0,
        focusAngle: 0.2,
        sunIntensity: 0.1,
        samplesPerPixel: 1.0,
        maxBounces: 10.0
    }
}

async function Basic()
{
    let spheres = [
        new Sphere([0, -1001, 0], [0.5, 0.5, 0.5], 1000, [0.0, 0.0, 0.0, 0.0]),
        new Sphere([-0.0, -0.5, -2.0], [1.0, 0.0, 0.0], 0.5, [0.0, 0.0, 0.0, 0.0]),
    ];

    return {
        spheres, 
        quads: [], 
        boxes: [], 
        cylinders: [],
        triangles: [], 
        meshes: [], 
        backgroundColor1: [0.0, 0.5, 1.0], 
        backgroundColor2: [1.0, 1.0, 1.0],
        focusDistance: 5.0, 
        focusAngle: 0.0,
        sunIntensity: 1.0,
        samplesPerPixel: 1.0,
        maxBounces: 10.0
    };
}

async function Metal() 
{
	let spheres = [
		new Sphere([0, -1001, 0], [0.10980392156862745, 0.12156862745098039, 0.2901960784313726], 1000, [1, 0, 0.01, 0]), 
		new Sphere([0, -0.26, -2], [0.3, 0.3, 1], 0.5, [1, 0, 1, 0]), 
		new Sphere([-1, -0.5, -2], [1, 0.3, 0.3], 0.5, [1, 0, 1, 0]), 
		new Sphere([1, -0.5, -2], [0.3, 1, 0.3], 0.5, [1, 0, 1, 0]), 
		new Sphere([0.01, 0.51, -1.9], [1, 1, 1], 0.23, [1, 0, 1, 0]), 
	];

	let quads = [
	];

	let boxes = [
	];

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders: [],
		triangles: [],
		meshes: [],
		backgroundColor1 : [0, 0.5, 1],
		backgroundColor2 : [1, 1, 1],
		focusDistance: 5,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 1,
		maxBounces: 30
	};
}

async function Fuzz() 
{
	let spheres = [
		new Sphere([0, -1001, 0], [0.21568627450980393, 0.21568627450980393, 0.40784313725490196], 1000, [0, 0, 0, 0]), 
		new Sphere([0, -0.2, -2], [1, 1, 1], 0.5, [1, 0.1, 1, 0]), 
		new Sphere([-1, -0.5, -2], [1, 1, 1], 0.5, [1, 0.5, 1, 0]), 
		new Sphere([1, -0.5, -2], [1, 1, 1], 0.5, [1, 0, 1, 0]), 
	];

	let quads = [
	];

	let boxes = [
	];

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders: [],
		triangles: [],
		meshes: [],
		backgroundColor1 : [0, 0.3803921568627451, 0.7607843137254902],
		backgroundColor2 : [1, 1, 1],
		focusDistance: 5,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 1,
		maxBounces: 30
	};
}

async function Specular() 
{
	let spheres = [
		new Sphere([0, -1001, 0], [194/255, 163/255, 1], 1000, [0.74, 0, 1, 0]), 
		new Sphere([0, -0.5, -2], [1, 1, 1], 0.5, [1, 0, 0.1, 0]), 
		new Sphere([-1, -0.5, -2], [1, 1, 1], 0.5, [1, 0, 0.02, 0]), 
		new Sphere([1, -0.5, -2], [1, 1, 1], 0.5, [1, 0, 1, 0]), 
	];

	let quads = [
	];

	let boxes = [
		new Box([0, 1.54, -2, 0], [1, 1, 1], [0, 0, 0, 0], [1.3, 0.02, 0.36, 0], [0, 0, 0, 3]), 
	];

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders: [],
		triangles: [],
		meshes: [],
		backgroundColor1 : [0, 0, 0],
		backgroundColor2 : [0.34509803921568627, 0.6039215686274509, 0.9921568627450981],
		focusDistance: 5,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 10,
		maxBounces: 30
	};
}

async function Emissive()
{
    let spheres = [
        groundDefault,
        new Sphere([.5, 0., -2.5], [1.0, 0.0, 0.0], 1.0, [0.0, 0.0, 0.0, 0.0]),
        new Sphere([-1.0, -0.5, -2.0], [1.0, 1.0, 1.0], 0.5, [0.0, 0.0, 0.0, 3.0]),
    ];

    return {
        spheres, 
        quads: [], 
        boxes: [], 
        cylinders: [],
        triangles: [], 
        meshes: [], 
        backgroundColor1: [0.0, 0.0, 0.0], 
        backgroundColor2: [0.0, 0.0, 0.0],
        focusDistance: 5.0, 
        focusAngle: 0.0,
        sunIntensity: 0.0,
        samplesPerPixel: 1.0,
        maxBounces: 10.0
    };
}

async function Dielectric()
{
    let spheres = [
        groundDefault,
        new Sphere([0.0, -0.5, -4.0], [1.0, 0.0, 0.0], 0.5, [0.0, 0.0, 0.0, 0.0]),
        new Sphere([-0.2, 0.7, -4.0], [0.0, 0.0, 1.0], 0.5, [0.0, 0.0, 0.0, 0.0]),
        new Sphere([0.0, 0.0, -2.1], [1.0, 1.0, 1.0], 1, [-1.0, 0.0, 0.9, 0.0]),
    ];

    return {
        spheres, 
        quads: [], 
        boxes: [], 
        cylinders: [],
        triangles: [], 
        meshes: [], 
        backgroundColor1: [0.0, 0.5, 1.0], 
        backgroundColor2: [1.0, 1.0, 1.0],
        focusDistance: 5.0, 
        focusAngle: 0.0,
        sunIntensity: 1.0,
        samplesPerPixel: 1.0,
        maxBounces: 10.0
    };
}

async function Cubes() 
{
	let spheres = [
		new Sphere([0, -1001, 0], [0.5, 0.5, 0.5], 1000, [0.9, 0, 0.6, 0]), 
		new Sphere([0, 0.49, -1.5], [0.4, 0.9, 0.8], 0.25, [1, 0, 1, 0]), 
	];

	let quads = [
	];

	let boxes = [
		new Box([-1, 0, -2.23, 0], [1, 0, 0], [0, 0, 0, 0], [0.5, 0.5, 0.5, 0], [0, 0, 0, 0]), 
		new Box([1, 0, -2.21, 0], [1, 1, 1], [0, 0, 0, 0], [0.5, 0.5, 0.5, 0], [0, 0, 0, 0]), 
	];

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders: [],
		triangles: [],
		meshes: [],
		backgroundColor1 : [0, 0.5, 1],
		backgroundColor2 : [1, 1, 1],
		focusDistance: 5,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 1,
		maxBounces: 10
	};
}

async function Cornell() 
{
	let spheres = [
		new Sphere([-0.5, -0.4, -1.4], [1, 1, 1], 0.5, [0, 0, 0, 0]), 
		new Sphere([0.07, 0.42, -1.5], [0.4, 0.9, 0.8], 0.39, [1, 0, 0.7, 0]), 
	];

	let quads = [

		new Quad([-1, -1, 0, 0], [0, 0, -2, 0], [0, 2, 0, 0], [1, 0, 0, 0], [0, 0, 0, 0]), 

		new Quad([-1, -1, -2, 0], [2, 0, 0, 0], [0, 2, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]), 

		new Quad([-1, 1, -2, 0], [2, 0, 0, 0], [0, 0, 2, 0], [1, 1, 1, 1], [0, 0, 0, 0]), 

		new Quad([1, -1, -2, 0], [0, 0, 2, 0], [0, 2, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]), 

		new Quad([1, -1, -2, 0], [-2, 0, 0, 0], [0, 0, 2, 0], [1, 1, 1, 1], [0, 0, 0, 0]), 

		new Quad([1, -1, 0, 0], [-2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 1, 1], [0, 0, 0, 0]), 

		new Quad([-0.5, 0.99, -1.5, 0], [1, 0, 0, 0], [0, 0, 1, 0], [1, 1, 1, 1], [0, 0, 0, 5]), 
	];

	let boxes = [
		new Box([0.5, -0.5, -1.36, 0], [0.03137254901960784, 0.23529411764705882, 0.6509803921568628], [0, 0, 0, 0], [0.24, 0.5, 0.24, 0], [0.5, 0.5, 0.5, 0]), 
	];

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders: [],
		triangles: [],
		meshes: [],
		backgroundColor1 : [0, 0, 0],
		backgroundColor2 : [0, 0, 0],
		focusDistance: 5,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 5,
		maxBounces: 10
	};
}

async function Mirror() 
{
	let spheres = [
		new Sphere([0.3, 0, -1.4], [0.023529411764705882, 0.9764705882352941, 0.7843137254901961], 0.5, [0, 0, 0, 0]), 
		new Sphere([-0.5, -0.4, -1.4], [0.34901960784313724, 0, 1], 0.3, [1, 0, 0.5, 0]), 
	];

	let quads = [

		new Quad([-1, -1, 0, 0], [0, 0, -2, 0], [0, 2, 0, 0], [1, 1, 1, 0], [1, 0.01, 1, 0]), 

		new Quad([-1, -1, -2, 0], [2, 0, 0, 0], [0, 2, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]), 

		new Quad([-1, 1, -2, 0], [2, 0, 0, 0], [0, 0, 2, 0], [1, 1, 1, 1], [0, 0, 0, 0]), 

		new Quad([1, -1, -2, 0], [0, 0, 2, 0], [0, 2, 0, 0], [1, 1, 1, 0], [1, 0.01, 1, 0]), 

		new Quad([1, -1, -2, 0], [-2, 0, 0, 0], [0, 0, 2, 0], [1, 1, 1, 1], [0, 0, 0, 0]), 

		new Quad([1, -1, 0, 0], [-2, 0, 0, 0], [0, 2, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]), 

		new Quad([-0.5, 0.99, -1.5, 0], [1, 0, 0, 0], [0, 0, 1, 0], [1, 1, 1, 1], [0, 0, 0, 2]), 
	];

	let boxes = [
	];

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders: [],
		triangles: [],
		meshes: [],
		backgroundColor1 : [0, 0, 0],
		backgroundColor2 : [0, 0, 0],
		focusDistance: 5,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 3,
		maxBounces: 10
	};
}

async function Infinite() 
{
	let spheres = [
		new Sphere([0.3, 0, -1], [0.4, 0.9, 0.8], 0.3, [0, 0, 0, 0]), 
		new Sphere([-0.5, -0.4, -1], [1, 1, 1], -0.25, [0, 0, 0, 1]), 
		new Sphere([-0.32, 0.5, -1], [1, 1, 1], 0.2, [1, 0, 1, 0]), 
	];

	let quads = [

		new Quad([-1, -1, 0, 0], [0, 0, -2, 0], [0, 2, 0, 0], [1, 1, 1, 1], [1, 0.005, 1, 0]), 

		new Quad([-1, -1, -2, 0], [2, 0, 0, 0], [0, 2, 0, 0], [1, 1, 1, 1], [1, 0.005, 1, 0]), 

		new Quad([-1, 1, -2, 0], [2, 0, 0, 0], [0, 0, 2, 0], [1, 1, 1, 1], [1, 0.005, 1, 0]), 

		new Quad([1, -1, -2, 0], [0, 0, 2, 0], [0, 2, 0, 0], [1, 1, 1, 1], [1, 0.005, 1, 0]), 

		new Quad([1, -1, -2, 0], [-2, 0, 0, 0], [0, 0, 2, 0], [1, 1, 1, 1], [1, 0.005, 1, 0]), 

		new Quad([1, -1, 0, 0], [-2, 0, 0, 0], [0, 2, 0, 0], [1, 1, 1, 1], [1, 0.005, 1, 0]), 
	];

	let boxes = [
	];

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders: [],
		triangles: [],
		meshes: [],
		backgroundColor1 : [0, 0, 0],
		backgroundColor2 : [0, 0, 0],
		focusDistance: 5,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 5,
		maxBounces: 10
	};
}

async function Bunny()
{
    let offset = [0, -1, -2];
    let spheres = [groundDefault];
    spheres = spheres.concat(getSpheresRandom(3, offset));

    let { verticesMesh, trianglesMesh, triangles } = await loadMesh('./media/stanford-bunny.obj');
    
    let meshes = [new Mesh([0, -1, -4], [2, 2, 2], [0, .2, 0], [0.4, 0.3, 0.6, 1.0], [1.0, 0.0, 0.5, 0.0], 0, 0, triangles.length)];
    let { min, max } = getObjBoundingBox(verticesMesh);
    meshes[0].setBoundingBox(min, max);

    return {
        spheres, 
        quads: [], 
        boxes: [], 
        cylinders: [],
        triangles, 
        meshes, 
        backgroundColor1: [0.0, 0.5, 1.0], 
        backgroundColor2: [1.0, 1.0, 1.0], 
        focusDistance: 4.0, 
        focusAngle: 0.2,
        sunIntensity: 1.0,
        samplesPerPixel: 1.0,
        maxBounces: 10.0
    };
}

async function Suzanne()
{
    let { verticesMesh, trianglesMesh, triangles } = await loadMesh('./media/suzanne.obj');
    let meshes = [new Mesh([0, 0.0, -6], [2, 2, 2], [0, 0, 0], [0.6, 0.3, 0.7, 1.0], [0.0, 0.0, 0.0, 0.0], 0, 0, triangles.length)];
    let { min, max } = getObjBoundingBox(verticesMesh);
    meshes[0].setBoundingBox(min, max);

    return {
        spheres: [], 
        quads: [], 
        boxes: [], 
        cylinders: [],
        triangles, 
        meshes, 
        backgroundColor1: [0.0, 0.5, 1.0], 
        backgroundColor2: [1.0, 1.0, 1.0], 
        focusDistance: 5.0, 
        focusAngle: 0.2,
        sunIntensity: 1.0,
        samplesPerPixel: 1.0,
        maxBounces: 10.0
    };
}

async function Rotation() 
{
	let spheres = [
		new Sphere([0, -1001, 0], [0.5, 0.5, 0.5], 1000, [0.9, 0, 0.6, 0]), 
		new Sphere([0, -0.58, -2.34], [0.8, 0.1, 0.2], 0.4, [0, 0.001, 0, 0]), 
		new Sphere([0.54, -0.81, -1.8], [0.4, 0.9, 0.8], 0.19, [0, 0, 0, 3]), 
	];

	let quads = [
	];

	let boxes = [
		new Box([-1.37, 0.6, -2.68, 0], [1, 1, 1], [-0.46, 5.32, 0.23, 0], [0.89, 1.41, 0.15, 0], [1, 0, 0.9, 0]), 
		new Box([0.49, 0.07, -2.04, 0], [1, 1, 1], [-0.56, -0.42, 0.31, 0], [0.2, 0.2, 0.2, 0], [0, 0, 0, 0]), 
		new Box([1.21, -0.36, -1.74, 0], [1, 1, 1], [-1.21, -3.65, -1.76, 0], [0.3, 0.3, 0.3, 0], [1, 0.03, 1, 0]), 
		new Box([1.13, -0.71, -1.17, 0], [1, 1, 1], [1.13, -0.73, 0, 0], [0.81, 0.01, 0.94, 0], [1, 0.01, 0.8, 0]), 
	];

	let { verticesMesh, trianglesMesh, triangles } = await loadMesh('./media/stanford-bunny.obj');
    let meshes = [new Mesh([-0.69, -1, -1.77], [.4, .4, .4], [0, -.75, 0], [0.4, 0.7, 0.6, 1.0], [1.0, 0.0, 0.5, 0.0], 0, 0, triangles.length)];
    let { min, max } = getObjBoundingBox(verticesMesh);
    meshes[0].setBoundingBox(min, max);

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders: [],
		triangles: triangles,
		meshes: meshes,
		backgroundColor1 : [1, 1, 1],
		backgroundColor2 : [0.06274509803921569, 0.0784313725490196, 0.19607843137254902],
		focusDistance: 3,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 1,
		maxBounces: 10
	};
}

async function Everything()
{
    let offset = [0, -1, -2];
    let spheres = [groundDefault];
    spheres = spheres.concat(getSpheresRandom(3, offset));

    let boxes = [new Box([-1.0, 0.0, -2.6], [0.3, 0.5, 0.3], [0.0, -0.6, 0.0], [0.3, 0.9, 0.3], [1.0, 0.0, 0.9, 0.0]),
                new Box([1.0, 0.00, -2.6], [0.1, 0.2, 0.5], [0.0, -0.6, 0.0], [0.3, 0.9, 0.3], [-1.0, 0.0, 0.0, 0.0]),
                new Box([0.0, 0.00, -2.6], [0.5, 0.0, 0.5], [0.6, -0.6, 0.1], [0.3, 0.3, 0.3], [0.0, 0.0, 0.0, 0.0]),
                new Box([0.0, 1.0, -2.6], [0.3, 0.3, 0.3], [-0.6, -0.2, -0.1], [0.3, 0.3, 0.3], [1.0, 0.0, 0.9, 0.0]),
    ];

    let { verticesMesh, trianglesMesh, triangles } = await loadMesh('./media/suzanne.obj');
    let meshes = [new Mesh([0, -0.6, -2], [.25, .25, .25], [0.5, 0.3, 0.2], [0.6, 0.3, 0.7, 1.0], [1.0, 0.0, 0.7, 0.0], 0, 0, triangles.length)];
    let { min, max } = getObjBoundingBox(verticesMesh);
    meshes[0].setBoundingBox(min, max);

    return {
        spheres: spheres, 
        quads: [], 
        boxes: boxes, 
        cylinders: [],
        triangles: triangles, 
        meshes: meshes,
        backgroundColor1: [0.0, 0.5, 1.0], 
        backgroundColor2: [1.0, 1.0, 1.0], 
        focusDistance: 3.0, 
        focusAngle: 0.0,
        sunIntensity: 1.0,
        samplesPerPixel: 1.0,
        maxBounces: 10.0
    };
}

// Vitrine do novo primitivo (cilindro): em pe, deitado, inclinado, de frente para a camera;
// materiais difuso, metal, vidro (smoothness -1, specular = indice de refracao) e emissivo.
async function Cylinders()
{
	let spheres = [
		groundDefault,
		new Sphere([1.6, -0.7, -2.5], [0.9, 0.3, 0.3], 0.3, [0, 0, 0, 0]),
	];

	let cylinders = [
		// em pe, difuso
		new Cylinder([-2.4, -0.2, -4.3], [0.85, 0.2, 0.2], [0, 0, 0], [0.5, 0.8], [0, 0, 0, 0]),
		// em pe, metal dourado
		new Cylinder([-1.0, 0.0, -4.6], [1.0, 0.8, 0.35], [0, 0, 0], [0.35, 1.0], [1, 0.05, 1, 0]),
		// deitado (eixo ao longo de X), difuso
		new Cylinder([-0.2, -0.7, -2.9], [0.2, 0.8, 0.7], [0, 0, 1.5708], [0.3, 0.8], [0, 0, 0, 0]),
		// vidro (indice de refracao 1.5)
		new Cylinder([1.2, -0.45, -3.4], [1, 1, 1], [0, 0, 0], [0.4, 0.55], [-1, 0, 1.5, 0]),
		// haste emissiva inclinada, flutuando
		new Cylinder([0.3, 1.4, -4.0], [1.0, 0.85, 0.55], [0, 0, 0.7], [0.1, 1.1], [0, 0, 0, 5]),
		// "roda" de frente para a camera (eixo ao longo de Z), brilhante
		new Cylinder([2.5, -0.5, -4.5], [0.55, 0.3, 0.85], [1.5708, 0, 0], [0.5, 0.25], [0.3, 0.1, 0.4, 0]),
		// inclinado, apoiado na borda da tampa
		new Cylinder([-1.8, -0.38, -2.8], [0.25, 0.4, 0.9], [0, 0, 0.5], [0.2, 0.6], [0.5, 0, 0.3, 0]),
	];

	return {
		spheres : spheres,
		quads : [],
		boxes : [],
		cylinders : cylinders,
		triangles: [],
		meshes: [],
		backgroundColor1 : [0, 0.5, 1],
		backgroundColor2 : [1, 1, 1],
		focusDistance: 5,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 1,
		maxBounces: 12
	};
}

// Cena nova (B+): "galeria" ao entardecer com tudo junto: coelho em um pedestal redondo e Suzanne dourada
// em uma coluna (duas malhas no mesmo buffer de triangulos), esfera de vidro, esfera cromada, caixa
// rotacionada, poste de luz quente e um painel espelhado ao fundo.
async function Gallery()
{
	let { triangles, ranges } = await loadMeshes(['./media/stanford-bunny.obj', './media/suzanne.obj']);

	// coelho (base do modelo em y ~ 0) em cima do pedestal, virado um pouco para a camera
	let bunny = new Mesh([-1.5, -0.8, -4.0], [1.4, 1.4, 1.4], [0, 0.5, 0], [0.95, 0.6, 0.5, 1.0], [0.35, 0, 0.45, 0], 0, ranges[0].start, ranges[0].end);
	bunny.setBoundingBox(ranges[0].min, ranges[0].max);

	// Suzanne (centrada na origem) sobre a coluna, espelho dourado levemente fosco
	let suzanne = new Mesh([1.5, 0.65, -4.0], [0.7, 0.7, 0.7], [0, -0.5, 0], [1.0, 0.78, 0.35, 1.0], [1, 0.05, 0.9, 0], 0, ranges[1].start, ranges[1].end);
	suzanne.setBoundingBox(ranges[1].min, ranges[1].max);

	let spheres = [
		// chao arenoso levemente brilhante
		new Sphere([0, -1001, 0], [0.72, 0.55, 0.42], 1000, [0.7, 0, 0.25, 0]),
		// vidro no centro
		new Sphere([-0.1, -0.6, -2.8], [1, 1, 1], 0.4, [-1, 0, 1.5, 0]),
		// esfera cromada
		new Sphere([2.4, -0.7, -2.6], [0.9, 0.9, 0.95], 0.3, [1, 0, 1, 0]),
		// lampada quente no chao
		new Sphere([-0.75, -0.78, -2.0], [1.0, 0.75, 0.4], 0.22, [0, 0, 0, 4]),
		// luminaria no alto do poste
		new Sphere([-3.8, 1.0, -5.0], [1.0, 0.8, 0.5], 0.3, [0, 0, 0, 5]),
	];

	let quads = [
		// painel espelhado ao fundo (normal para +Z, de frente para a camera)
		new Quad([-4, -1, -7.5, 0], [8, 0, 0, 0], [0, 4, 0, 0], [0.92, 0.95, 1.0, 1], [1, 0.01, 1, 0]),
	];

	let boxes = [
		// cubo rotacionado azul laqueado
		new Box([0.9, -0.62, -2.5, 0], [0.25, 0.45, 0.85], [0, 0.7, 0, 0], [0.38, 0.38, 0.38, 0], [0.5, 0, 0.3, 0]),
	];

	let cylinders = [
		// pedestal do coelho
		new Cylinder([-1.5, -0.9, -4.0], [0.85, 0.85, 0.8], [0, 0, 0], [1.3, 0.1], [0.3, 0, 0.2, 0]),
		// coluna da Suzanne
		new Cylinder([1.5, -0.5, -4.0], [0.9, 0.88, 0.82], [0, 0, 0], [0.8, 0.5], [0.3, 0, 0.2, 0]),
		// poste de luz
		new Cylinder([-3.8, -0.1, -5.0], [0.15, 0.15, 0.18], [0, 0, 0], [0.25, 0.9], [1, 0.1, 0.6, 0]),
	];

	return {
		spheres : spheres,
		quads : quads,
		boxes : boxes,
		cylinders : cylinders,
		triangles: triangles,
		meshes: [bunny, suzanne],
		backgroundColor1 : [1.0, 0.72, 0.5],
		backgroundColor2 : [0.3, 0.4, 0.75],
		focusDistance: 4,
		focusAngle: 0,
		sunIntensity: 1,
		samplesPerPixel: 2,
		maxBounces: 12
	};
}

export { getAvailableScene };