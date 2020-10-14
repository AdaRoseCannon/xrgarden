// Original src: https://github.com/zz85/threejs-path-flow
const BITS = 3;
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 4; // Ideally this should be able to be set to high powers of 2 but the parts from further down the texture get warped in that situation

import {
	DataTexture,
	RGBFormat,
	FloatType,
	RepeatWrapping,
	Mesh,
	InstancedMesh,
	NearestFilter,
	DynamicDrawUsage,
	Matrix4
} from 'three';

/**
 * Prepares texture for storing positions and normals for spline
 */
export function initSplineTexture(numberOfCurves) {
	const dataArray = new Float32Array( TEXTURE_WIDTH * TEXTURE_HEIGHT * numberOfCurves * BITS );
	const dataTexture = new DataTexture(
		dataArray,
		TEXTURE_WIDTH,
		TEXTURE_HEIGHT * numberOfCurves,
		RGBFormat,
		FloatType
	);

	dataTexture.wrapS = RepeatWrapping;
	dataTexture.wrapY = RepeatWrapping;
	dataTexture.magFilter = NearestFilter;
	dataTexture.needsUpdate = true;

	return dataTexture;
}

export function updateSplineTexture(texture, splineCurve, offset) {

	const numberOfPoints = Math.floor(TEXTURE_WIDTH * (TEXTURE_HEIGHT/4));
	splineCurve.arcLengthDivisions = numberOfPoints/2;
	splineCurve.updateArcLengths();
	const points = splineCurve.getSpacedPoints(numberOfPoints);
	const frenetFrames = splineCurve.computeFrenetFrames(numberOfPoints, true);

	for (let i = 0; i < numberOfPoints; i++) {
		let rowOffset = Math.floor(i / TEXTURE_WIDTH);
		let rowIndex = i % TEXTURE_WIDTH;

		let pt = points[i];
		setTextureValue(texture, rowIndex, pt.x, pt.y, pt.z, 0 + rowOffset + (TEXTURE_HEIGHT * offset));
		pt = frenetFrames.tangents[i];
		setTextureValue(texture, rowIndex, pt.x, pt.y, pt.z, 1 + rowOffset + (TEXTURE_HEIGHT * offset));
		pt = frenetFrames.normals[i];
		setTextureValue(texture, rowIndex, pt.x, pt.y, pt.z, 2 + rowOffset + (TEXTURE_HEIGHT * offset));
		pt = frenetFrames.binormals[i];
		setTextureValue(texture, rowIndex, pt.x, pt.y, pt.z, 3 + rowOffset + (TEXTURE_HEIGHT * offset));
	}

	texture.needsUpdate = true;
}

function setTextureValue(texture, index, x, y, z, o) {
	const image = texture.image;
	const { data } = image;
	const i = BITS * TEXTURE_WIDTH * o; // Row Offset
	data[index * BITS + i + 0] = x;
	data[index * BITS + i + 1] = y;
	data[index * BITS + i + 2] = z;
}

export function getUniforms(splineTexture) {
	const uniforms = {
		spineTexture: { value: splineTexture },
		pathOffset: { type: 'f', value: 0 }, // time of path curve
		pathSegment: { type: 'f', value: 1 }, // fractional length of path
		spineOffset: { type: 'f', value: 161 },
		spineLength: { type: 'f', value: 400 },
		flow: { type: 'i', value: 1 },
	};
	return uniforms;
}

export function modifyShader(material, uniforms, numberOfCurves) {
	uniforms = uniforms || getUniforms();
	if (material.__ok) return;
	material.__ok = true;

	material.onBeforeCompile = (shader) => {

		if (shader.__modified) return;
		shader.__modified = true;

		Object.assign(shader.uniforms, uniforms);

		const vertexShader = `
		uniform sampler2D spineTexture;
		uniform float pathOffset;
		uniform float pathSegment;
		uniform float spineOffset;
		uniform float spineLength;
		uniform int flow;

		float textureLayers = ${TEXTURE_HEIGHT * numberOfCurves}.;
		float textureStacks = ${TEXTURE_HEIGHT/4}.;

		${shader.vertexShader}
		`.replace(
		'#include <defaultnormal_vertex>',
		`
		vec4 worldPos = modelMatrix * vec4(position, 1.);

		bool bend = flow > 0;
		float xWeight = bend ? 0. : 1.;

		#ifdef USE_INSTANCING
		float pathOffsetFromInstanceMatrix = instanceMatrix[3][2];
		float spineLengthFromInstanceMatrix = instanceMatrix[3][0];
		float spinePortion = bend ? (worldPos.x + spineOffset) / spineLengthFromInstanceMatrix : 0.;
		float mt = (spinePortion * pathSegment + pathOffset + pathOffsetFromInstanceMatrix)*textureStacks;
		#else
		float spinePortion = bend ? (worldPos.x + spineOffset) / spineLength : 0.;
		float mt = (spinePortion * pathSegment + pathOffset)*textureStacks;
		#endif

		mt = mod(mt, textureStacks);
		float rowOffset = floor(mt);

		#ifdef USE_INSTANCING
		rowOffset += instanceMatrix[3][1] * ${TEXTURE_HEIGHT}.;
		#endif

		vec3 spinePos = texture(spineTexture, vec2(mt, (0. + rowOffset + 0.5) / textureLayers)).xyz;
		vec3 a =        texture(spineTexture, vec2(mt, (1. + rowOffset + 0.5) / textureLayers)).xyz;
		vec3 b =        texture(spineTexture, vec2(mt, (2. + rowOffset + 0.5) / textureLayers)).xyz;
		vec3 c =        texture(spineTexture, vec2(mt, (3. + rowOffset + 0.5) / textureLayers)).xyz;
		mat3 basis = mat3(a, b, c);

		vec3 transformed = basis
			* vec3(worldPos.x * xWeight, worldPos.y * 1., worldPos.z * 1.)
			+ spinePos;

		vec3 transformedNormal = normalMatrix * (basis * objectNormal);
		`
	).replace(
		'#include <begin_vertex>',
		''
	).replace(
		'#include <project_vertex>',
		`
			vec4 mvPosition = viewMatrix * vec4( transformed, 1.0 );
			// vec4 mvPosition = viewMatrix * worldPos;
			gl_Position = projectionMatrix * mvPosition;
			`
	)

		shader.vertexShader = vertexShader
	}

	return uniforms;
}

/**
 * Ideally this would perform the material changes before cloning
 * so that they all share the same material making it much more
 * efficient but as far as I can tell there is currently no way
 * of doing that with beforeCompile.
 */
export class Flow {
	constructor(mesh, numberOfCurves=1) {
		const obj3D = mesh.clone();
		const splineTexure = initSplineTexture(numberOfCurves);
		const uniforms = getUniforms(splineTexure);
		obj3D.traverse(function (child) {
			if (
				child instanceof Mesh ||
				child instanceof InstancedMesh
			) {
				child.material = child.material.clone();
				modifyShader( child.material, uniforms, numberOfCurves );
			}
		});

		this.curveArray = new Array(numberOfCurves);
		this.curveLengthArray = new Array(numberOfCurves);
		this.currentCurveCount = 0;

		this.object3D = obj3D;
		this.splineTexure = splineTexure;
		this.uniforms = uniforms;
	}

	updateCurve(index, curve) {
		if (index >= this.curveArray.length) throw Error('Index out of range for Flow');
		const curveLength = curve.getLength();
		this.uniforms.spineLength.value = curveLength;
		this.curveLengthArray[index] = curveLength;
		this.curveArray[index] = curve;
		updateSplineTexture(this.splineTexure, curve, index);
	}

	moveAlongCurve(amount) {
		this.uniforms.pathOffset.value += amount;
	}
}
const matrix = new Matrix4();
export class InstancedFlow extends Flow {
	constructor(count, curveCount, geometry, material) {
		const mesh = new InstancedMesh(
			geometry,
			material,
			count
		);
		mesh.instanceMatrix.setUsage(DynamicDrawUsage);
		super(mesh, curveCount);

		this.offsets = new Array(count).fill(0);
		this.whichCurve = new Array(count).fill(0);
		this.count = count;
	}
	writeChanges(index) {
		matrix.makeTranslation(
			this.curveLengthArray[this.whichCurve[index]],
			this.whichCurve[index],
			this.offsets[index]
		);
		this.object3D.setMatrixAt(index, matrix);
		this.object3D.instanceMatrix.needsUpdate = true;
	}
	moveIndividualAlongCurve(index, offset) {
		this.offsets[index] += offset;
		this.writeChanges(index);
	}
	setCurve(index, curveNo) {
		if (isNaN(curveNo)) throw Error("curve index being set is Not a Number (NaN)")
		this.whichCurve[index] = curveNo;
		this.writeChanges(index);
	}
}