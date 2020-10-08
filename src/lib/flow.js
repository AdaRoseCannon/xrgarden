// Original src: htt
const BITS = 3;
const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 4;

import {
	DataTexture,
	RGBFormat,
	FloatType,
	RepeatWrapping,
	Mesh,
	DoubleSide
} from 'three';

/**
 * Prepares texture for storing positions and normals for spline
 */
export function initSplineTexture() {
	const dataArray = new Float32Array( TEXTURE_WIDTH * TEXTURE_HEIGHT * BITS );
	const dataTexture = new DataTexture(
		dataArray,
		TEXTURE_WIDTH,
		TEXTURE_HEIGHT,
		RGBFormat,
		FloatType
	);

	dataTexture.wrapS = RepeatWrapping;
	dataTexture.wrapY = RepeatWrapping;
	dataTexture.needsUpdate = true;

	return dataTexture;
}

function setTextureValue(texture, index, x, y, z, o) {
	const image = texture.image;
	const { data } = image;
	const i = BITS * TEXTURE_WIDTH * (o || 0);
	data[index * BITS + i + 0] = x;
	data[index * BITS + i + 1] = y;
	data[index * BITS + i + 2] = z;
}

export function updateSplineTexture(texture, splineCurve) {

	splineCurve.arcLengthDivisions = 200;
	splineCurve.updateArcLengths();

	var points = splineCurve.getSpacedPoints(TEXTURE_WIDTH - 1);
	var frenetFrames = splineCurve.computeFrenetFrames(TEXTURE_WIDTH - 1, true);

	for (var i = 0; i < TEXTURE_WIDTH; i++) {
		var pt = points[i];
		setTextureValue(texture, i, pt.x, pt.y, pt.z, 0);
		pt = frenetFrames.tangents[i];
		setTextureValue(texture, i, pt.x, pt.y, pt.z, 1);
		pt = frenetFrames.normals[i];
		setTextureValue(texture, i, pt.x, pt.y, pt.z, 2);
		pt = frenetFrames.binormals[i];
		setTextureValue(texture, i, pt.x, pt.y, pt.z, 3);
	}

	texture.needsUpdate = true;
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


export function modifyShader(material, uniforms) {
	uniforms = uniforms || getUniforms();
	if (material.__ok) return;
	material.__ok = true;

	material.onBeforeCompile = ( shader ) => {

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

		float textureLayers = 4.; // look up takes (i + 0.5) / textureLayers

		${shader.vertexShader}
		`.replace(
		'#include <defaultnormal_vertex>',
		`
		vec4 worldPos = modelMatrix * vec4(position, 1.);

		bool bend = flow > 0;
		float spinePortion = bend ? (worldPos.x + spineOffset) / spineLength : 0.;
		float xWeight = bend ? 0. : 1.;
		float mt = spinePortion * pathSegment + pathOffset;

		vec3 spinePos = texture(spineTexture, vec2(mt, (0.5) / textureLayers)).xyz;
		vec3 a = texture(spineTexture, vec2(mt, (1. + 0.5) / textureLayers)).xyz;
		vec3 b = texture(spineTexture, vec2(mt, (2. + 0.5) / textureLayers)).xyz;
		vec3 c = texture(spineTexture, vec2(mt, (3. + 0.5) / textureLayers)).xyz;
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
	constructor(mesh) {
		const obj3D = mesh.clone();
		const splineTexure = initSplineTexture();
		const uniforms = getUniforms(splineTexure);
		obj3D.traverse(function (child) {
			if (child instanceof Mesh) {
				child.material = child.material.clone();
				modifyShader( child.material, uniforms );
			}
		});

		this.object3D = obj3D;
		this.splineTexure = splineTexure;
		this.uniforms = uniforms;
	}

	addToCurve(curve) {
		const curveLength = curve.getLength();
		this.uniforms.spineLength.value = curveLength;
		updateSplineTexture(this.splineTexure, curve);
	}

	moveAlongCurve(amount) {
		this.uniforms.pathOffset.value += amount;
	}
}