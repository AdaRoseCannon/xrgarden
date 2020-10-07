// Original src: htt
const BITS = 3;
const TEXTURE_WIDTH = 32;
const TEXTURE_HEIGHT = 32;

import {
	DataTexture,
	RGBFormat,
	FloatType,
	RepeatWrapping,
	LinearFilter
} from 'three';

/**
 * Prepares texture for storing positions and normals for spline
 */
export function initSplineTexture(renderer) {
	if ( ! renderer.extensions.get( "OES_texture_float" ) ) {
		console.log("No OES_texture_float support for float textures.");
	}

	if ( renderer.capabilities.maxVertexTextures === 0 ) {
		console.log("No support for vertex shader textures.");
	}

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
	dataTexture.magFilter = LinearFilter;
	dataTexture.needsUpdate = true;

	return dataTexture;
}

function setTextureValue(texture, index, x, y, z, o) {
	const image = texture.image;
	// eslint-disable-next-line no-unused-vars
	const { data, width } = image;
	const i = BITS * width * (o || 0);
	data[index * BITS + i + 0] = x;
	data[index * BITS + i + 1] = y;
	data[index * BITS + i + 2] = z;
}

export function updateSplineTexture(curve, texture, uniforms) {

	curve.arcLengthDivisions = 200;
	curve.updateArcLengths()
	const splineLen = curve.getLength();
	// const pathSegment = len / splineLen // should clamp max to 1

	// updateUniform('spineOffset', 0);
	// updateUniform('pathSegment', pathSegment);
	// uniforms['pathSegment'] = 1;
	uniforms['spineLength'].value = splineLen;

	var splineCurve = curve;
	// uniform chordal centripetal
	var points = splineCurve.getSpacedPoints(TEXTURE_WIDTH - 1);
	// getPoints() - unequal arc lengths
	var frenetFrames = splineCurve.computeFrenetFrames(TEXTURE_WIDTH - 1, true);
	// console.log(frenetFrames);

	// console.log('points', points);
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
		texture: { value: splineTexture },
		pathOffset: { type: 'f', value: 0 }, // time of path curve
		pathSegment: { type: 'f', value: 1 }, // fractional length of path
		spineOffset: { type: 'f', value: 161 },
		spineLength: { type: 'f', value: 400 },
		flow: { type: 'i', value: 1 },
	};
	return uniforms;
}

export function modifyShader( material, uniforms ) {
	if (material.__ok) return;
	material.__ok = true;

	material.onBeforeCompile = ( shader ) => {

		if (shader.__modified) return;
		shader.__modified = true;

		Object.assign(shader.uniforms, uniforms);

		const vertexShader = `
		uniform sampler2D texture;

		uniform float pathOffset;
		uniform float pathSegment;
		uniform float spineOffset;
		uniform float spineLength;
		uniform int flow;

		float textureLayers = ${TEXTURE_HEIGHT}.; // look up takes (i + 0.5) / textureLayers

		${shader.vertexShader}
		`.replace(
		'#include <defaultnormal_vertex>',
		`
		vec4 worldPos = modelMatrix * vec4(position, 1.);

		bool bend = flow > 0;
		float spinePortion = bend ? (worldPos.x + spineOffset) / spineLength : 0.;
		float xWeight = bend ? 0. : 1.;
		float mt = spinePortion * pathSegment + pathOffset;

		vec3 spinePos = texture2D(texture, vec2(mt, (0.5) / textureLayers)).xyz;
		vec3 a = texture2D(texture, vec2(mt, (1. + 0.5) / textureLayers)).xyz;
		vec3 b = texture2D(texture, vec2(mt, (2. + 0.5) / textureLayers)).xyz;
		vec3 c = texture2D(texture, vec2(mt, (3. + 0.5) / textureLayers)).xyz;
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
